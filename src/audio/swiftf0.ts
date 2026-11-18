// La hauteur de la voix par SwiftF0 (swift-f0 0.3.0, Lars Nieradzik, MIT ; `swiftf0.onnx`,
// 135 Ko, et sa licence `swiftf0.LICENSE`). Le modèle prend du son à 16 kHz et rend, pour
// chaque trame de 256 échantillons (16 ms), une hauteur et une confiance (0 à 1).
//
// En direct, comme `swiftf0_direct` du banc (`banc/hauteur.py`) : une inférence mesure
// `parInference` trames (2), dès que `avanceSwift` trames suivent la dernière (2 : 48 ms
// de retard, 64 pour la première), avec les 11 trames d'avant ; on lit la sortie du modèle
// à la place de chaque trame. Une inférence prend environ 6 ms : une toutes les 32 ms, pas
// toutes les 16, coûte deux fois moins (19 % d'un cœur). Avant le début : du silence. Chaque
// fenêtre est d'abord `normer` : sans sa moyenne (le décalage continu du micro du ThinkPad,
// PLAN §9) et au même niveau (−20 dB), car la confiance du modèle tombe avec le niveau.
// Le volume de la `Mesure`, lui, est celui du micro : `volumeMin` garde le silence dehors.
//
// Ici, rien d'onnxruntime ni du navigateur : l'inférence vient de `infererAvec` (le worker
// `swiftf0.worker.ts` dans la page, le build Node d'onnxruntime-web dans vitest et le banc).

import type * as Ort from "onnxruntime-web";
import { midiDe } from "../chant/solfege";
import { REGLAGES, type Reglages } from "../reglages";
import type { Mesure } from "./hauteur";
import { Reechantillonneur } from "./reechantillonner";

export const FE_MODELE = 16000;
export const TRAME = 256;
/** les trames d'avant que voit le modèle : son champ réceptif (`LEFT_FRAMES` de swift-f0) */
export const AVANT = 11;
const FMIN = 46.875;
const FMAX = 2093.75;
/** une trame dont le son reste sous ce pic a une confiance nulle (`SILENCE_PEAK`) */
const SILENCE = 1e-3;
/** RMS sous lequel `normer` n'amplifie plus (`PLANCHER_SWIFT` du banc) */
const PLANCHER = 1e-4;
/** au-delà, en direct, on saute aux dernières trames (le calcul a pris du retard) */
const ATTENTE_MAX = 3;

export type Inferer = (audio: Float32Array) => Promise<{ pitch: Float32Array; confidence: Float32Array }>;

/** La session du modèle, et une inférence sur une fenêtre de son à 16 kHz. */
export async function infererAvec(ort: typeof Ort, modele: Uint8Array): Promise<Inferer> {
  const session = await ort.InferenceSession.create(modele);
  const fmin = new ort.Tensor("float32", new Float32Array([FMIN]), []);
  const fmax = new ort.Tensor("float32", new Float32Array([FMAX]), []);
  return async (audio) => {
    const r = await session.run({ audio: new ort.Tensor("float32", audio, [1, audio.length]), fmin, fmax });
    return { pitch: r.pitch.data as Float32Array, confidence: r.confidence.data as Float32Array };
  };
}

/** La fenêtre sans sa moyenne, au niveau `niveau` (dB, RMS). Comme `normer` du banc. */
export function normer(fenetre: Float32Array, niveau: number): Float32Array {
  let moyenne = 0;
  for (let i = 0; i < fenetre.length; i++) moyenne += fenetre[i];
  moyenne /= fenetre.length;
  let somme = 0;
  for (let i = 0; i < fenetre.length; i++) somme += (fenetre[i] - moyenne) ** 2;
  const gain = 10 ** (niveau / 20) / Math.max(Math.sqrt(somme / fenetre.length), PLANCHER);
  return fenetre.map((x) => (x - moyenne) * gain);
}

export interface Trame {
  mesure: Mesure;
  /** la sortie du modèle, sans seuil */
  hz: number;
  confiance: number;
}

export class SwiftF0 {
  private reech: Reechantillonneur | null;
  /** le son à 16 kHz, depuis l'indice `base` (négatif au début : le silence d'avant) */
  private son = new Float32Array(AVANT * TRAME);
  private base = -AVANT * TRAME;
  /** les échantillons à 16 kHz reçus */
  private recus = 0;
  /** la prochaine trame à mesurer (le début d'un groupe de `parInference`) */
  private i = 0;
  /** les trames mesurées, pas encore rendues */
  private pretes: Trame[] = [];
  /** ms : l'instant du premier échantillon */
  private origine: number | null = null;

