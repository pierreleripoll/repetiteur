// Le micro : sans les traitements du navigateur (annulation d'écho, réduction de bruit,
// gain automatique), qui abîment une voix chantée. Toutes les `periode` ms, les derniers
// `taille` échantillons vont à `surTampon`.

import { REGLAGES } from "../reglages";
import { audio } from "./contexte";

export interface Micro {
  frequenceEchantillons: number;
  arreter(): void;
}

export async function ouvrirMicro(
  taille: number,
  surTampon: (tampon: Float32Array, temps: number) => void,
): Promise<Micro> {
  const flux = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
  });
  const ctx = await audio();
  const source = ctx.createMediaStreamSource(flux);
  const analyse = ctx.createAnalyser();
  analyse.fftSize = taille;
  source.connect(analyse);
  const tampon = new Float32Array(taille);
  const minuterie = setInterval(() => {
    analyse.getFloatTimeDomainData(tampon);
    surTampon(tampon, ctx.currentTime * 1000);
  }, REGLAGES.periode);
  return {
    frequenceEchantillons: ctx.sampleRate,
    arreter() {
      clearInterval(minuterie);
      source.disconnect();
      flux.getTracks().forEach((p) => p.stop());
    },
  };
}
