// @vitest-environment jsdom
// partition.ts sur le GABC de `tests/donnees/` (DO et GregoBase). Une fausse police mesure
// le texte : jsdom n'a pas de canvas.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import * as Ex from "exsurge-ts";
import { graver, idNote, lire, separer } from "./partition";

const DONNEES = resolve(__dirname, "../../../tests/donnees");
const donnees = (nom: string) => readFileSync(resolve(DONNEES, nom), "utf8");

function contexte() {
  const ctxt = new Ex.ChantContext(Ex.TextMeasuringStrategy.OpenTypeJS);
  const police = {
    unitsPerEm: 2048,
    layout: (t: string) => ({ advanceWidth: t.length * 1024, bbox: { minX: 0, maxY: 1434, height: 1843 } }),
  };
  ctxt.setFont("Fausse", 16, {}, { Regular: police as never });
  return ctxt;
}

describe("partition", () => {
  it("sépare l'entête du corps", () => {
    const { entete, corps } = separer(donnees("antienne_ecce_quam_bonum.gabc"));
    expect(entete).toMatchObject({ name: "Ecce quam bonum", mode: "1", annotation: "1.a" });
    expect(corps.startsWith("(c4) EC(h')ce(h)")).toBe(true);
    expect(separer("(c4) A(f)")).toEqual({ entete: {}, corps: "(c4) A(f)" });
  });

  it("lit une antienne de DO : hauteurs, syllabes, notes pointées, phrases", () => {
    const p = lire(donnees("antienne_ecce_quam_bonum.gabc"), contexte());
    // EC(h')ce(h) quam(g) bo(g)num(e') … : 21 notes, en clé d'ut 4e ligne (j = do).
    expect(p.notes).toHaveLength(21);
    expect(p.notes.slice(0, 5).map((n) => n.hauteur)).toEqual([-3, -3, -5, -5, -8]);
    expect(p.notes.slice(0, 5).map((n) => n.position)).toEqual([5, 5, 4, 4, 2]);   // h h g g e
    expect(p.notes.map((n) => n.indice)).toEqual([...Array(21).keys()]);
    expect(p.notes[0].syllabe).toBe("EC");
    expect(p.notes[2].syllabe).toBe("quam");
    // ju(e')cún(f)dum,(d.) : la note pointée vaut deux pulsations.
    const dum = p.notes.find((n) => n.syllabe === "dum,")!;
    expect([dum.hauteur, dum.duree]).toEqual([-10, 2]);
    // La virgule « (,) » ne coupe pas la phrase ; la pièce entière est une phrase.
    expect(new Set(p.notes.map((n) => n.phrase))).toEqual(new Set([0]));
  });

  it("lit une communion de GregoBase (dialecte de Gregorio), en trois phrases", () => {
    const p = lire(donnees("communion_lux_aeterna.gabc"), contexte());
    expect(p.notes.length).toBeGreaterThan(60);
    expect(p.notes[0]).toMatchObject({ syllabe: "LUX", hauteur: -3 });
    // ae(gf) : deux notes sur une syllabe.
    expect(p.notes.slice(1, 3).map((n) => [n.syllabe, n.hauteur])).toEqual([["ae", -5], ["ae", -7]]);
    // Coupée à « *(:) », au ℣ « (::) », à « (;) »…
    expect(Math.max(...p.notes.map((n) => n.phrase))).toBeGreaterThanOrEqual(3);
  });

  it("lit un psaume de DO en clé d'ut et une hymne", () => {
    const psaume = lire(donnees("psaume_132_8G.gabc"), contexte());
    expect(psaume.notes.slice(0, 3).map((n) => n.hauteur)).toEqual([-5, -3, 0]);   // g h j : sol la do
    const hymne = lire(donnees("hymne_iste_confessor.gabc"), contexte());
    expect(hymne.notes.length).toBeGreaterThan(200);
  });

  it("garde les notes d'une pièce modifiée par le directeur (au minium, <alt>)", () => {
    const gabc = donnees("antienne_ecce_quam_bonum.gabc")
      .replace("quam(g)", "<alt>retenir</alt>quam(g)")
      .replace("bo(g)num", "bo([ev:\\color{minium}]h[nv:\\color{encre}])num");
    const p = lire(gabc, contexte());
    expect(p.notes).toHaveLength(21);
    expect(p.notes[3]).toMatchObject({ syllabe: "bo", hauteur: -3 });
  });

  it("grave : chaque note a son glyphe, par son id", async () => {
    const p = lire(donnees("antienne_ecce_quam_bonum.gabc"), contexte());
    const svg = await graver(p, 600);
    const glyphes = svg.querySelectorAll("use.note");
    expect(glyphes).toHaveLength(21);
    expect(glyphes[0].id).toBe(idNote(0));
    expect(svg.querySelector("#" + idNote(20))).not.toBeNull();
  });
});
