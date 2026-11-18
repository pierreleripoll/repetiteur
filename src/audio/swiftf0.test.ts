// SwiftF0 en TS contre le Python du banc : les sons de `swiftf0.reference.json` (écrit par
// `uv run --script banc/hauteur.py reference`), refaits ici avec les mêmes formules. Le
// modèle tourne dans le build Node d'onnxruntime-web.
import { readFileSync } from "node:fs";
import * as ort from "onnxruntime-web";
import { beforeAll, describe, expect, it } from "vitest";
import { midiDe } from "../chant/solfege";
import { REGLAGES } from "../reglages";
import { AVANT, SwiftF0, TRAME, infererAvec, type Inferer, type Trame } from "./swiftf0";

interface Son {
  nom: string;
  f?: number;
  f_fin?: number;
  harmoniques?: number[];
  amplitude?: number;
  continu?: number;
  debut?: number;
  vibrato?: [number, number];
  bruit?: number;
  /** ce qu'en dit le Python, trame par trame */
  f0: number[];
  c: number[];
}

const REFERENCE: { duree: number; avance: number; par: number; niveau: number; plancher: number; sons: Son[] } = JSON.parse(
  readFileSync(new URL("./swiftf0.reference.json", import.meta.url), "utf8"),
);
const son = (nom: string) => REFERENCE.sons.find((s) => s.nom === nom)!;

/** Le son `s` à `fe` Hz : les mêmes calculs que `son_reference` du banc. */
function sonReference(s: Son, fe: number): Float32Array {
  const n = Math.round(REFERENCE.duree * fe);
  const x = new Float32Array(n);
  if (s.bruit !== undefined) {
    let graine = 7;
    for (let i = 0; i < n; i++) {
      graine = (graine * 16807) % 2147483647;
      x[i] = s.bruit * (graine / 2147483647 - 0.5);
    }
    return x;
  }
  const f0 = s.f ?? 220;
  const harmoniques = s.harmoniques ?? [1, 0.6, 0.4, 0.25];
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / fe;
    let f = f0 * ((s.f_fin ?? f0) / f0) ** (t / REFERENCE.duree);
    if (s.vibrato) f *= 2 ** ((s.vibrato[1] / 1200) * Math.sin(2 * Math.PI * s.vibrato[0] * t));
    phase += (2 * Math.PI * f) / fe;
    let v = 0;
    harmoniques.forEach((a, k) => (v += a * Math.sin((k + 1) * phase)));
    v *= s.amplitude ?? 0.3;
    if (t < (s.debut ?? 0)) v = 0;
    x[i] = v + (s.continu ?? 0);
  }
  return x;
}

let inferer: Inferer;

beforeAll(async () => {
  ort.env.wasm.numThreads = 1;
  inferer = await infererAvec(ort, readFileSync(new URL("./swiftf0.onnx", import.meta.url)));
});

/** Toutes les trames de `x`, données au détecteur par blocs de 256 échantillons. */
async function trames(x: Float32Array, fe: number): Promise<Trame[]> {
  const d = new SwiftF0(fe, inferer);
  const sortie: Trame[] = [];
  for (let i = 0; i < x.length; i += 256) {
    const bloc = x.subarray(i, i + 256);
    d.ajouter(bloc, ((i + bloc.length) / fe) * 1000);
    for (let t = await d.suivante(); t; t = await d.suivante()) sortie.push(t);
  }
  return sortie;
}

const cents = (a: number, b: number) => Math.abs(1200 * Math.log2(a / b));

