// Ce que la répétition garde d'une fois sur l'autre, dans ce navigateur : le do choisi
// pour chaque pièce, la voix chantée d'une pièce à plusieurs voix, pitchy au lieu de SwiftF0.

import { defineStore } from "pinia";
import { ref, watch } from "vue";

function lireLocal(cle: string): string | null {
  try {
    return localStorage.getItem(cle);
  } catch {
    return null;
  }
}

function ecrireLocal(cle: string, valeur: string): void {
  try {
    localStorage.setItem(cle, valeur);
  } catch {
    // stockage refusé (navigation privée) : on garde en mémoire seulement
  }
}

export const useRepetition = defineStore("repetition", () => {
  /** mesurer la voix avec pitchy (pour comparer), pas avec SwiftF0 */
  const pitchySeul = ref(lireLocal("scriptorium:pitchy-seul") === "oui");
  watch(pitchySeul, (v) => ecrireLocal("scriptorium:pitchy-seul", v ? "oui" : "non"));

  /** Le do gardé pour la pièce `cle`, ou `defaut`. */
  function doPour(cle: string, defaut: number): number {
    const v = Number(lireLocal(`scriptorium:do:${cle}`));
    return lireLocal(`scriptorium:do:${cle}`) !== null && Number.isFinite(v) ? v : defaut;
  }

  function garderDo(cle: string, midi: number): void {
    ecrireLocal(`scriptorium:do:${cle}`, String(midi));
  }

  /** La voix chantée dans la pièce à plusieurs voix `cle`, ou `defaut`. */
  function voixPour(cle: string, defaut: number): number {
    const v = lireLocal(`scriptorium:voix:${cle}`);
    return v !== null && Number.isInteger(Number(v)) ? Number(v) : defaut;
  }

  function garderVoix(cle: string, rang: number): void {
    ecrireLocal(`scriptorium:voix:${cle}`, String(rang));
  }

  return { pitchySeul, doPour, garderDo, voixPour, garderVoix };
});
