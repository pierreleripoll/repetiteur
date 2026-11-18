# /// script
# requires-python = ">=3.12"
# dependencies = ["numpy", "scipy", "soundfile", "soxr", "librosa", "swift-f0", "pesto-pitch", "torch", "torchaudio"]
#
# [[tool.uv.index]]
# name = "pytorch-cpu"
# url = "https://download.pytorch.org/whl/cpu"
# explicit = true
#
# [tool.uv.sources]
# torch = { index = "pytorch-cpu" }
# torchaudio = { index = "pytorch-cpu" }
# ///
"""Le banc d'essai de la hauteur de la voix : quel détecteur pour la répétition ?

Des voix chantées dont on connaît la hauteur (vocadito : 40 extraits, 13 min, CC BY 4.0,
https://zenodo.org/records/5578807), salies comme chez nous : bruit, pièce, église, micro
de portable. Les détecteurs de l'app (pitchy, dans `web/banc/`) et des modèles neuronaux
(SwiftF0, PESTO) ou classiques (pYIN), en direct ou hors ligne.

    uv run --script banc/hauteur.py preparer     # vocadito → donnees/banc/conditions (800 Mo)
    uv run --script banc/hauteur.py python       # pYIN, SwiftF0, PESTO (25 min, 3 cœurs)
    BANC_DOSSIER=… pnpm --dir web exec vitest run banc   # pitchy, lancé par `tout`
    uv run --script banc/hauteur.py bilan        # banc/resultats.md
    uv run --script banc/hauteur.py tout

vocadito doit être dézippé dans `donnees/banc/vocadito/` (Audio/, Annotations/).
Ses dépendances (torch…) restent ici, hors du projet : un script uv.
"""

import json
import os
import subprocess
import sys
import time
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np

RACINE = Path(__file__).resolve().parent.parent
DONNEES = RACINE / "donnees" / "banc"
VOCADITO = DONNEES / "vocadito"
CONDITIONS = DONNEES / "conditions"
FE = 48000  # comme le navigateur
NIVEAU = -26.0  # dBFS, le RMS des passages chantés (micro proche)

# Les conditions : de quoi salir la voix propre.
#   piece : une pièce d'appartement (RT60 0,5 s) ; eglise : RT60 3 s, chanteur à quelques mètres ;
#   portable : la pièce, puis le micro d'un portable (coupe les graves sous 200 Hz, et les
#   aigus), un ventilateur, le niveau bas, et le décalage continu du micro du ThinkPad.
NOMS_CONDITIONS = ["propre", "bruit", "piece", "eglise", "portable"]


def db(x: float) -> float:
    return 10 ** (x / 20)


def rms(x: np.ndarray) -> float:
    return float(np.sqrt(np.mean(x.astype(np.float64) ** 2))) if len(x) else 0.0


def bruit_rose(n: int, rng: np.random.Generator) -> np.ndarray:
    blanc = np.fft.rfft(rng.standard_normal(n))
    f = np.arange(len(blanc))
    blanc[1:] /= np.sqrt(f[1:])
    blanc[0] = 0
    x = np.fft.irfft(blanc, n)
    return x / rms(x)


def reponse_salle(rt60: float, drr_db: float, rng: np.random.Generator) -> np.ndarray:
    """Une réponse impulsionnelle simple : le son direct, puis une queue de bruit qui décroît
    de 60 dB en `rt60` s, avec `drr_db` dB de son direct au-dessus de la queue."""
    from scipy.signal import butter, sosfilt

    n = int(rt60 * 1.2 * FE)
    t = np.arange(n) / FE
    queue = rng.standard_normal(n) * np.exp(-6.91 * t / rt60)
    queue[: int(0.008 * FE)] = 0  # les premières réflexions arrivent après 8 ms
    queue = sosfilt(butter(1, 5000, "low", fs=FE, output="sos"), queue)  # l'air mange les aigus
    queue *= 1 / np.sqrt(np.sum(queue**2)) / db(drr_db)
    queue[0] = 1.0
    return queue