describe("SwiftF0", () => {
  it("les réglages sont ceux de la référence", () => {
    expect(REGLAGES.avanceSwift).toBe(REFERENCE.avance);
    expect(REGLAGES.parInference).toBe(REFERENCE.par);
    expect(REGLAGES.niveauSwift).toBe(REFERENCE.niveau);
  });

  it("à 16 kHz, rend ce que rend le Python, trame par trame", async () => {
    for (const s of REFERENCE.sons) {
      const t = await trames(sonReference(s, 16000), 16000);
      // Le Python mesure aussi les dernières trames, sans tout leur avenir : pas ici.
      const groupes = Math.floor((Math.floor((REFERENCE.duree * 16000) / TRAME) - REFERENCE.avance) / REFERENCE.par);
      expect(t.length, s.nom).toBe(groupes * REFERENCE.par);
      t.forEach((x, k) => {
        expect(Math.abs(x.confiance - s.c[k]), `${s.nom}, trame ${k}`).toBeLessThan(0.02);
        // 2 cents : le décalage continu contre le silence d'avant le début (float32).
        if (s.c[k] >= REGLAGES.confianceMin) expect(cents(x.hz, s.f0[k]), `${s.nom}, trame ${k}`).toBeLessThan(2);
      });
    }
  });

  for (const fe of [48000, 44100]) {
    it(`à ${fe} Hz, rééchantillonné, à 10 cents du Python`, async () => {
      for (const nom of ["la2", "glissando", "vibrato", "décalage continu", "attaque"]) {
        const s = son(nom);
        const t = await trames(sonReference(s, fe), fe);
        let comparees = 0;
        t.forEach((x, k) => {
          // Pas les trames dont la fenêtre touche le silence d'avant le début : un son qui
          // commence d'un coup à 0 y donne n'importe quoi, dans le Python aussi (la2, trame 5 :
          // 1459 Hz, confiance 0,81). Ni, à l'attaque, la trame à moitié chantée.
          if (k < AVANT || s.c[k] < 0.5 || (s.c[k - 1] ?? 0) < 0.3) return;
          comparees++;
          expect(x.confiance, `${nom}, trame ${k}`).toBeGreaterThanOrEqual(REGLAGES.confianceMin);
          expect(cents(x.hz, s.f0[k]), `${nom}, trame ${k}`).toBeLessThan(10);
        });
        expect(comparees, nom).toBeGreaterThan(15);
      }
    });
  }

  it("les seuils : une voix douce compte, une voix trop faible se voit sans compter", async () => {
    const douce = await trames(sonReference(son("voix douce"), 48000), 48000);
    const milieu = douce.slice(AVANT);
    expect(milieu.every((t) => t.mesure.midi !== null && Math.abs(t.mesure.midi - midiDe(220)) < 0.1)).toBe(true);
    const faible = (await trames(sonReference(son("voix faible"), 48000), 48000)).slice(AVANT);
    expect(faible.every((t) => t.mesure.midi === null)).toBe(true);
    expect(faible.every((t) => t.mesure.brute !== null && Math.round(t.mesure.brute) === 57)).toBe(true); // la2
    expect(faible[10].mesure.volume).toBeLessThan(REGLAGES.volumeMin);
  });

  it("le silence et le bruit ne comptent pas, et ne se voient pas", async () => {
    for (const nom of ["silence", "bruit"]) {
      for (const t of await trames(sonReference(son(nom), 48000), 48000)) {
        expect(t.mesure.midi, nom).toBeNull();
        expect(t.mesure.brute, nom).toBeNull();
      }
    }
  });

  it("le décalage continu du micro : la note compte, le volume est celui de la voix", async () => {
    const t = (await trames(sonReference(son("décalage continu"), 48000), 48000)).slice(AVANT);
    expect(t.filter((x) => x.mesure.midi !== null && Math.abs(x.mesure.midi - midiDe(110)) < 0.1).length).toBeGreaterThan(20);
    expect(Math.max(...t.map((x) => x.mesure.volume))).toBeLessThan(0.03);
  });

  it("l'instant de la mesure est celui du son ; en direct, un retard se rattrape", async () => {
    const d = new SwiftF0(48000, inferer, REGLAGES, true);
    const x = sonReference(son("la2"), 48000);
    // Le son commence à 1000 ms.
    for (let i = 0; i < x.length; i += 256) d.ajouter(x.subarray(i, i + 256), 1000 + ((i + 256) / 48000) * 1000);
    const pretes = d.enAttente;
    expect(pretes).toBeGreaterThan(30);
    // Trop de trames prêtes : on saute au dernier groupe (2 trames de 16 ms).
    const premiere = (await d.suivante())!;
    expect(premiere.mesure.temps).toBeCloseTo(1000 + (pretes - 2) * 16, 6);
    expect((await d.suivante())!.mesure.temps).toBeCloseTo(1000 + (pretes - 1) * 16, 6);
    expect(await d.suivante()).toBeNull();
    expect(d.retard).toBeGreaterThan(64);
    expect(d.retard).toBeLessThan(66);
  });
});
