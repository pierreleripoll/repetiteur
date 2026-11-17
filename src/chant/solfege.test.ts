import { describe, expect, it } from "vitest";
import { cents, degre, nomNote, positionContinue } from "./solfege";

describe("solfège", () => {
  it("nomme les notes à la française", () => {
    expect([nomNote(60), nomNote(55), nomNote(70)]).toEqual(["do3", "sol2", "si♭3"]);
    expect([degre(-3), degre(10), degre(0)]).toEqual(["la", "si♭", "do"]);
    expect([cents(12.4), cents(-8), cents(0)]).toEqual(["+12 c", "−8 c", "±0 c"]);
  });

  it("place une hauteur sur la portée, un degré par position", () => {
    expect([0, 2, 4, 5, 7, 9, 11, 12].map((h) => positionContinue(h))).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect([-1, -3, -5].map((h) => positionContinue(h))).toEqual([-1, -2, -3]);   // si la sol en dessous
    expect(positionContinue(10)).toBe(5.5);         // si♭ sans bémol : entre la et si
    expect(positionContinue(10, true)).toBe(6);     // avec bémol : sur la position du si
    expect(positionContinue(4.5)).toBe(2.5);        // un mi trop haut d'un quart de ton
  });
});
