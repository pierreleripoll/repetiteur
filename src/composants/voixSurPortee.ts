// La voix dessinée sur la portée, comme un trait de crayon rouge : sur chaque pas de la
// pièce, ce que le chanteur a chanté pendant que le curseur y était.
//
// Le suiveur dit où en est le chanteur (le pas `k`) : le trait part de la note de ce pas
// et avance vers le pas suivant, au plus `VITESSE` px par mesure (serré s'il manque de
// place). En hauteur, il est placé par rapport à la note écrite : juste, il passe sur la
// note ; un demi-ton trop bas, entre elle et la position du dessous (ou sur elle, entre
// mi et fa).

import { positionContinue } from "../chant/solfege";
import type { NoteChant } from "../chant/partition";
import type { Pas } from "../chant/suiveur";

/** Ce qu'on dessine : les pas, et pour chacun ses mesures (MIDI, null pour un silence). */
export interface Voix {
  pas: Pas[];
  traces: (number | null)[][];
  doMidi: number;
  /** le pas du curseur : son trait finit par un point */
  courant: number | null;
}

interface Ligne {
  /** y (px) de la position 0, et px par position */
  y0: number;
  pas: number;
  droite: number;
}

/** La géométrie d'une partition gravée, en px depuis le coin de `boite`. */
export interface Geometrie {
  lignes: Ligne[];
  /** pour chaque note : x de son centre et sa ligne */
  notes: { x: number; ligne: number }[];
}

const VITESSE = 1.5; // px par mesure (une toutes les 20 ms)
const HORS = 7; // positions : au-delà (une octave), on ne dessine pas
const TROU = 3; // mesures sans hauteur à la suite : en dessous, le trait continue

export function mesurer(boite: HTMLElement, svg: SVGElement, notes: NoteChant[], prefixe = "note-"): Geometrie {
  const origine = boite.getBoundingClientRect();
  const groupes = [...svg.querySelectorAll("g.chantLine")];
  const lignes: Ligne[] = groupes.map((g) => {
    // Les quatre lignes de la portée : positions 7 (haut) à 1 (bas).
    const traits = [...g.querySelectorAll("line.staffLine")].map((l) => l.getBoundingClientRect());
    const haut = Math.min(...traits.map((r) => r.top));
    const bas = Math.max(...traits.map((r) => r.bottom));
    const pas = (bas - haut) / 6;
    return { y0: bas - origine.top + pas, pas, droite: Math.max(...traits.map((r) => r.right)) - origine.left };
  });
  let precedente = { x: 0, ligne: 0 };
  const sortie = notes.map((n) => {
    const glyphe = svg.querySelector(`[id="${prefixe}${n.indice + 1}"]`);
    const r = glyphe?.getBoundingClientRect();
    // La fin d'un porrectus n'a pas de glyphe à elle : on garde la note d'avant.
    if (!glyphe || !r || (r.width === 0 && r.height === 0)) return precedente;
    const ligne = groupes.findIndex((g) => g.contains(glyphe));
    precedente = { x: r.left + r.width / 2 - origine.left, ligne: Math.max(ligne, 0) };
    return precedente;
  });
  return { lignes, notes: sortie };
}

/** Les phrases où le si est bémol (une note si♭, pas de si). */
function phrasesBemol(notes: NoteChant[]): Set<number> {
  const bemol = new Set<number>();
  const becarre = new Set<number>();
  for (const n of notes) {
    const classe = ((n.hauteur % 12) + 12) % 12;
    if (classe === 10) bemol.add(n.phrase);
    if (classe === 11) becarre.add(n.phrase);
  }
  becarre.forEach((p) => bemol.delete(p));
  return bemol;
}

export function dessiner(
  toile: HTMLCanvasElement,
  geo: Geometrie,
  notes: NoteChant[],
  voix: Voix,
  couleur: string,
): void {
  const ratio = window.devicePixelRatio || 1;
  const l = toile.clientWidth;
  const h = toile.clientHeight;
  if (toile.width !== Math.round(l * ratio) || toile.height !== Math.round(h * ratio)) {
    toile.width = Math.round(l * ratio);
    toile.height = Math.round(h * ratio);
  }
  const g = toile.getContext("2d");
  if (!g) return;
  g.setTransform(ratio, 0, 0, ratio, 0, 0);
  g.clearRect(0, 0, l, h);
  g.strokeStyle = couleur;
  g.fillStyle = couleur;
  g.lineWidth = 2;
  g.lineJoin = "round";
  g.lineCap = "round";
  const bemol = phrasesBemol(notes);

  voix.pas.forEach((p, k) => {
    const trace = voix.traces[k];
    if (!trace?.length) return;
    const note = notes[p.premiere];
    const ici = geo.notes[p.premiere];
    const ligne = geo.lignes[ici?.ligne ?? -1];
    if (!ici || !ligne) return;
    // Jusqu'au pas suivant s'il est sur la même ligne, sinon quatre interlignes.
    const suivant = voix.pas[k + 1] ? geo.notes[voix.pas[k + 1].premiere] : undefined;
    const fin = suivant && suivant.ligne === ici.ligne && suivant.x > ici.x
      ? suivant.x
      : Math.min(ligne.droite, ici.x + 8 * ligne.pas);
    const pasX = Math.min(VITESSE, (fin - ici.x) / Math.max(trace.length, 1));
    const b = bemol.has(p.phrase);
    const ecrite = positionContinue(note.hauteur, b);

    g.beginPath();
    let leve = true;
    let vides = 0;
    let dernier: [number, number] | null = null;
    trace.forEach((midi, i) => {
      if (midi === null) {
        if (++vides >= TROU) leve = true;
        return;
      }
      vides = 0;
      const ecart = positionContinue(midi - voix.doMidi, b) - ecrite;
      if (Math.abs(ecart) > HORS) {
        leve = true;
        return;
      }
      const x = ici.x + i * pasX;
      const y = ligne.y0 - (note.position + ecart) * ligne.pas;
      if (leve) g.moveTo(x, y);
      else g.lineTo(x, y);
      leve = false;
      dernier = [x, y];
    });
    g.stroke();
    if (k === voix.courant && dernier) {
      g.beginPath();
      g.arc(dernier[0], dernier[1], 3.5, 0, 2 * Math.PI);
      g.fill();
    }
  });
}
