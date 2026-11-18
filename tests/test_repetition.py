"""La répétition de bout en bout : la page construite (`dist`) dans Chrome sans écran, avec
un faux micro qui « chante » une antienne, ou la basse d'un Kyrie à deux voix (MusicXML,
gravé par Verovio). Le curseur doit aller jusqu'à la dernière note. La hauteur est mesurée
par SwiftF0 (onnxruntime-web dans un worker), ou par pitchy si on le demande
(`?detecteur=pitchy`).

    pnpm build && pnpm e2e        # uv run --with pytest pytest tests

Le serveur est faux : il rend `dist` et, pour `/api/programmes/essai`, le fichier
`donnees/essai.json`. C'est ce que `uv run scriptorium serveur` (dépôt scriptorium) donne
pour un programme libre de deux pièces, `donnees/antienne_ecce_quam_bonum.gabc` et
`donnees/kyrie_deux_voix.musicxml` : si le serveur change ce qu'il rend, refaire ce fichier.

Le faux micro de Chrome lit un fichier WAV (`--use-file-for-fake-audio-capture`), fait
ici depuis les notes de la pièce. On lit l'état de la page par le protocole de Chrome
(DevTools), sur un tube (`--remote-debugging-pipe`) : pas besoin de bibliothèque.

Sauté sans Chrome ou sans `dist`.
"""
import json
import math
import os
import shutil
import struct
import subprocess
import threading
import time
import wave
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pytest

DONNEES = Path(__file__).parent / "donnees"
WEB = Path(__file__).parent.parent / "dist"
FE = 48000

# Ecce quam bonum (antienne 1.a, `donnees/antienne_ecce_quam_bonum.gabc`), en clé d'ut 4e
# ligne : demi-tons depuis le do (j), et durée (2 : note pointée). Les mêmes que lit
# exsurge (`src/chant/partition.test.ts`).
ECCE = [(-3, 1), (-3, 1), (-5, 1), (-5, 1), (-8, 1), (-7, 1), (-5, 1), (-8, 1), (-7, 1), (-10, 2),
        (-8, 1), (-7, 1), (-3, 1), (-5, 1), (-8, 1), (-7, 1), (-5, 1), (-7, 1), (-8, 1), (-10, 2),
        (-10, 2)]
DO = 55            # sol2 : le do de la clé pour ce chanteur
# La basse du Kyrie à deux voix (`donnees/kyrie_deux_voix.musicxml`), depuis do3 (MIDI 60) :
# ré mi fa | la do♯ mi ré (le do♯ vient d'un « # » de l'éditeur).
KYRIE_BASSE = [(-10, 1), (-8, 1), (-7, 1), (-3, 1), (-11, 1), (-8, 1), (-10, 2)]
PULSATION = 0.3    # s


def wav(chemin, notes, ecart_cents=0.0, continu=0.0, do=DO) -> None:
    """Une voix simple (fondamentale et harmoniques) qui chante `notes`, après un silence.
    `continu` : un décalage continu, comme le micro interne du ThinkPad (+0,2 en mono)."""
    echantillons = [continu] * int(1.5 * FE)
    phase = 0.0
    for hauteur, duree in notes:
        f = 440 * 2 ** ((do + hauteur + ecart_cents / 100 - 69) / 12)
        for _ in range(int(duree * PULSATION * FE)):
            phase += 2 * math.pi * f / FE
            echantillons.append(continu + 0.25 * (math.sin(phase) + 0.5 * math.sin(2 * phase) + 0.3 * math.sin(3 * phase)))
    echantillons += [continu] * int(3 * FE)
    with wave.open(str(chemin), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(FE)
        w.writeframes(b"".join(struct.pack("<h", int(max(-1, min(1, x)) * 32767)) for x in echantillons))


class Chrome:
    """Chrome sans écran, piloté par le protocole DevTools sur un tube (fd 3 et 4)."""

    def __init__(self, url: str, *options: str):
        lire_chrome, self.ecrire = os.pipe()
        self.lire, ecrire_chrome = os.pipe()
        # Plus haut que 4, pour que dup2 vers 3 et 4 n'écrase rien.
        lire_chrome, ecrire_chrome = (os.dup2(lire_chrome, 50), os.dup2(ecrire_chrome, 51))

        def fds():
            os.dup2(lire_chrome, 3)
            os.dup2(ecrire_chrome, 4)

        self.proc = subprocess.Popen(
            [shutil.which("google-chrome"), "--headless=new", "--no-sandbox", "--disable-gpu",
             "--remote-debugging-pipe", *options, url],
            preexec_fn=fds, pass_fds=(3, 4), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        os.close(lire_chrome)
        os.close(ecrire_chrome)
        self.n = 0
        self.tampon = b""
        cibles = self.envoyer("Target.getTargets")["targetInfos"]
        page = next(c for c in cibles if c["type"] == "page")
        self.session = self.envoyer("Target.attachToTarget", targetId=page["targetId"], flatten=True)["sessionId"]

    def envoyer(self, methode: str, session: str | None = None, **params):
        self.n += 1
        message = {"id": self.n, "method": methode, "params": params}
        if session:
            message["sessionId"] = session
        os.write(self.ecrire, json.dumps(message).encode() + b"\0")
        while True:
            while b"\0" not in self.tampon:
                self.tampon += os.read(self.lire, 65536)
            brut, self.tampon = self.tampon.split(b"\0", 1)
            reponse = json.loads(brut)
            if reponse.get("id") == self.n:
                if "error" in reponse:
                    raise RuntimeError(reponse["error"])
                return reponse["result"]

    def evaluer(self, js: str):
        r = self.envoyer("Runtime.evaluate", self.session, expression=js, returnByValue=True)
        return r["result"].get("value")

    def fermer(self):
        self.proc.kill()
        self.proc.wait()
        os.close(self.ecrire)
        os.close(self.lire)


class FauxServeur(SimpleHTTPRequestHandler):
    """La page de `dist` et un programme, comme le serveur de scriptorium. La page a ses
    adresses (`/repetition`) : une adresse inconnue hors de `/api` rend `index.html`."""

    def do_GET(self):
        chemin = self.path.split("?")[0]
        if chemin.startswith("/api/"):
            if chemin == "/api/programmes":
                self.json(200, [{"nom": "essai", "titre": "Essai"}])
            elif chemin == "/api/programmes/essai":
                self.json(200, json.loads((DONNEES / "essai.json").read_text(encoding="utf-8")))
            else:
                self.json(404, {"detail": f"{chemin} n'existe pas."})
            return
        if not (WEB / chemin.lstrip("/")).is_file():
            self.path = "/index.html"
        super().do_GET()

    def json(self, code: int, donnees) -> None:
        corps = json.dumps(donnees).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(corps)))
        self.end_headers()
        self.wfile.write(corps)

    def log_message(self, *args) -> None:
        pass


