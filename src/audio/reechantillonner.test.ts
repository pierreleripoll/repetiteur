import { describe, expect, it } from "vitest";
import { Reechantillonneur } from "./reechantillonner";

function sinus(f: number, fe: number, n: number, a = 0.5): Float32Array {
  return Float32Array.from({ length: n }, (_, i) => a * Math.sin((2 * Math.PI * f * i) / fe));
}

/** L'amplitude et la fréquence d'un sinus échantillonné à 16 kHz (au milieu, loin des bords). */
function analyser(x: Float32Array, f: number): { amplitude: number; ecart: number } {
  const debut = 2000;
  const fin = x.length - 2000;
  let c = 0;
  let s = 0;
  for (let i = debut; i < fin; i++) {
    c += x[i] * Math.cos((2 * Math.PI * f * i) / 16000);
    s += x[i] * Math.sin((2 * Math.PI * f * i) / 16000);
  }
  // Une phase qui dérive dirait une autre fréquence : on la mesure sur deux moitiés.
  const phase = (a: number, b: number) => {
    let cc = 0;
    let ss = 0;
    for (let i = a; i < b; i++) {
      cc += x[i] * Math.cos((2 * Math.PI * f * i) / 16000);
      ss += x[i] * Math.sin((2 * Math.PI * f * i) / 16000);
    }
    return Math.atan2(cc, ss);
  };
  const milieu = (debut + fin) >> 1;
  return { amplitude: (2 * Math.hypot(c, s)) / (fin - debut), ecart: Math.abs(phase(debut, milieu) - phase(milieu, fin)) };
}

describe("rééchantillonner", () => {
  for (const fe of [48000, 44100]) {
    it(`${fe} Hz : un la 440 garde sa fréquence et son amplitude, à sa place`, () => {
      const r = new Reechantillonneur(fe);
      const y = r.pousser(sinus(440, fe, fe));
      const { amplitude, ecart } = analyser(y, 440);
      expect(amplitude).toBeCloseTo(0.5, 3);
      expect(ecart).toBeLessThan(1e-3);
      // Pas de décalage : l'échantillon n de sortie est l'instant n / 16000.
      const attendu = sinus(440, 16000, y.length);
      for (let i = 2000; i < 2100; i++) expect(Math.abs(y[i] - attendu[i])).toBeLessThan(1e-3);
    });

    it(`${fe} Hz : un son au-dessus de 8 kHz disparaît`, () => {
      const y = new Reechantillonneur(fe).pousser(sinus(12000, fe, fe));
      expect(analyser(y, 4000).amplitude).toBeLessThan(1e-3); // 12 kHz replié tomberait sur 4 kHz
      expect(Math.max(...y.subarray(2000, -2000).map(Math.abs))).toBeLessThan(1e-3);
    });

    it(`${fe} Hz : des blocs coupés n'importe où donnent la même sortie`, () => {
      const x = sinus(220, fe, 20000).map((v, i) => v + 0.1 * Math.sin(i * 0.37));
      const dun = new Reechantillonneur(fe).pousser(x);
      const r = new Reechantillonneur(fe);
      const morceaux: Float32Array[] = [];
      let i = 0;
      for (const taille of [1, 128, 7, 256, 1000, 3, 513]) {
        morceaux.push(r.pousser(x.subarray(i, i + taille)));
        i += taille;
      }
      while (i < x.length) {
        morceaux.push(r.pousser(x.subarray(i, i + 256)));
        i += 256;
      }
      const tous = Float32Array.from(morceaux.flatMap((m) => Array.from(m)));
      expect(tous.length).toBe(dun.length);
      for (let k = 0; k < tous.length; k++) expect(tous[k]).toBe(dun[k]);
      expect(r.retard).toBeLessThan(2);
    });
  }
});
