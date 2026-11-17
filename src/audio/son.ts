// Le son de référence : une voix d'orgue douce (quelques harmoniques), pour donner le ton,
// jouer la pièce, ou tenir un bourdon. Au casque : sinon le micro l'entend aussi.

import { frequenceDe } from "../chant/solfege";
import { audio } from "./contexte";

const HARMONIQUES = [0, 1, 0.45, 0.25, 0.12, 0.06];
const ATTAQUE = 0.03;
const CHUTE = 0.08;

const timbres = new WeakMap<AudioContext, PeriodicWave>();

function timbre(ctx: AudioContext): PeriodicWave {
  let t = timbres.get(ctx);
  if (!t) {
    t = ctx.createPeriodicWave(new Float32Array(HARMONIQUES), new Float32Array(HARMONIQUES.length));
    timbres.set(ctx, t);
  }
  return t;
}

/** Une note de `debut` à `debut + duree` (s, horloge du contexte). Rend de quoi l'arrêter. */
function note(ctx: AudioContext, midi: number, debut: number, duree: number, force = 0.15) {
  const osc = ctx.createOscillator();
  osc.setPeriodicWave(timbre(ctx));
  osc.frequency.value = frequenceDe(midi);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, debut);
  gain.gain.linearRampToValueAtTime(force, debut + ATTAQUE);
  gain.gain.setValueAtTime(force, debut + Math.max(duree - CHUTE, ATTAQUE));
  gain.gain.linearRampToValueAtTime(0, debut + duree);
  osc.connect(gain).connect(ctx.destination);
  osc.start(debut);
  osc.stop(debut + duree + 0.05);
  return () => {
    gain.gain.cancelScheduledValues(ctx.currentTime);
    gain.gain.setTargetAtTime(0, ctx.currentTime, 0.02);
    osc.stop(ctx.currentTime + 0.1);
  };
}

/** Donne le ton : une note de 1,5 s. */
export async function donnerLeTon(midi: number): Promise<void> {
  const ctx = await audio();
  note(ctx, midi, ctx.currentTime + 0.02, 1.5);
}

/** Joue des notes, une pulsation chacune (`duree` pulsations). `surNote(i)` suit la
 * lecture ; `finie()` à la fin. Rend de quoi arrêter. */
export async function jouer(
  notes: { midi: number; duree: number }[],
  pulsation: number,
  surNote: (i: number) => void,
  finie: () => void,
): Promise<() => void> {
  const ctx = await audio();
  const s = pulsation / 1000;
  let t = ctx.currentTime + 0.1;
  const arrets: (() => void)[] = [];
  const minuteries: ReturnType<typeof setTimeout>[] = [];
  const depart = t;
  notes.forEach((n, i) => {
    arrets.push(note(ctx, n.midi, t, n.duree * s));
    minuteries.push(setTimeout(() => surNote(i), (t - ctx.currentTime) * 1000));
    t += n.duree * s;
  });
  minuteries.push(setTimeout(finie, (t - depart + 0.1) * 1000));
  return () => {
    arrets.forEach((a) => a());
    minuteries.forEach(clearTimeout);
    finie();
  };
}

export interface Lecture {
  arreter(): void;
  /** le temps de la pièce (en noires) à l'instant `ms` de l'horloge du contexte */
  temps(ms: number): number;
}

/** Joue des voix ensemble, en mesure, depuis le temps `depuis` (en noires). `surTemps(t)`
 * à chaque image ; `finie()` à la fin, ou à l'arrêt. */
export async function jouerVoix(
  voix: { midi: number; debut: number; duree: number }[][],
  depuis: number,
  noiresParMinute: number,
  surTemps: (t: number) => void,
  finie: () => void,
): Promise<Lecture> {
  const ctx = await audio();
  const noire = 60 / noiresParMinute;
  const t0 = ctx.currentTime + 0.15;
  const force = 0.22 / Math.sqrt(Math.max(1, voix.length));
  const arrets: (() => void)[] = [];
  let fin = depuis;
  for (const v of voix) {
    for (const n of v) {
      if (n.debut + n.duree <= depuis) continue;
      const debut = Math.max(n.debut, depuis);
      arrets.push(note(ctx, n.midi, t0 + (debut - depuis) * noire, (n.debut + n.duree - debut) * noire * 0.97, force));
      fin = Math.max(fin, n.debut + n.duree);
    }
  }
  const temps = (ms: number) => depuis + (ms / 1000 - t0) / noire;
  let image = 0;
  let terminee = false;
  const boucle = () => {
    surTemps(temps(ctx.currentTime * 1000));
    image = requestAnimationFrame(boucle);
  };
  image = requestAnimationFrame(boucle);
  const terminer = () => {
    if (terminee) return;
    terminee = true;
    cancelAnimationFrame(image);
    clearTimeout(minuterie);
    finie();
  };
  const minuterie = setTimeout(terminer, ((fin - depuis) * noire + (t0 - ctx.currentTime) + 0.2) * 1000);
  return {
    arreter() {
      arrets.forEach((a) => a());
      terminer();
    },
    temps,
  };
}

/** Le bourdon (ison) : la note tenue jusqu'à l'arrêt. */
export async function bourdon(midi: number): Promise<() => void> {
  const ctx = await audio();
  return note(ctx, midi, ctx.currentTime + 0.02, 3600, 0.08);
}
