// La hauteur de la voix par pitchy, en secours de SwiftF0 (`swiftf0.ts`) : pendant que le
// modèle se charge, s'il échoue, ou si on le demande (`?detecteur=pitchy`).
//
// Mesure par mesure : la méthode de McLeod (pitchy, MIT) donne une
// fréquence et sa clarté (0 à 1). Une médiane sur les dernières mesures enlève les sauts
// d'octave isolés.
//
// Une mesure compte si elle est nette (`clarteMin`). Une voix déjà suivie compte encore,
// moins nette (`clarteGarde`), tant qu'elle ne saute pas : dans une église ou du bruit, la
// clarté d'une note tenue tombe souvent sous le seuil, et la note se perdait.
//
// On retire d'abord la moyenne de la fenêtre. Le micro interne du ThinkPad a un fort
// décalage continu (+0,09 et +0,33 sur ses deux canaux) : avec lui, le volume ne dit rien
// (−14 dB dans le silence) et McLeod ne trouve pas la période. D'habitude, le filtre
// passe-haut du navigateur l'enlève, mais on coupe ses traitements (`micro.ts`).

import { PitchDetector } from "pitchy";
import { midiDe } from "../chant/solfege";
import { REGLAGES, type Reglages } from "../reglages";

export interface Mesure {
  /** ms, l'horloge du contexte audio : l'instant du son mesuré (le retard du détecteur
   * est retiré) */
  temps: number;
  /** la note chantée (MIDI, avec les cents en décimales), null si rien ne compte */
  midi: number | null;
  /** la netteté de la note, 0 à 1 : la clarté de McLeod, ou la confiance de SwiftF0 */
  clarte: number;
  /** le seuil de netteté du détecteur (pour l'accordeur) */
  seuil: number;
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
  /** la dernière mesure qui a compté (MIDI brut), null après un silence */
  private derniere: number | null = null;
  private travail: Float32Array;

  constructor(
    taille: number,
    private frequenceEchantillons: number,
    private reglages: Reglages = REGLAGES,
  ) {
    this.detecteur = PitchDetector.forFloat32Array(taille);
    this.travail = new Float32Array(taille);
  }

  mesurer(tampon: Float32Array, temps: number): Mesure {
    const r = this.reglages;
    let moyenne = 0;
    for (let i = 0; i < tampon.length; i++) moyenne += tampon[i];
    moyenne /= tampon.length;
    const t = this.travail;
    for (let i = 0; i < t.length; i++) t[i] = tampon[i] - moyenne;
    const v = volume(t);
    const [frequence, clarte] = this.detecteur.findPitch(t, this.frequenceEchantillons);
    const voix = frequence >= r.frequenceMin && frequence <= r.frequenceMax;
    const brute = voix && v > 0 && clarte >= r.clarteVue ? midiDe(frequence) : null;
    const midi = midiDe(frequence);
    const nette = clarte >= r.clarteMin;
    const suite = this.derniere !== null && clarte >= r.clarteGarde && Math.abs(midi - this.derniere) < r.sautGarde;
    if (!voix || v < r.volumeMin || !(nette || suite)) {
      this.recentes = [];
      this.derniere = null;
      return { temps, midi: null, clarte, seuil: r.clarteMin, volume: v, brute };
    }
    this.derniere = midi;
    this.recentes.push(midi);
    if (this.recentes.length > r.mediane) this.recentes.shift();
    return { temps, midi: mediane(this.recentes), clarte, seuil: r.clarteMin, volume: v, brute };
  }
}
