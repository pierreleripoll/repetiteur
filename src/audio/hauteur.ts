// La hauteur de la voix, mesure par mesure : la méthode de McLeod (pitchy, MIT) donne une
// fréquence et sa clarté (0 à 1). Une médiane sur les dernières mesures enlève les sauts
// d'octave isolés.

import { PitchDetector } from "pitchy";
import { midiDe } from "../chant/solfege";
import { REGLAGES, type Reglages } from "../reglages";

export interface Mesure {
  /** ms, l'horloge du contexte audio */
  temps: number;
  /** la note chantée (MIDI, avec les cents en décimales), null si rien ne compte */
  midi: number | null;
  clarte: number;
  volume: number;
  /** la note entendue, même si elle ne compte pas (voix trop faible, pas assez nette) :
   * pour voir ce que capte le micro. null si ce n'est que du bruit. */
  brute: number | null;
}

export function volume(tampon: Float32Array): number {
  let somme = 0;
  for (let i = 0; i < tampon.length; i++) somme += tampon[i] * tampon[i];
  return Math.sqrt(somme / tampon.length);
}

function mediane(valeurs: number[]): number {
  const t = [...valeurs].sort((a, b) => a - b);
  const m = t.length >> 1;
  return t.length % 2 ? t[m] : (t[m - 1] + t[m]) / 2;
}

export class Detecteur {
  private detecteur: PitchDetector<Float32Array>;
  private recentes: number[] = [];

  constructor(
    taille: number,
    private frequenceEchantillons: number,
    private reglages: Reglages = REGLAGES,
  ) {
    this.detecteur = PitchDetector.forFloat32Array(taille);
  }

  mesurer(tampon: Float32Array, temps: number): Mesure {
    const r = this.reglages;
    const v = volume(tampon);
    const [frequence, clarte] = this.detecteur.findPitch(tampon, this.frequenceEchantillons);
    const voix = frequence >= r.frequenceMin && frequence <= r.frequenceMax;
    const brute = voix && v > 0 && clarte >= r.clarteVue ? midiDe(frequence) : null;
    if (!voix || v < r.volumeMin || clarte < r.clarteMin) {
      this.recentes = [];
      return { temps, midi: null, clarte, volume: v, brute };
    }
    this.recentes.push(midiDe(frequence));
    if (this.recentes.length > r.mediane) this.recentes.shift();
    return { temps, midi: mediane(this.recentes), clarte, volume: v, brute };
  }
}
