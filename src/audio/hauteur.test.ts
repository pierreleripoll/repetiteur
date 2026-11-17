// hauteur.ts sur des sons faits ici : une voix d'homme simple (fondamentale et
// harmoniques), du silence, du bruit.
import { describe, expect, it } from "vitest";
import { midiDe } from "../chant/solfege";
import { Detecteur } from "./hauteur";

const FE = 48000;
const TAILLE = 2048;

/** Un son de `taille` échantillons : la fondamentale `f` et ses harmoniques, décroissantes. */
function son(f: number, harmoniques = [1, 0.6, 0.4, 0.25], debut = 0, amplitude = 0.3): Float32Array {
  const t = new Float32Array(TAILLE);
  for (let i = 0; i < TAILLE; i++) {
    const x = (debut + i) / FE;
    t[i] = amplitude * harmoniques.reduce((s, a, k) => s + a * Math.sin(2 * Math.PI * f * (k + 1) * x), 0);
  }
  return t;
}

describe("hauteur", () => {
  it("trouve 110, 220 et 440 Hz à 5 cents près", () => {
    for (const f of [110, 220, 440]) {
      const d = new Detecteur(TAILLE, FE);
      const m = d.mesurer(son(f), 0);
      expect(m.midi).not.toBeNull();
      expect(Math.abs((m.midi! - midiDe(f)) * 100)).toBeLessThan(5);
      expect(m.clarte).toBeGreaterThan(0.9);
    }
  });

  it("garde la fondamentale quand l'harmonique 2 est plus forte (pas de saut d'octave)", () => {
    const d = new Detecteur(TAILLE, FE);
    const m = d.mesurer(son(130.81, [0.5, 1, 0.5, 0.3]), 0);
    expect(Math.round(m.midi!)).toBe(48);   // do2
  });

  it("ne compte ni le silence ni le bruit", () => {
    const d = new Detecteur(TAILLE, FE);
    expect(d.mesurer(new Float32Array(TAILLE), 0).midi).toBeNull();
    let graine = 1;
    const bruit = new Float32Array(TAILLE).map(() => {
      graine = (graine * 16807) % 2147483647;
      return (graine / 2147483647 - 0.5) * 0.5;
    });
    expect(d.mesurer(bruit, 20).midi).toBeNull();
  });

  it("une voix trop faible ne compte pas, mais on voit la note captée", () => {
    const d = new Detecteur(TAILLE, FE);
    const m = d.mesurer(son(220, undefined, 0, 0.001), 0);
    expect(m.midi).toBeNull();
    expect(Math.round(m.brute!)).toBe(57);   // la2
    expect(d.mesurer(new Float32Array(TAILLE), 20).brute).toBeNull();
  });

  it("trouve la voix malgré un décalage continu (le micro interne du ThinkPad : +0,2)", () => {
    const d = new Detecteur(TAILLE, FE);
    const m = d.mesurer(son(110, undefined, 0, 0.02).map((x) => x + 0.2), 0);
    expect(Math.abs((m.midi! - midiDe(110)) * 100)).toBeLessThan(5);
    // Le volume est celui de la voix, sans le décalage.
    expect(m.volume).toBeLessThan(0.03);
    expect(d.mesurer(new Float32Array(TAILLE).fill(0.2), 20).volume).toBe(0);
  });

  it("la médiane efface une mesure isolée à l'octave", () => {
    const d = new Detecteur(TAILLE, FE);
    for (let k = 0; k < 4; k++) d.mesurer(son(220, undefined, k * TAILLE), k * 20);
    const m = d.mesurer(son(440, [1]), 80);
    expect(Math.round(m.midi!)).toBe(57);   // la2, pas la3
  });
});