def salir(x: np.ndarray, condition: str, voise: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    from scipy.signal import butter, fftconvolve, sosfilt

    niveau = rms(x[voise]) or rms(x)
    x = x * db(NIVEAU) / niveau
    if condition == "propre":
        return x
    if condition == "bruit":
        return x + bruit_rose(len(x), rng) * db(NIVEAU - 15)  # 15 dB sous la voix
    if condition in ("piece", "portable"):
        y = fftconvolve(x, reponse_salle(0.5, 3, rng))[: len(x)]
    else:
        y = fftconvolve(x, reponse_salle(3.0, -3, rng))[: len(x)]
    y *= db(NIVEAU) / (rms(y[voise]) or rms(y))
    if condition != "portable":
        return y
    y = sosfilt(butter(2, 200, "high", fs=FE, output="sos"), y)
    y = sosfilt(butter(2, 7000, "low", fs=FE, output="sos"), y)
    y *= db(-38) / (rms(y[voise]) or rms(y))  # le portable sur la table, à un mètre
    t = np.arange(len(y)) / FE
    souffle = bruit_rose(len(y), rng) * db(-38 - 25) + 0.3 * db(-38 - 25) * np.sin(2 * np.pi * 50 * t)
    return y + souffle + 0.09


def lire_extrait(nom: str):
    import soundfile as sf
    import soxr

    x, fe = sf.read(VOCADITO / "Audio" / f"{nom}.wav", dtype="float64")
    if x.ndim == 2:
        x = x.mean(axis=1)
    x = soxr.resample(x, fe, FE)
    ref = np.loadtxt(VOCADITO / "Annotations" / "F0" / f"{nom}_f0.csv", delimiter=",")
    notes = np.loadtxt(VOCADITO / "Annotations" / "Notes" / f"{nom}_notesA1.csv", delimiter=",", ndmin=2)
    return x, ref, notes


def extraits() -> list[str]:
    return sorted((p.stem for p in (VOCADITO / "Audio").glob("*.wav")), key=lambda n: int(n.split("_")[1]))


def preparer() -> None:
    (CONDITIONS / "ref").mkdir(parents=True, exist_ok=True)
    for k, nom in enumerate(extraits()):
        x, ref, notes = lire_extrait(nom)
        # Les échantillons où la voix chante (pour régler le niveau).
        f0 = np.interp(np.arange(len(x)) / FE, ref[:, 0], ref[:, 1]) > 0
        (CONDITIONS / "ref" / f"{nom}.json").write_text(json.dumps({
            "t": ref[:, 0].tolist(), "f": ref[:, 1].tolist(),
            "notes": notes.tolist(), "duree": len(x) / FE,
        }))
        for condition in NOMS_CONDITIONS:
            rng = np.random.default_rng(1000 * k + NOMS_CONDITIONS.index(condition))
            y = salir(x, condition, f0, rng).astype("<f4")
            (CONDITIONS / condition).mkdir(exist_ok=True)
            y.tofile(CONDITIONS / condition / f"{nom}.f32")
        print(nom, end=" ", flush=True)
    print()


# --- Les détecteurs Python. Chacun rend t (s), f (Hz, la hauteur brute, 0 si aucune) et
# fv (Hz, 0 si la trame est dite non chantée). Pour un détecteur « direct », t est l'instant
# où la mesure est connue (le bilan cherche son retard) ; sinon le milieu de la trame.

def pyin(x16: np.ndarray):
    import librosa

    f, voise, _ = librosa.pyin(x16, fmin=50, fmax=1000, sr=16000, frame_length=1024, hop_length=160)
    t = librosa.times_like(f, sr=16000, hop_length=160)
    f = np.nan_to_num(f)
    return t, f, np.where(voise, f, 0)


_swift = None


def swift():
    global _swift
    if _swift is None:
        import swift_f0

        _swift = swift_f0.SwiftF0(threads=1)
    return _swift


def swiftf0(x16: np.ndarray):
    r = swift().detect(x16.astype(np.float32), 16000)
    return r.timestamps, r.pitch_hz, np.where(r.confidence >= 0.5, r.pitch_hz, 0)


def swiftf0_direct(x16: np.ndarray, avance: int = 4, seuil: float = 0.5):
    """SwiftF0 en direct : chaque trame dès que `avance` trames de 16 ms la suivent. À 4, sa
    fenêtre de 128 ms est entière ; le modèle en voudrait 10 pour rendre le même résultat
    qu'hors ligne. À 0, sa confiance reste nulle. Une trame est chantée si sa confiance
    atteint `seuil` (0,5 pour le modèle). Rend aussi la confiance (c)."""
    from swift_f0.core import FMAX, FMIN, HOP, LEFT_FRAMES

    d = swift()
    x = np.concatenate([np.zeros(LEFT_FRAMES * HOP, np.float32), x16.astype(np.float32)])
    n = len(x16) // HOP
    t, f, fv, c = np.zeros(n), np.zeros(n), np.zeros(n), np.zeros(n)
    for i in range(n):
        debut = i * HOP  # = (i - LEFT_FRAMES) * HOP dans x16
        bout = x[debut : debut + (LEFT_FRAMES + avance + 1) * HOP]
        p, conf, _ = d._run(bout, FMIN, FMAX)
        f[i] = p[LEFT_FRAMES]
        c[i] = conf[LEFT_FRAMES]
        fv[i] = f[i] if c[i] >= seuil else 0
        t[i] = min(len(bout) - LEFT_FRAMES * HOP + i * HOP, len(x16)) / 16000
    return t, f, fv, c


def pesto_hors_ligne(x16: np.ndarray):
    import pesto
    import torch

    t, f, c, _ = pesto.predict(torch.from_numpy(x16.astype(np.float32)), 16000, step_size=10.0)
    f, c = f.numpy(), c.numpy()
    return t.numpy() / 1000, f, np.where(c >= 0.5, f, 0)


def pesto_direct(x48: np.ndarray):
    """PESTO en flux, comme dans le navigateur : 48 kHz, un bloc de 20 ms à la fois."""
    import torch
    from pesto import load_model

    m = load_model("mir-1k_g7", step_size=20.0, sampling_rate=FE, streaming=True, max_batch_size=1)
    m.eval()
    bloc = int(0.02 * FE)
    n = len(x48) // bloc
    t, f, fv = np.zeros(n), np.zeros(n), np.zeros(n)
    x = torch.from_numpy(x48[: n * bloc].astype(np.float32))
    with torch.inference_mode():
        for i, morceau in enumerate(x.split(bloc)):
            p, c, _ = m(morceau, convert_to_freq=True, return_activations=False)
            f[i] = float(p.reshape(-1)[0])
            fv[i] = f[i] if float(c.reshape(-1)[0]) >= 0.5 else 0
            t[i] = (i + 1) * bloc / FE
    return t, f, fv


DETECTEURS_PY = {
    "pyin": ("hors ligne", pyin),
    "swiftf0": ("hors ligne", swiftf0),
    "swiftf0-direct": ("direct", swiftf0_direct),
    "swiftf0-direct-s0.3": ("direct", lambda x: swiftf0_direct(x, 4, 0.3)),
    "swiftf0-direct-a2": ("direct", lambda x: swiftf0_direct(x, 2)),
    "swiftf0-direct-a2-s0.3": ("direct", lambda x: swiftf0_direct(x, 2, 0.3)),
    "pesto": ("hors ligne", pesto_hors_ligne),
    "pesto-direct": ("direct", pesto_direct),
}


def lancer(tache):
    condition, nom, detecteur = tache
    import soxr
    import torch

    torch.set_num_threads(1)
    x48 = np.fromfile(CONDITIONS / condition / f"{nom}.f32", dtype="<f4").astype(np.float64)
    x16 = soxr.resample(x48, FE, 16000)
    debut = time.process_time()
    t, f, fv, *c = DETECTEURS_PY[detecteur][1](x48 if detecteur == "pesto-direct" else x16)
    duree = time.process_time() - debut
    sortie = CONDITIONS / condition / f"{nom}.{detecteur}.json"
    donnees = {"t": t, "f": f, "fv": fv} | ({"c": c[0]} if c else {})
    sortie.write_text(json.dumps({k: np.asarray(v).tolist() for k, v in donnees.items()}))
    return detecteur, duree, len(x48) / FE


def python(detecteurs: list[str] | None = None) -> None:
    detecteurs = detecteurs or list(DETECTEURS_PY)
    taches = [(c, n, d) for d in detecteurs for c in NOMS_CONDITIONS for n in extraits()]
    durees: dict[str, list[float]] = {}
    # Peu de cœurs et en priorité basse : la machine reste utilisable (et silencieuse).
    os.nice(19)
    with ProcessPoolExecutor(max_workers=int(os.environ.get("BANC_COEURS", "3"))) as pool:
        for i, (d, cpu, audio) in enumerate(pool.map(lancer, taches)):
            durees.setdefault(d, [0.0, 0.0])
            durees[d][0] += cpu
            durees[d][1] += audio
            if i % 40 == 39:
                print(f"{i + 1}/{len(taches)}", flush=True)
    fichier = CONDITIONS / "durees_py.json"
    anciennes = json.loads(fichier.read_text()) if fichier.exists() else {}
    anciennes.update({d: c / a for d, (c, a) in durees.items()})  # s de calcul par s de son
    fichier.write_text(json.dumps(anciennes))


def pitchy() -> None:
    env = {**os.environ, "BANC_DOSSIER": str(CONDITIONS)}
    env.setdefault("XDG_RUNTIME_DIR", os.environ.get("TMPDIR", "/tmp") + "/run")
    commande = ["nice", "-n", "19", "pnpm", "--dir", str(RACINE / "web"), "exec", "vitest", "run", "banc"]
    subprocess.run(commande, env=env, check=True)


# --- Le bilan.

def cents(f: np.ndarray) -> np.ndarray:
    with np.errstate(divide="ignore", invalid="ignore"):
        return np.where(f > 0, 1200 * np.log2(np.maximum(f, 1e-9) / 440) + 6900, np.nan)


_lues: dict = {}


def lire_sortie(condition: str, nom: str, detecteur: str):
    cle = (condition, nom, detecteur)
    if cle not in _lues:
        d = json.loads((CONDITIONS / condition / f"{nom}.{detecteur}.json").read_text())
        _lues[cle] = np.asarray(d["t"]), np.asarray(d["f"], float), np.asarray(d["fv"], float)
    return _lues[cle]


def aligner(ref, t: np.ndarray, retard: float):
    """La référence à l'instant de chaque mesure, moins le retard : la trame la plus proche."""
    rt, rf = ref
    i = np.clip(np.searchsorted(rt, t - retard), 1, len(rt) - 1)
    i -= (t - retard - rt[i - 1]) < (rt[i] - (t - retard))
    dedans = (t - retard >= rt[0]) & (t - retard <= rt[-1])
    return cents(rf[i]), dedans


def compter(condition: str, detecteur: str, retard: float, refs: dict) -> dict:
    total = {k: 0.0 for k in ("voisees", "muettes", "rpa", "octave", "justes", "alertes", "notes", "faux", "manquees")}
    ecarts: list[np.ndarray] = []
    for nom, r in refs.items():
        t, f, fv = lire_sortie(condition, nom, detecteur)
        c_ref, dedans = aligner((np.asarray(r["t"]), np.asarray(r["f"])), t, retard)
        voisee = dedans & ~np.isnan(c_ref)
        muette = dedans & np.isnan(c_ref)
        brut, dit = cents(f), cents(fv)
        e = brut - c_ref
        ed = dit - c_ref
        total["voisees"] += voisee.sum()
        total["muettes"] += muette.sum()
        total["rpa"] += np.sum(voisee & (np.abs(e) < 50))
        total["octave"] += np.sum(voisee & (np.abs(np.abs(e) - 1200) < 50))
        juste = voisee & (np.abs(ed) < 50)
        total["justes"] += juste.sum()
        total["alertes"] += np.sum(muette & ~np.isnan(dit))
        ecarts.append(np.abs(ed[juste]))
        # Les notes : l'écart médian de chaque note (son milieu), comme le bilan de l'app.
        for debut, _, duree in r["notes"]:
            if duree < 0.15:
                continue
            dans = (t - retard >= debut + 0.2 * duree) & (t - retard <= debut + 0.8 * duree)
            vraie = dans & ~np.isnan(c_ref)
            mesuree = vraie & ~np.isnan(dit)
            if vraie.sum() < 3:
                continue
            total["notes"] += 1
            if mesuree.sum() < 3:
                total["manquees"] += 1
            elif abs(np.median(dit[mesuree]) - np.median(c_ref[vraie])) > 25:
                total["faux"] += 1
    e = np.concatenate(ecarts) if ecarts else np.zeros(0)
    v, m, n = total["voisees"], total["muettes"], total["notes"]
    return {
        "rpa": 100 * total["rpa"] / v,
        "octave": 100 * total["octave"] / v,
        "justes": 100 * total["justes"] / v,
        "alertes": 100 * total["alertes"] / m,
        "precision": float(np.median(e)) if len(e) else float("nan"),
        "p90": float(np.percentile(e, 90)) if len(e) else float("nan"),
        "faux": 100 * total["faux"] / n,
        "manquees": 100 * total["manquees"] / n,
    }


def detecteurs_presents() -> dict[str, str]:
    noms = {}
    for p in (CONDITIONS / "propre").glob("vocadito_1.*.json"):
        d = p.name.split(".", 1)[1].removesuffix(".json")
        noms[d] = DETECTEURS_PY.get(d, ("direct",))[0]
    return dict(sorted(noms.items()))


ENTETE = """# Le banc de la hauteur : les résultats

Écrit par `uv run --script banc/hauteur.py bilan`. Les 40 extraits de vocadito (13,6 min de
voix seules), dans cinq conditions : propre ; bruit (rose, 15 dB sous la voix) ; piece
(RT60 0,5 s) ; eglise (RT60 3 s, plus de réverbération que de son direct : un cas dur) ;
portable (la pièce, puis le micro d'un portable : sans graves ni aigus, −38 dB, souffle,
50 Hz, décalage continu). Un détecteur « direct » mesure au fil du son, comme l'app ; son
retard est celui qui lui donne le plus de trames justes sur la voix propre.

- pitchy : l'app ; pitchy-avant : l'app jusqu'au 18.11.2026 (clarté 0,9 seule, médiane 5) ;
  pitchy-4096 : la fenêtre de la voix grave ; pitchy-c0.8 : un seuil de clarté plus bas.
- swiftf0-direct : SwiftF0, 4 trames d'avance (64 ms) ; -a2 : 2 trames ; -s0.3 : chantée
  dès une confiance de 0,3 (0,5 sinon).
- pesto-direct : PESTO en flux (blocs de 20 ms, 48 kHz). pyin, swiftf0, pesto : hors ligne.

"""


def bilan(seulement: list[str] | None = None) -> str:
    refs = {n: json.loads((CONDITIONS / "ref" / f"{n}.json").read_text()) for n in extraits()}
    durees = {}
    for f in ("durees_py.json", "durees_js.json"):
        if (CONDITIONS / f).exists():
            durees.update(json.loads((CONDITIONS / f).read_text()))
    lignes = [ENTETE]
    resultats = {}
    for d, sorte in detecteurs_presents().items():
        if seulement and d not in seulement:
            continue
        # Le retard : celui qui donne le plus de trames justes sur la voix propre.
        # La hauteur brute (sans la médiane de l'app) a son propre retard.
        essais = np.arange(-0.04, 0.30, 0.004)
        comptes = [compter("propre", d, r, refs) for r in essais]
        retard = float(essais[int(np.argmax([c["justes"] for c in comptes]))])
        retard_brut = float(essais[int(np.argmax([c["rpa"] for c in comptes]))])
        resultats[d] = {"sorte": sorte, "retard": retard, "retard_brut": retard_brut, "vitesse": durees.get(d)}
        for c in NOMS_CONDITIONS:
            resultats[d][c] = compter(c, d, retard, refs)
            brut = compter(c, d, retard_brut, refs)
            resultats[d][c].update(rpa=brut["rpa"], octave=brut["octave"])
        print(d, round(retard * 1000), "ms", flush=True)
        _lues.clear()
    (DONNEES / "resultats.json").write_text(json.dumps(resultats, indent=1))

    def table(titre: str, cle: str, fmt: str) -> None:
        lignes.append(f"\n**{titre}**\n")
        lignes.append("| détecteur | " + " | ".join(NOMS_CONDITIONS) + " |")
        lignes.append("|---|" + "---:|" * len(NOMS_CONDITIONS))
        for d, r in resultats.items():
            lignes.append(f"| {d} | " + " | ".join(fmt.format(r[c][cle]) for c in NOMS_CONDITIONS) + " |")

    lignes.append("| détecteur | sorte | retard (ms) | calcul (ms par s de son) |")
    lignes.append("|---|---|---:|---:|")
    for d, r in resultats.items():
        v = r["vitesse"]
        lignes.append(f"| {d} | {r['sorte']} | {round(r['retard'] * 1000)} | {'' if v is None else f'{v * 1000:.0f}'} |")
    table("Trames justes (%) : chantées, dites chantées, à moins de 50 cents", "justes", "{:.1f}")
    table("Hauteur brute juste (%) : à moins de 50 cents, sans regarder si la trame est dite chantée", "rpa", "{:.1f}")
    table("Erreurs d'octave (%)", "octave", "{:.1f}")
    table("Fausses alertes (%) : silence ou souffle dit chanté", "alertes", "{:.1f}")
    table("Précision (cents) : écart médian des trames justes", "precision", "{:.1f}")
    table("Notes au faux bilan (%) : écart médian de la note à plus de 25 cents du vrai", "faux", "{:.1f}")
    table("Notes manquées (%) : moins de 3 mesures au milieu de la note", "manquees", "{:.1f}")
    texte = "\n".join(lignes) + "\n"
    print(texte)
    return texte


if __name__ == "__main__":
    action = sys.argv[1] if len(sys.argv) > 1 else "tout"
    if action in ("preparer", "tout"):
        preparer()
    if action in ("python", "tout"):
        python(sys.argv[2:] or None)
    if action in ("pitchy", "tout"):
        pitchy()
    if action in ("bilan", "tout"):
        texte = bilan(sys.argv[2:] or None)
        if action == "tout" or not sys.argv[2:]:
            (RACINE / "banc" / "resultats.md").write_text(texte)
