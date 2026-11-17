// Le suiveur : où en est le chanteur dans la pièce, et de combien il chante faux.
//
// Le chant n'a pas de mesure : le suiveur attend le chanteur. Le curseur est sur un « pas »
// (des notes de même hauteur à la suite, comme la teneur d'un psaume : on ne sait pas
// entendre où l'une finit et où l'autre commence). Il passe au pas suivant quand la voix
// reste `tenue` ms à moins de `tolerance` cents de lui. Il cherche jusqu'à `avance` pas plus
// loin, pour une note trop courte. La hauteur du chant est relative : `doMidi` est le do de
// la clé, choisi par le chanteur.
//
// Pas d'audio ici : des mesures entrent (`recevoir`), un état sort. Le test joue une pièce.

import type { Mesure } from "../audio/hauteur";
import { REGLAGES, type Reglages } from "../reglages";
import type { NoteChant } from "./partition";

export interface Pas {
  /** les notes du pas, de `premiere` à `derniere` (rangs dans la liste des notes) */
  premiere: number;
  derniere: number;
  hauteur: number;
  phrase: number;
}

export type Etat = "attente" | "chante" | "fini";

/** Les pas d'une pièce : les notes de même hauteur à la suite, dans une phrase. */
export function decouper(notes: NoteChant[]): Pas[] {
  const pas: Pas[] = [];
  notes.forEach((n, i) => {
    const dernier = pas[pas.length - 1];
    if (dernier && dernier.hauteur === n.hauteur && dernier.phrase === n.phrase) dernier.derniere = i;
    else pas.push({ premiere: i, derniere: i, hauteur: n.hauteur, phrase: n.phrase });
  });
  return pas;
}

function mediane(valeurs: number[]): number | null {
  if (!valeurs.length) return null;
  const t = [...valeurs].sort((a, b) => a - b);
  const m = t.length >> 1;
  return t.length % 2 ? t[m] : (t[m - 1] + t[m]) / 2;
}

export class Suiveur {
  readonly pas: Pas[];
  /** le pas où est le curseur */
  k = 0;
  etat: Etat = "attente";
  /** les écarts mesurés sur chaque pas (cents) */
  private ecartsPas: number[][];
  /** le pas que la voix vise, depuis `debutCandidat`, et ses écarts en attendant */
  private candidat: number | null = null;
  private debutCandidat = 0;
  private tampon: number[] = [];
  /** la dernière mesure chantée, et un souffle (silence) depuis l'arrivée sur le pas */
  private dernierSon: number | null = null;
  private souffle = false;

  constructor(
    readonly notes: NoteChant[],
    public doMidi: number,
    private r: Reglages = REGLAGES,
  ) {
    this.pas = decouper(notes);
    this.ecartsPas = this.pas.map(() => []);
  }

  /** La note visée par le pas `k`, en MIDI. */
  cible(k = this.k): number {
    return this.doMidi + this.pas[k].hauteur;
  }

  /** La première note du pas courant. */
  get noteCourante(): number {
    return this.pas[this.k]?.premiere ?? 0;
  }

  /** Le curseur sur la note `note` ; on attend que le chanteur l'attaque. */
  allerA(note: number): void {
    const k = this.pas.findIndex((p) => p.premiere <= note && note <= p.derniere);
    if (k < 0) return;
    this.k = k;
    this.etat = "attente";
    this.candidat = null;
    this.souffle = false;
  }

  /** On reprend du début, sans les écarts mesurés. */
  recommencer(): void {
    this.ecartsPas = this.pas.map(() => []);
    this.dernierSon = null;
    this.allerA(0);
  }

  recevoir(m: Mesure): void {
    if (this.etat === "fini" || !this.pas.length) return;
    const dernier = this.pas.length - 1;
    if (m.midi === null) {
      this.candidat = null;
      if (this.dernierSon === null) return;
      const silence = m.temps - this.dernierSon;
      if (silence >= this.r.souffle) this.souffle = true;
      if (this.etat === "chante" && this.k === dernier && silence >= this.r.silenceFin) this.etat = "fini";
      return;
    }
    this.souffle ||= this.dernierSon !== null && m.temps - this.dernierSon >= this.r.souffle;
    this.dernierSon = m.temps;
    const ecart = (k: number) => (m.midi! - this.cible(k)) * 100;

    if (this.etat === "attente") {
      // Le chanteur attaque la note du curseur.
      if (Math.abs(ecart(this.k)) <= this.r.tolerance) this.viser(this.k, m, ecart(this.k));
      else this.candidat = null;
      return;
    }
    // Le pas suivant (ou un peu plus loin). Même hauteur que le pas courant : seulement
    // après un souffle, sinon c'est la même note tenue.
    for (let s = this.k + 1; s <= Math.min(this.k + this.r.avance, dernier); s++) {
      if (this.pas[s].hauteur === this.pas[this.k].hauteur && !this.souffle) continue;
      if (Math.abs(ecart(s)) <= this.r.tolerance) {
        this.viser(s, m, ecart(s));
        return;
      }
    }
    this.candidat = null;
    if (Math.abs(ecart(this.k)) <= this.r.toleranceMesure) this.ecartsPas[this.k].push(ecart(this.k));
  }

