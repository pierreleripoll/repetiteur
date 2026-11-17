// suiveur.ts : on « chante » une pièce en mesures faites ici, sans audio.
import { describe, expect, it } from "vitest";
import type { Mesure } from "../audio/hauteur";
import { REGLAGES } from "../reglages";
import type { NoteChant } from "./partition";
import { bilanDesTraces, Calage, Suiveur, decouper } from "./suiveur";

const DO = 55; // sol2 : le do de la clé, pour le chanteur

/** Une pièce en notes : [hauteur, phrase, durée]. */
function piece(notes: [number, number, (1 | 2)?][]): NoteChant[] {
  return notes.map(([hauteur, phrase, duree], indice) => ({
    indice, hauteur, position: 0, phrase, duree: duree ?? 1, syllabe: "", source: 0,
  }));
}

// Ecce quam bonum (antienne 1.a), de `tests/donnees/` : deux phrases pour le test.
const ECCE = piece([
  [-3, 0], [-3, 0], [-5, 0], [-5, 0], [-8, 0, 2],
  [-7, 1], [-5, 1], [-8, 1], [-7, 1], [-10, 1, 2],
]);

class Chanteur {
  temps = 0;
  mesures: Mesure[] = [];
  /** Tient `midi` pendant `ms` (une mesure toutes les 20 ms). */
  chante(midi: number | null, ms: number) {
    for (let t = 0; t < ms; t += REGLAGES.periode) {
      this.mesures.push({ temps: this.temps, midi, clarte: midi === null ? 0 : 0.98, volume: 0.1, brute: midi });
      this.temps += REGLAGES.periode;
    }
    return this;
  }
  /** Chante les notes, `ecart(note)` cents à côté, avec un souffle entre les phrases. */
  piece(notes: NoteChant[], ecart: (n: NoteChant) => number = () => 0, ms = 240) {
    notes.forEach((n, i) => {
      if (i && notes[i - 1].phrase !== n.phrase) this.chante(null, 300);
      this.chante(DO + n.hauteur + ecart(n) / 100, ms * n.duree);
    });
    return this.chante(null, 600);
  }
  envoyer(s: Suiveur, apres?: (s: Suiveur) => void) {
    for (const m of this.mesures) {
      s.recevoir(m);
      apres?.(s);
    }
    this.mesures = [];
  }
}

