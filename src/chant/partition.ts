// La partition d'une pièce : le GABC lu par exsurge (fork bbloomf, MIT), en notes avec leur
// hauteur pour le suiveur, et gravée en SVG pour l'écran.
//
// exsurge lit les deux dialectes du GABC : celui de Divinum Officium (le sien) et celui de
// Gregorio (GregoBase). Chaque note du SVG a l'id `note-1`, `note-2`… dans l'ordre des
// notes : c'est le lien entre une `NoteChant` et son glyphe.

import * as Ex from "exsurge-ts";

export interface NoteChant {
  /** rang parmi les notes de la pièce ; son glyphe a l'id `note-${indice + 1}` */
  indice: number;
  /** demi-tons au-dessus du do de la clé (négatif en dessous) */
  hauteur: number;
  /** sa place sur la portée : 1 la ligne du bas, 7 celle du haut (exsurge `staffPosition`) */
  position: number;
  /** la syllabe chantée sur la note */
  syllabe: string;
  /** en pulsations : 2 pour une note pointée */
  duree: 1 | 2;
  /** 0, 1, 2… : les phrases sont coupées aux barres « ; », « : » et « :: » */
  phrase: number;
  /** la place de la note dans le GABC */
  source: number;
}

export interface Partition {
  notes: NoteChant[];
  entete: Record<string, string>;
  score: Ex.ChantScore;
  contexte: Ex.ChantContext;
}

/** Les champs de l'entête (« mode: 8; ») et le corps, après « %% ». DO écrit parfois
 * tout sur une ligne : « name:Iste Confessor; mode:2; %% (c4) … ». */
export function separer(gabc: string): { entete: Record<string, string>; corps: string } {
  const i = gabc.indexOf("%%");
  if (i < 0) return { entete: {}, corps: gabc };
  const entete: Record<string, string> = {};
  for (const m of gabc.slice(0, i).matchAll(/([\w-]+)\s*:([^;]*);/g)) entete[m[1]] = m[2].trim();
  return { entete, corps: gabc.slice(i + 2).trimStart() };
}

// Les deux encres du système graphique (`tokens/encres.css`).
const ENCRE = "#201E15";
const MINIUM = "#C22310";

/** Le contexte d'exsurge pour l'écran : le texte en EB Garamond, aux deux encres. La
 * portée un peu plus grande que celle d'exsurge (1/16) : on la lit à un mètre, au pupitre. */
export function contexteEcran(taille = 22): Ex.ChantContext {
  const ctxt = new Ex.ChantContext();
  ctxt.setGlyphScaling(1 / 11);
  ctxt.textColor = ENCRE;
  ctxt.setFont("'EB Garamond', serif", taille);
  ctxt.setRubricColor(MINIUM);
  ctxt.minLyricWordSpacing = ctxt.hyphenWidth * 0.7;
  return ctxt;
}

/** Lit une pièce. `contexte` : celui de l'écran par défaut (un test donne le sien). */
export function lire(gabc: string, contexte: Ex.ChantContext = contexteEcran()): Partition {
  const { entete, corps } = separer(gabc);
  const mappings = Ex.Gabc.createMappingsFromSource(contexte, corps);
  const score = new Ex.ChantScore(contexte, mappings, true);
  if (entete.annotation) score.annotation = new Ex.Annotation(contexte, entete.annotation);
  return { notes: notes(score), entete, score, contexte };
}

/** Le do de la clé de départ, dans la mesure d'exsurge (`Pitch.toInt()`). */
function doDeLaCle(score: Ex.ChantScore): number {
  const cle = score.startingClef as Ex.Clef & { octave?: number };
  return new Ex.Pitch(Ex.Step.Do, cle?.octave ?? 2).toInt();
}

function notes(score: Ex.ChantScore): NoteChant[] {
  const sortie: NoteChant[] = [];
  const reference = doDeLaCle(score);
  let syllabe = "";
  let phrase = 0;
  for (const notation of score.notations) {
    const paroles = (notation as { lyrics?: Ex.Lyric[] }).lyrics ?? [];
    if (paroles.length) syllabe = paroles.map((l) => l.originalText ?? l.text).join(" ").trim();
    if (notation instanceof Ex.Divider) {
      // Une nouvelle phrase après « ; », « : » ou « :: », si la précédente a des notes.
      const fin = !(notation instanceof Ex.QuarterBar);
      if (fin && sortie.length && sortie[sortie.length - 1].phrase === phrase) phrase++;
      continue;
    }
    for (const note of (notation as { notes?: unknown[] }).notes ?? []) {
      if (!(note instanceof Ex.Note) || !note.pitch || note.noteIndex === undefined) continue;
      sortie.push({
        indice: note.noteIndex,
        hauteur: note.pitch.toInt() - reference,
        position: note.staffPosition,
        syllabe,
        duree: note.morae.length ? 2 : 1,
        phrase,
        source: note.sourceIndex,
      });
    }
  }
  return sortie;
}

/** Grave la partition à la largeur donnée (px) : le SVG à mettre dans la page. */
export function graver(p: Partition, largeur: number): Promise<SVGElement> {
  return new Promise((resolu) => {
    p.score.performLayoutAsync(p.contexte, () => {
      p.score.layoutChantLines(p.contexte, largeur, () => {
        resolu(p.score.createSvgNode(p.contexte) as unknown as SVGElement);
      });
    });
  });
}

/** L'id du glyphe d'une note dans le SVG. */
export function idNote(indice: number, contexte?: Ex.ChantContext): string {
  return (contexte?.noteIdPrefix ?? "note-") + (indice + 1);
}
