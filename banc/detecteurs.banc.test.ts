// Le banc d'essai de la hauteur (`banc/hauteur.py`) : les détecteurs de l'app, tels quels,
// sur les fichiers qu'il a préparés (float32, 48 kHz, un par extrait et par condition).
// Comme dans la page : toutes les `periode` ms, la fenêtre des derniers échantillons.
// Sauté sans BANC_DOSSIER : `pnpm test` ne le lance pas.
//
// Chaque détecteur écrit `<extrait>.<détecteur>.json` : t (s, l'instant où la mesure est
// connue : la fin de la fenêtre), f (Hz, la hauteur brute de McLeod, 0 si aucune) et fv
// (Hz, ce que l'app garde : 0 si la mesure ne compte pas).
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PitchDetector } from "pitchy";
import { it } from "vitest";
import { Detecteur } from "../src/audio/hauteur";
import { REGLAGES, type Reglages } from "../src/reglages";

const DOSSIER = process.env.BANC_DOSSIER;
const FE = 48000;
const hz = (midi: number | null) => (midi === null ? 0 : 440 * 2 ** ((midi - 69) / 12));

/** Les variantes à comparer : des réglages autres que ceux de l'app. Les essais du
 * 18.11.2026 (garde de 0,3 à 0,7, médiane 3 ou 5, saut 0,5) sont au PLAN, §6.3. */
const VARIANTES: Record<string, Partial<Reglages>> = {
  pitchy: {},
  "pitchy-avant": { clarteGarde: 0.9, mediane: 5 }, // l'app jusqu'au 18.11.2026
  "pitchy-4096": { fenetre: REGLAGES.fenetreGrave },
  "pitchy-c0.8": { clarteMin: 0.8 },
};
/** BANC_VARIANTES=a,b : seulement celles-là. */
const CHOISIES = process.env.BANC_VARIANTES?.split(",");

it.skipIf(!DOSSIER)("banc : les détecteurs de l'app", () => {
  const pas = Math.round((REGLAGES.periode / 1000) * FE);
  const durees: Record<string, number> = {};
  let son = 0;
  for (const condition of readdirSync(DOSSIER!)) {
    const dossier = join(DOSSIER!, condition);
    if (!statSync(dossier).isDirectory()) continue;
    for (const fichier of readdirSync(dossier).filter((f) => f.endsWith(".f32"))) {
      const octets = readFileSync(join(dossier, fichier));
      const x = new Float32Array(octets.buffer, octets.byteOffset, octets.byteLength / 4);
      son += x.length / FE;
      for (const [nom, autres] of Object.entries(VARIANTES)) {
        if (CHOISIES && !CHOISIES.includes(nom)) continue;
        const reglages = { ...REGLAGES, ...autres };
        const taille = reglages.fenetre;
        const d = new Detecteur(taille, FE, reglages);
        const brut = PitchDetector.forFloat32Array(taille);
        const centre = new Float32Array(taille);
        const t: number[] = [];
        const f: number[] = [];
        const fv: number[] = [];
        let calcul = 0;
        for (let fin = taille; fin <= x.length; fin += pas) {
          const fenetre = x.subarray(fin - taille, fin);
          const debut = performance.now();
          const m = d.mesurer(fenetre, (fin / FE) * 1000);
          calcul += performance.now() - debut;
          t.push(fin / FE);
          fv.push(hz(m.midi));
          // La hauteur brute, sans seuil (comme `mesurer`, moyenne retirée).
          let moyenne = 0;
          for (let i = 0; i < taille; i++) moyenne += fenetre[i];
          moyenne /= taille;
          for (let i = 0; i < taille; i++) centre[i] = fenetre[i] - moyenne;
          const [frequence] = brut.findPitch(centre, FE);
          f.push(Number.isFinite(frequence) && frequence > 0 ? frequence : 0);
        }
        durees[nom] = (durees[nom] ?? 0) + calcul;
        writeFileSync(join(dossier, fichier.replace(/\.f32$/, `.${nom}.json`)), JSON.stringify({ t, f, fv }));
      }
    }
  }
  // Secondes de calcul par seconde de son (ajoutées à celles des autres variantes).
  const fichierDurees = join(DOSSIER!, "durees_js.json");
  let anciennes: Record<string, number> = {};
  try {
    anciennes = JSON.parse(readFileSync(fichierDurees, "utf8"));
  } catch {
    // pas encore de fichier
  }
  for (const nom in durees) anciennes[nom] = durees[nom] / 1000 / son;
  writeFileSync(fichierDurees, JSON.stringify(anciennes));
}, 1_800_000);