  constructor(
    private feEntree: number,
    private inferer: Inferer,
    private reglages: Reglages = REGLAGES,
    /** en direct : sauter aux dernières trames si le calcul prend du retard (pas au banc) */
    private sauter = false,
  ) {
    this.reech = feEntree === FE_MODELE ? null : new Reechantillonneur(feEntree, FE_MODELE);
  }

  /** ms de son à attendre après un instant pour avoir sa mesure (au plus : la première
   * trame d'un groupe) */
  get retard(): number {
    const r = this.reglages;
    return ((r.avanceSwift + r.parInference) * TRAME * 1000) / FE_MODELE + (this.reech?.retard ?? 0);
  }

  /** Un bloc du micro ; `fin` : l'instant (ms) de la fin du bloc. */
  ajouter(bloc: Float32Array, fin: number): void {
    this.origine ??= fin - (bloc.length / this.feEntree) * 1000;
    const y = this.reech ? this.reech.pousser(bloc) : bloc;
    const tout = new Float32Array(this.son.length + y.length);
    tout.set(this.son);
    tout.set(y, this.son.length);
    this.son = tout;
    this.recus += y.length;
  }

  /** les groupes de trames prêts à mesurer */
  private get groupes(): number {
    const r = this.reglages;
    return Math.max(0, Math.floor((Math.floor(this.recus / TRAME) - r.avanceSwift - this.i) / r.parInference));
  }

  /** les trames prêtes (mesurées ou à mesurer), pas encore rendues */
  get enAttente(): number {
    return this.pretes.length + this.groupes * this.reglages.parInference;
  }

  /** La prochaine trame prête, mesurée ; null s'il n'y en a pas. */
  async suivante(): Promise<Trame | null> {
    if (this.pretes.length) return this.pretes.shift()!;
    const groupes = this.groupes;
    if (!groupes) return null;
    const r = this.reglages;
    const par = r.parInference;
    if (this.sauter && groupes * par > ATTENTE_MAX) this.i += (groupes - 1) * par;
    const i = this.i;
    this.i += par;
    const debut = (i - AVANT) * TRAME - this.base;
    const fenetre = this.son.slice(debut, debut + (AVANT + r.avanceSwift + par) * TRAME);
    // Garder le son des trames à venir (le groupe suivant remonte de AVANT trames).
    const garder = (this.i - AVANT) * TRAME - this.base;
    if (garder > 0) {
      this.son = this.son.slice(garder);
      this.base += garder;
    }
    const entree = normer(fenetre, r.niveauSwift);
    const { pitch, confidence } = await this.inferer(entree);
    for (let j = 0; j < par; j++) {
      const k = AVANT + j; // la trame i + j dans la fenêtre
      const hz = pitch[k];
      let pic = 0;
      for (let n = k * TRAME; n < (k + 1) * TRAME; n++) pic = Math.max(pic, Math.abs(entree[n]));
      const confiance = pic < SILENCE ? 0 : confidence[k];
      const volume = volumeSansMoyenne(fenetre.subarray((k - 1) * TRAME, (k + 1) * TRAME));
      const voix = hz >= r.frequenceMin && hz <= r.frequenceMax;
      const compte = voix && confiance >= r.confianceMin && volume >= r.volumeMin;
      const mesure: Mesure = {
        temps: this.origine! + ((i + j) * TRAME * 1000) / FE_MODELE,
        midi: compte ? midiDe(hz) : null,
        clarte: confiance,
        seuil: r.confianceMin,
        volume,
        brute: voix && volume > 0 && confiance >= r.confianceVue ? midiDe(hz) : null,
      };
      this.pretes.push({ mesure, hz, confiance });
    }
    return this.pretes.shift()!;
  }
}

/** Le RMS sans la moyenne (le décalage continu ne compte pas). */
function volumeSansMoyenne(x: Float32Array): number {
  let moyenne = 0;
  for (let i = 0; i < x.length; i++) moyenne += x[i];
  moyenne /= x.length;
  let somme = 0;
  for (let i = 0; i < x.length; i++) somme += (x[i] - moyenne) ** 2;
  return Math.sqrt(somme / x.length);
}
