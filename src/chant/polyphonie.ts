// Une pièce à plusieurs voix en MusicXML : chaque voix en notes, avec leur hauteur (MIDI),
// leur place dans le temps (en noires) et leur syllabe. Le suiveur et la lecture s'en
// servent ; la gravure est celle de Verovio (`VuePolyphonie.vue`).
//
// Les MusicXML de Franco écrivent les altérations de l'éditeur (musica ficta) en paroles
// n° 9 (« # », « [#] », « ♭ », « (♮) »), pas dans la hauteur. Les chanteurs les chantent :
// on les applique, sinon un do♯ bien chanté sortirait faux.

import type { NoteChant } from "./partition";

export interface NotePoly {
  /** rang parmi les notes de la voix (les silences ne comptent pas) */
  indice: number;
  midi: number;
  /** en noires depuis le début de la pièce */
  debut: number;
  duree: number;
  syllabe: string;
  /** coupées aux silences et aux doubles barres */
  phrase: number;
  /** l'altération de l'éditeur appliquée (« # », « ♭ », « ♮ »), sinon null */
  ficta: string | null;
}

export interface VoixPoly {
  nom: string;
  notes: NotePoly[];
}

export interface Polyphonie {
  titre: string;
  voix: VoixPoly[];
  /** noires par minute (le `<sound tempo>` du fichier, sinon 80) */
  tempo: number;
  /** la fin de la pièce, en noires */
  fin: number;
}

const PAS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 } as const;

/** L'altération de l'éditeur d'une parole (« [#] » → 1, « ♭ » → -1, « (♮) » → 0), ou null. */
export function ficta(texte: string): number | null {
  const t = texte.replace(/[[\]()\s]/g, "");
  if (t === "#" || t === "♯") return 1;
  if (t === "♭" || t === "b") return -1;
  if (t === "♮") return 0;
  return null;
}

const enfant = (e: Element, nom: string) => Array.from(e.children).find((c) => c.tagName === nom);
const texteDe = (e: Element | undefined, nom: string) => (e ? enfant(e, nom)?.textContent?.trim() ?? "" : "");

export function lireMusicXml(xml: string, lecteur: DOMParser = new DOMParser()): Polyphonie {
  const doc = lecteur.parseFromString(xml, "application/xml");
  const racine = doc.documentElement;
  if (racine.tagName !== "score-partwise" || doc.getElementsByTagName("parsererror").length) {
    throw new Error("pas un MusicXML lisible (<score-partwise>)");
  }
  const noms = new Map(
    Array.from(racine.getElementsByTagName("score-part")).map((p) => [p.getAttribute("id"), texteDe(p, "part-name")]),
  );
  const son = racine.querySelector("sound[tempo]");
  const tempo = Number(son?.getAttribute("tempo")) || 80;
  let fin = 0;

  const voix = Array.from(racine.children)
    .filter((e) => e.tagName === "part")
    .map((partie) => {
      const notes: NotePoly[] = [];
      let divisions = 1;
      let t = 0; // en noires (`divisions` peut changer en cours de pièce)
      let phrase = 0;
      let coupe = false;
      let premiereVoix: string | null = null;
      for (const mesure of Array.from(partie.children).filter((e) => e.tagName === "measure")) {
        for (const e of Array.from(mesure.children)) {
          if (e.tagName === "attributes") {
            divisions = Number(texteDe(e, "divisions")) || divisions;
          } else if (e.tagName === "backup") {
            t -= (Number(texteDe(e, "duration")) || 0) / divisions;
          } else if (e.tagName === "forward") {
            t += (Number(texteDe(e, "duration")) || 0) / divisions;
          } else if (e.tagName === "barline") {
            if (/heavy|light-light/.test(texteDe(e, "bar-style"))) coupe = true;
          } else if (e.tagName === "note") {
            const duree = (Number(texteDe(e, "duration")) || 0) / divisions;
            const v = texteDe(e, "voice") || "1";
            premiereVoix ??= v;
            if (enfant(e, "grace") || enfant(e, "chord")) continue; // une voix chantée n'a pas d'accord
            if (v !== premiereVoix) {
              t += duree; // une 2e voix sur la même portée (après un <backup>) : on la saute
              continue;
            }
            const hauteur = enfant(e, "pitch");
            if (!hauteur) {
              coupe = true; // un silence : une respiration
              t += duree;
              continue;
            }
            const paroles = Array.from(e.children).filter((c) => c.tagName === "lyric");
            const mots = paroles.map((p) => ({ n: p.getAttribute("number") ?? "1", texte: texteDe(p, "text"), syllabic: texteDe(p, "syllabic") }));
            const alteree = mots.map((m) => ficta(m.texte)).find((f) => f !== null) ?? null;
            const parole = mots.find((m) => ficta(m.texte) === null && m.texte);
            let alter = Number(texteDe(hauteur, "alter")) || 0;
            if (alteree !== null) alter = alteree;
            const step = texteDe(hauteur, "step") as keyof typeof PAS;
            if (coupe && notes.length) phrase++;
            coupe = false;
            notes.push({
              indice: notes.length,
              midi: (Number(texteDe(hauteur, "octave")) + 1) * 12 + PAS[step] + alter,
              debut: t,
              duree,
              syllabe: parole ? parole.texte + (parole.syllabic === "begin" || parole.syllabic === "middle" ? "-" : "") : "",
              phrase,
              ficta: alteree === null ? null : mots.find((m) => ficta(m.texte) !== null)!.texte,
            });
            t += duree;
          }
        }
      }
      fin = Math.max(fin, t);
      return { nom: noms.get(partie.getAttribute("id")) || partie.getAttribute("id") || "", notes };
    });
  const titre = racine.querySelector("work > work-title")?.textContent?.trim() || racine.querySelector("movement-title")?.textContent?.trim() || "";
  return { titre, voix, tempo, fin };
}