  /** La voix est sur le pas `s` : après `tenue` ms, le curseur y va. */
  private viser(s: number, m: Mesure, e: number): void {
    if (this.candidat !== s) {
      this.candidat = s;
      this.debutCandidat = m.temps;
      this.tampon = [];
    }
    this.tampon.push(e);
    if (m.temps - this.debutCandidat < this.r.tenue) return;
    this.k = s;
    this.etat = "chante";
    this.ecartsPas[s].push(...this.tampon);
    this.candidat = null;
    this.souffle = false;
  }

  /** L'écart de chaque note (médiane, en cents), null si elle n'a pas été chantée. */
  ecarts(): (number | null)[] {
    const sortie: (number | null)[] = this.notes.map(() => null);
    this.pas.forEach((p, k) => {
      const e = mediane(this.ecartsPas[k]);
      for (let i = p.premiere; i <= p.derniere; i++) sortie[i] = e;
    });
    return sortie;
  }

  /** Les notes chantées trop haut ou trop bas (plus de `horsJustesse` cents). */
  fausses(): Set<number> {
    const sortie = new Set<number>();
    this.ecarts().forEach((e, i) => {
      if (e !== null && Math.abs(e) > this.r.horsJustesse) sortie.add(i);
    });
    return sortie;
  }

  /** L'écart de chaque phrase (médiane de ses mesures) : la voix baisse-t-elle ? */
  derives(): { phrase: number; ecart: number | null }[] {
    const parPhrase = new Map<number, number[]>();
    this.pas.forEach((p, k) => {
      parPhrase.set(p.phrase, [...(parPhrase.get(p.phrase) ?? []), ...this.ecartsPas[k]]);
    });
    return [...parPhrase].map(([phrase, e]) => ({ phrase, ecart: mediane(e) }));
  }
}

/** Le bilan d'un chant en mesure (« chanter avec ») : ce qui a été chanté sur chaque pas
 * (`traces`, en MIDI) comparé à sa note. Les notes fausses, et l'écart de chaque phrase. */
export function bilanDesTraces(
  pas: Pas[],
  traces: (number | null)[][],
  doMidi: number,
  r: Reglages = REGLAGES,
): { fausses: Set<number>; derives: { phrase: number; ecart: number | null }[] } {
  const fausses = new Set<number>();
  const parPhrase = new Map<number, number[]>();
  pas.forEach((p, k) => {
    const ecarts = (traces[k] ?? [])
      .filter((m): m is number => m !== null)
      .map((m) => (m - doMidi - p.hauteur) * 100)
      .filter((e) => Math.abs(e) <= r.toleranceMesure);
    parPhrase.set(p.phrase, [...(parPhrase.get(p.phrase) ?? []), ...ecarts]);
    const e = mediane(ecarts);
    if (e !== null && Math.abs(e) > r.horsJustesse) for (let i = p.premiere; i <= p.derniere; i++) fausses.add(i);
  });
  return { fausses, derives: [...parPhrase].map(([phrase, e]) => ({ phrase, ecart: mediane(e) })) };
}

/** « Caler sur ma voix » : la note que le chanteur tient, stable, `calageDuree` ms. */
export class Calage {
  private suite: Mesure[] = [];

  constructor(private r: Reglages = REGLAGES) {}

  recevoir(m: Mesure): number | null {
    if (m.midi === null) {
      this.suite = [];
      return null;
    }
    this.suite.push(m);
    while (m.temps - this.suite[0].temps > 2 * this.r.calageDuree) this.suite.shift();
    if (m.temps - this.suite[0].temps < this.r.calageDuree) return null;
    const fenetre = this.suite.filter((x) => x.temps >= m.temps - this.r.calageDuree).map((x) => x.midi!);
    const ecart = (Math.max(...fenetre) - Math.min(...fenetre)) * 100;
    if (ecart > this.r.calageEcart) return null;
    this.suite = [];
    return mediane(fenetre);
  }
}