describe("suiveur", () => {
  it("découpe en pas : les notes de même hauteur à la suite, dans une phrase", () => {
    const pas = decouper(piece([[0, 0], [0, 0], [2, 0], [2, 1], [2, 1]]));
    expect(pas.map((p) => [p.premiere, p.derniere])).toEqual([[0, 1], [2, 2], [3, 4]]);
  });

  it("suit une pièce chantée juste jusqu'à la fin", () => {
    const s = new Suiveur(ECCE, DO);
    const vues: number[] = [];
    new Chanteur().piece(ECCE).envoyer(s, (s) => {
      if (vues[vues.length - 1] !== s.noteCourante) vues.push(s.noteCourante);
    });
    expect(s.etat).toBe("fini");
    expect(vues).toEqual([0, 2, 4, 5, 6, 7, 8, 9]);
    expect(s.ecarts().every((e) => e !== null && Math.abs(e) < 1)).toBe(true);
    expect(s.fausses().size).toBe(0);
  });

  it("attend la première note : une autre ne lance rien", () => {
    const s = new Suiveur(ECCE, DO);
    const c = new Chanteur();
    c.chante(DO + 2, 1000).envoyer(s);
    expect([s.etat, s.k]).toEqual(["attente", 0]);
    c.chante(DO - 3, 200).envoyer(s);
    expect(s.etat).toBe("chante");
  });

  it("une fausse note ne fait pas avancer le curseur", () => {
    const s = new Suiveur(ECCE, DO);
    const c = new Chanteur().chante(DO - 3, 300).chante(DO + 4, 1000);
    c.envoyer(s);
    expect([s.etat, s.noteCourante]).toEqual(["chante", 0]);
  });

  it("une note trop courte est sautée, le curseur suit quand même", () => {
    const s = new Suiveur(ECCE, DO);
    // la note de rang 6 (-5) ne dure que 40 ms
    const c = new Chanteur();
    c.piece(ECCE.slice(0, 6)).envoyer(s);
    c.chante(DO - 5, 40).chante(DO - 8, 240).envoyer(s);
    expect(s.noteCourante).toBe(7);
  });

  it("une note de même hauteur après un souffle : la phrase suivante", () => {
    const notes = piece([[0, 0], [2, 0], [2, 1], [4, 1]]);
    const s = new Suiveur(notes, DO);
    const c = new Chanteur();
    c.chante(DO, 200).chante(DO + 2, 400).envoyer(s);
    expect(s.k).toBe(1);   // la même note tenue ne passe pas à la phrase suivante
    c.chante(null, 300).chante(DO + 2, 200).envoyer(s);
    expect(s.k).toBe(2);
  });

  it("mesure les notes fausses et la dérive par phrase", () => {
    const s = new Suiveur(ECCE, DO);
    // Première phrase juste, la seconde 35 cents trop bas : la voix baisse.
    new Chanteur().piece(ECCE, (n) => (n.phrase ? -35 : 0)).envoyer(s);
    expect(s.etat).toBe("fini");
    expect([...s.fausses()]).toEqual([5, 6, 7, 8, 9]);
    const [p0, p1] = s.derives();
    expect(Math.round(p0.ecart!)).toBe(0);
    expect(Math.round(p1.ecart!)).toBe(-35);
  });

  it("le curseur va où on clique, et attend", () => {
    const s = new Suiveur(ECCE, DO);
    s.allerA(3);
    expect([s.k, s.noteCourante, s.etat]).toEqual([1, 2, "attente"]);
    new Chanteur().piece(ECCE.slice(2)).envoyer(s);
    expect(s.etat).toBe("fini");
  });

  it("change de do : la même pièce, chantée plus haut", () => {
    const s = new Suiveur(ECCE, DO + 3);
    new Chanteur().piece(ECCE.map((n) => ({ ...n, hauteur: n.hauteur + 3 }))).envoyer(s);
    expect(s.etat).toBe("fini");
  });
});

describe("calage", () => {
  it("donne la note tenue, stable", () => {
    const c = new Calage();
    let trouve: number | null = null;
    const ch = new Chanteur().chante(50.3, 100).chante(null, 40).chante(52.1, 400);
    for (const m of ch.mesures) trouve ??= c.recevoir(m);
    expect(trouve).toBeCloseTo(52.1, 5);
  });

  it("refuse une voix qui bouge", () => {
    const c = new Calage();
    const ch = new Chanteur();
    for (let k = 0; k < 30; k++) ch.chante(52 + (k % 2) * 0.5, 20);
    expect(ch.mesures.map((m) => c.recevoir(m)).filter((x) => x !== null)).toEqual([]);
  });
});

describe("bilan d'un chant en mesure (« chanter avec »)", () => {
  it("les notes fausses et l'écart de chaque phrase, depuis les traces", () => {
    const pas = decouper(piece([[0, 0], [2, 0], [4, 1], [5, 1]]));
    const traces = [
      [DO, DO + 0.05, null, DO - 0.05],           // juste
      [DO + 2 - 0.4, DO + 2 - 0.35, DO + 2 - 0.4], // 40 cents trop bas : fausse
      [],                                          // pas chantée
      [DO + 5 + 3, DO + 5 + 0.1, DO + 5 + 0.1],    // une mesure à côté (3 demi-tons) ne compte pas
    ];
    const b = bilanDesTraces(pas, traces, DO);
    expect([...b.fausses]).toEqual([1]);
    expect(b.derives).toEqual([{ phrase: 0, ecart: expect.closeTo(-20, 0) }, { phrase: 1, ecart: expect.closeTo(10, 0) }]);
  });
});