const MARQUES: Record<number, string> = { 1: "sharp", [-1]: "flat", 0: "natural" };

/** Le MusicXML pour Verovio : les altérations de l'éditeur écrites en paroles deviennent un
 * signe au-dessus de la note (`<accidental-mark>`), comme dans une édition. En paroles,
 * Verovio leur garde une ligne de texte vide sous chaque voix. */
export function pourVerovio(xml: string, lecteur: DOMParser = new DOMParser()): string {
  const doc = lecteur.parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) return xml;
  for (const parole of Array.from(doc.getElementsByTagName("lyric"))) {
    const f = ficta(texteDe(parole, "text"));
    if (f === null) continue;
    const note = parole.parentElement!;
    parole.remove();
    let notations = enfant(note, "notations");
    if (!notations) {
      notations = doc.createElement("notations");
      // À sa place dans l'ordre de MusicXML : avant les paroles qui restent.
      note.insertBefore(notations, enfant(note, "lyric") ?? null);
    }
    const marque = doc.createElement("accidental-mark");
    marque.setAttribute("placement", "above");
    marque.textContent = MARQUES[f];
    notations.appendChild(marque);
  }
  return new XMLSerializer().serializeToString(doc);
}

/** Les notes d'une voix pour le suiveur : la hauteur depuis le do3 (MIDI 60). */
export function notesDuSuiveur(v: VoixPoly): NoteChant[] {
  return v.notes.map((n) => ({
    indice: n.indice,
    hauteur: n.midi - 60,
    position: 0,
    syllabe: n.syllabe,
    duree: 1,
    phrase: n.phrase,
    source: n.indice,
  }));
}

/** La voix à proposer : celle dont le milieu est le plus près de `centre` (MIDI). */
export function voixProche(p: Polyphonie, centre = 55): number {
  let meilleure = 0;
  let ecart = Infinity;
  p.voix.forEach((v, i) => {
    const h = v.notes.map((n) => n.midi).sort((a, b) => a - b);
    if (!h.length) return;
    const e = Math.abs(h[h.length >> 1] - centre);
    if (e < ecart) [meilleure, ecart] = [i, e];
  });
  return meilleure;
}

/** La note de la voix qui sonne au temps `t` (noires), ou -1. */
export function noteA(v: VoixPoly, t: number): number {
  let bas = 0;
  let haut = v.notes.length - 1;
  while (bas <= haut) {
    const m = (bas + haut) >> 1;
    const n = v.notes[m];
    if (t < n.debut) haut = m - 1;
    else if (t >= n.debut + n.duree) bas = m + 1;
    else return m;
  }
  return -1;
}
