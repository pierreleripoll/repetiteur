// Le micro : sans les traitements du navigateur (annulation d'écho, réduction de bruit,
// gain automatique), qui abîment une voix chantée. Un `AudioWorklet` (`capteur.worklet.js`)
// donne le son en blocs de 256 échantillons qui se suivent, chacun avec l'instant de sa fin
// (ms, l'horloge du contexte audio, celle du son joué).

import urlCapteur from "./capteur.worklet.js?url";
import { audio } from "./contexte";

export interface Micro {
  frequenceEchantillons: number;
  /** le nom de l'entrée choisie par le navigateur (« Micro interne… ») */
  nom: string;
  /** le contexte audio est en pause : le capteur ne reçoit rien */
  enPause(): boolean;
  arreter(): void;
}

const capteurs = new WeakMap<BaseAudioContext, Promise<void>>();

export async function ouvrirMicro(surBloc: (bloc: Float32Array, fin: number) => void): Promise<Micro> {
  const flux = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
  });
  const ctx = await audio();
  if (!capteurs.has(ctx)) capteurs.set(ctx, ctx.audioWorklet.addModule(urlCapteur));
  await capteurs.get(ctx);
  const source = ctx.createMediaStreamSource(flux);
  // Sans sortie : Chrome le fait tourner quand même (rien ne va aux haut-parleurs).
  const capteur = new AudioWorkletNode(ctx, "capteur", {
    numberOfInputs: 1,
    numberOfOutputs: 0,
    channelCount: 1,
    channelCountMode: "explicit",
  });
  capteur.port.onmessage = (e: MessageEvent<{ bloc: Float32Array; fin: number }>) =>
    surBloc(e.data.bloc, (e.data.fin / ctx.sampleRate) * 1000);
  source.connect(capteur);
  const piste = flux.getAudioTracks()[0];
  console.info("[micro]", piste?.label, piste?.getSettings(), "contexte", ctx.state, ctx.sampleRate);
  return {
    frequenceEchantillons: ctx.sampleRate,
    nom: piste?.label ?? "",
    enPause: () => ctx.state !== "running",
    arreter() {
      capteur.port.onmessage = null;
      source.disconnect();
      flux.getTracks().forEach((p) => p.stop());
    },
  };
}