@pytest.fixture(scope="session")
def avec_chrome():
    if not shutil.which("google-chrome"):
        pytest.skip("google-chrome manque")


@pytest.fixture
def adresse():
    """Le faux serveur, sur un port libre."""
    if not (WEB / "index.html").exists():
        pytest.skip("dist manque : pnpm build")
    serveur = ThreadingHTTPServer(("127.0.0.1", 0), lambda *a: FauxServeur(*a, directory=str(WEB)))
    threading.Thread(target=serveur.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{serveur.server_address[1]}"
    serveur.shutdown()
    serveur.server_close()


def chanter(adresse, tmp_path, ecart_cents: float, continu=0.0, notes=ECCE, do=DO,
            piece="antienne", voix=None, detecteur=None) -> dict:
    """Le faux micro chante `notes` ; l'état de la page à la fin (ou après 30 s)."""
    fichier = tmp_path / "voix.wav"
    wav(fichier, notes, ecart_cents, continu, do)
    avec_voix = f"&voix={voix}" if voix is not None else ""
    avec_detecteur = f"&detecteur={detecteur}" if detecteur else ""
    chrome = Chrome(f"{adresse}/repetition?programme=essai&piece={piece}&do={do}{avec_voix}{avec_detecteur}&micro=1",
                    f"--user-data-dir={tmp_path / 'profil'}", "--use-fake-ui-for-media-stream",
                    "--use-fake-device-for-media-stream", f"--use-file-for-fake-audio-capture={fichier}",
                    "--autoplay-policy=no-user-gesture-required")
    try:
        # L'état de la page, et les pixels peints par la voix sur la portée.
        lire = ("(() => { const m = document.querySelector('main.repetition');"
                " const t = document.querySelector('canvas.voix');"
                " const g = document.querySelector('.polyphonie');"
                " const d = t && t.width ? t.getContext('2d').getImageData(0, 0, t.width, t.height).data : [];"
                " let trait = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) trait++;"
                " return m && {...m.dataset, texte: m.innerText, trait, gravees: g && g.dataset.gravees}; })()")
        fin = time.monotonic() + 30
        etat = None
        while time.monotonic() < fin:
            etat = chrome.evaluer(lire)
            if etat and etat.get("etat") == "fini":
                break
            time.sleep(0.25)
        return etat or {}
    finally:
        chrome.fermer()


def test_le_curseur_suit_la_voix_jusqu_a_la_fin(avec_chrome, adresse, tmp_path):
    """Avec le décalage continu du micro interne du ThinkPad : le premier essai de Pierre."""
    etat = chanter(adresse, tmp_path, 0, continu=0.2)
    assert etat.get("detecteur") == "swiftf0", etat
    assert etat.get("notes") == "21", etat
    assert etat.get("etat") == "fini", etat
    assert "0 note à plus de 25 cents" in etat["texte"], etat["texte"]
    assert etat["trait"] > 1000, "la voix n'est pas dessinée sur la portée"


def test_pitchy_si_on_le_demande(avec_chrome, adresse, tmp_path):
    """`?detecteur=pitchy` : pitchy seul, comme avant SwiftF0 (pour comparer)."""
    etat = chanter(adresse, tmp_path, 0, continu=0.2, detecteur="pitchy")
    assert etat.get("detecteur") == "pitchy", etat
    assert etat.get("etat") == "fini", etat
    assert "0 note à plus de 25 cents" in etat["texte"], etat["texte"]


def test_une_voix_trop_basse_sort_au_minium(avec_chrome, adresse, tmp_path):
    """35 cents trop bas : le curseur suit (moins de 50), mais toutes les notes sont fausses."""
    etat = chanter(adresse, tmp_path, -35)
    assert etat.get("detecteur") == "swiftf0", etat
    assert etat.get("etat") == "fini", etat
    assert "21 notes à plus de 25 cents" in etat["texte"], etat["texte"]


def test_une_voix_d_une_piece_a_plusieurs_voix(avec_chrome, adresse, tmp_path):
    """Le Kyrie à deux voix, gravé par Verovio : le chanteur prend la basse (`voix=1`)."""
    etat = chanter(adresse, tmp_path, 0, notes=KYRIE_BASSE, do=60, piece="autre", voix=1)
    assert etat.get("detecteur") == "swiftf0", etat
    assert etat.get("gravees") == "7", etat           # chaque note de la basse a sa tête gravée
    assert etat.get("notes") == "7", etat
    assert etat.get("etat") == "fini", etat
    assert "0 note à plus de 25 cents" in etat["texte"], etat["texte"]
    assert etat["trait"] > 300, "la voix n'est pas dessinée sur la portée de Verovio"
