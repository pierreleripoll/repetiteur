// @vitest-environment jsdom
// polyphonie.ts sur un MusicXML fait pour les tests (`tests/donnees/kyrie_deux_voix.musicxml`)
// et sur le Memento mei de Franco (`programmes/office_morts/`).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ficta, lireMusicXml, noteA, notesDuSuiveur, pourVerovio, voixProche } from "./polyphonie";

const RACINE = resolve(__dirname, "../../..");
const lire = (chemin: string) => lireMusicXml(readFileSync(resolve(RACINE, chemin), "utf8"));

describe("polyphonie", () => {
  it("lit les voix, les hauteurs, le temps et les syllabes", () => {
    const p = lire("tests/donnees/kyrie_deux_voix.musicxml");
    expect(p.titre).toBe("Kyrie à deux voix");
    expect(p.tempo).toBe(120);
    expect(p.fin).toBe(16);   // quatre mesures de deux blanches
    expect(p.voix.map((v) => v.nom)).toEqual(["Superius", "Bassus"]);
    const basse = p.voix[1].notes;
    // ré mi fa | (silence) | la do♯ mi ré : le « # » de l'éditeur est appliqué.
    expect(basse.map((n) => n.midi)).toEqual([50, 52, 53, 57, 49, 52, 50]);
    expect(basse.map((n) => n.debut)).toEqual([0, 2, 4, 8, 10, 12, 14]);
    expect(basse.map((n) => n.syllabe)).toEqual(["Ky-", "ri-", "e", "e-", "le-", "i-", "son."]);
    expect(basse[4].ficta).toBe("#");
    // Le silence coupe la phrase.
    expect(basse.map((n) => n.phrase)).toEqual([0, 0, 0, 1, 1, 1, 1]);
    // Le « ♭ » du dessus : si♭.
    expect(p.voix[0].notes[4]).toMatchObject({ midi: 70, ficta: "♭", syllabe: "le-" });
  });

  it("pour Verovio : l'altération de l'éditeur au-dessus de la note, plus en paroles", () => {
    const xml = pourVerovio(readFileSync(resolve(RACINE, "tests/donnees/kyrie_deux_voix.musicxml"), "utf8"));
    expect(xml).not.toContain('number="9"');
    expect(xml.match(/<accidental-mark placement="above">(\w+)<\/accidental-mark>/g)).toEqual([
      '<accidental-mark placement="above">flat</accidental-mark>',
      '<accidental-mark placement="above">sharp</accidental-mark>',
    ]);
    // Les notes et les syllabes restent : on lit toujours la même chose.
    const p = lireMusicXml(xml);
    expect(p.voix[1].notes.map((n) => n.syllabe)).toEqual(["Ky-", "ri-", "e", "e-", "le-", "i-", "son."]);
  });

  it("lit les altérations de l'éditeur", () => {
    expect([ficta("#"), ficta("[#]"), ficta("♭"), ficta("(♮)"), ficta("Ky")]).toEqual([1, 1, -1, 0, null]);
  });

  it("propose la voix au milieu d'une voix d'homme, et trouve la note d'un temps", () => {
    const p = lire("tests/donnees/kyrie_deux_voix.musicxml");
    expect(voixProche(p)).toBe(1);
    expect([noteA(p.voix[1], 0), noteA(p.voix[1], 3.5), noteA(p.voix[1], 6), noteA(p.voix[1], 15.9)]).toEqual([0, 1, -1, 6]);
    const notes = notesDuSuiveur(p.voix[1]);
    expect(notes.map((n) => n.hauteur)).toEqual([-10, -8, -7, -3, -11, -8, -10]);
  });

  it("lit le Memento mei de Franco : quatre voix, les altérations de l'éditeur", () => {
    const p = lire("programmes/office_morts/memento_mei_franco.musicxml");
    expect(p.titre).toBe("Memento mei, Deus");
    expect(p.voix.map((v) => v.nom)).toEqual(["Tiple", "Alto", "[Tenor]", "Bajo"]);
    expect(p.voix.map((v) => v.notes.length)).toEqual([90, 113, 112, 157]);
    expect(p.voix[0].notes.filter((n) => n.ficta).length).toBe(6);
    expect(p.voix[0].notes.slice(0, 3).map((n) => n.syllabe)).toEqual(["Me-", "men-", "to"]);
    // 305 noires, comme le compte de Python ; une voix peut finir sur un silence.
    expect(p.fin).toBe(305);
    for (const v of p.voix) expect(v.notes[v.notes.length - 1].debut + v.notes[v.notes.length - 1].duree).toBeLessThanOrEqual(305);
  });
});
