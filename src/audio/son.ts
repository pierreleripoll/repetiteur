// Le son de référence : une voix d'orgue douce (quelques harmoniques), pour donner le ton,
// jouer la pièce, ou tenir un bourdon. Au casque : sinon le micro l'entend aussi.

import { frequenceDe } from "../chant/solfege";
import { audio } from "./contexte";

const HARMONIQUES = [0, 1, 0.45, 0.25, 0.12, 0.06];
const ATTAQUE = 0.03;
const CHUTE = 0.08;

function timbre(ctx: AudioContext): PeriodicWave {
  return ctx.createPeriodicWave(new Float32Array(HARMONIQUES), new Float32Array(HARMONIQUES.length));
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

/** Le bourdon (ison) : la note tenue jusqu'à l'arrêt. */
export async function bourdon(midi: number): Promise<() => void> {
  const ctx = await audio();
  return note(ctx, midi, ctx.currentTime + 0.02, 3600, 0.08);
}
