<script setup lang="ts">
// Ce que capte le micro, comme un accordeur : le niveau et la netteté (avec leur seuil),
// la note entendue (même si elle ne compte pas), et si elle est trop grave ou trop aiguë
// par rapport à la note à chanter. Et pourquoi une mesure ne compte pas.
import { computed } from "vue";
import type { Mesure } from "../audio/hauteur";
import { cents, frequenceDe, nomNote } from "../chant/solfege";
import { REGLAGES } from "../reglages";

const props = defineProps<{
  mesure: Mesure | null;
  /** la note à chanter (MIDI), ou null */
  cible: number | null;
  /** le nom de l'entrée du micro */
  micro: string;
  /** le contexte audio est en pause */
  enPause: boolean;
}>();

const DB_MIN = -70; // le bas de la barre de niveau
const ECHELLE = 200; // cents : l'aiguille est au bord au-delà

const db = (v: number) => (v > 0 ? 20 * Math.log10(v) : -Infinity);
const part = (d: number) => Math.max(0, Math.min(1, (d - DB_MIN) / -DB_MIN));
const pourcent = (x: number) => `${(x * 100).toFixed(1)}%`;

const niveau = computed(() => db(props.mesure?.volume ?? 0));
const seuilNiveau = part(db(REGLAGES.volumeMin));
const clarte = computed(() => Math.max(0, props.mesure?.clarte ?? 0));
const compte = computed(() => props.mesure?.midi != null);
const note = computed(() => props.mesure?.midi ?? props.mesure?.brute ?? null);

const raison = computed(() => {
  const m = props.mesure;
  if (props.enPause) return "Le son du navigateur est en pause : coupez et rouvrez le micro.";
  if (!m || compte.value) return "";
  if (m.volume < 1e-4) return "Le micro ne reçoit rien : vérifiez l'entrée choisie (réglages du son, ou l'icône micro de la barre d'adresse).";
  if (m.volume < REGLAGES.volumeMin) return "Trop faible : chantez plus fort, rapprochez-vous, ou montez le volume d'entrée du micro.";
  if (m.clarte < REGLAGES.clarteMin) return "Pas assez net pour compter : tenez une voyelle.";
  return "Hors des fréquences d'une voix.";
});

const ecart = computed(() =>
  note.value !== null && props.cible !== null ? (note.value - props.cible) * 100 : null,
);
const sens = computed(() => {
  const e = ecart.value;
  if (e === null) return "";
  if (Math.abs(e) <= REGLAGES.horsJustesse) return `juste (${cents(e)})`;
  const s = e < 0 ? "trop grave" : "trop aigu";
  if (Math.abs(e) < 100) return `un peu ${s} (${cents(e)})`;
  const n = Math.round(Math.abs(e) / 100);
  return `${s} de ${n} demi-ton${n > 1 ? "s" : ""}`;
});
const aiguille = computed(() =>
  ecart.value === null ? null : 0.5 + Math.max(-1, Math.min(1, ecart.value / ECHELLE)) / 2,
);
const juste = computed(() => ecart.value !== null && Math.abs(ecart.value) <= REGLAGES.tolerance);
</script>

<template>
  <div class="accordeur machine" :data-compte="compte">
    <span class="jauge" title="le niveau du micro ; le trait : le seuil">
      niveau
      <span class="barre">
        <span class="plein" :class="{ bas: niveau < db(REGLAGES.volumeMin) }" :style="{ width: pourcent(part(niveau)) }"></span>
        <span class="seuil" :style="{ left: pourcent(seuilNiveau) }"></span>
      </span>
      <span class="chiffre">{{ Number.isFinite(niveau) ? Math.round(niveau) + " dB" : "—" }}</span>
    </span>
    <span class="jauge" title="la netteté de la note (clarté) ; le trait : le seuil">
      netteté
      <span class="barre">
        <span class="plein" :class="{ bas: clarte < REGLAGES.clarteMin }" :style="{ width: pourcent(clarte) }"></span>
        <span class="seuil" :style="{ left: pourcent(REGLAGES.clarteMin) }"></span>
      </span>
      <span class="chiffre">{{ clarte.toFixed(2) }}</span>
    </span>
    <span class="note" :class="{ compte }" title="la note entendue ; grise si elle ne compte pas">
      {{ note !== null ? `${nomNote(note)} · ${Math.round(frequenceDe(note))} Hz` : "—" }}
    </span>
    <span v-if="cible !== null" class="justesse" title="par rapport à la note à chanter, ±2 demi-tons">
      <span class="barre">
        <span class="zone" :style="{ left: pourcent(0.5 - REGLAGES.tolerance / ECHELLE / 2), width: pourcent(REGLAGES.tolerance / ECHELLE) }"></span>
        <span class="milieu"></span>
        <span v-if="aiguille !== null" class="aiguille" :class="{ juste }" :style="{ left: pourcent(aiguille) }"></span>
      </span>
      <span>{{ sens }}</span>
    </span>
    <p v-if="raison" class="raison">{{ raison }}</p>
    <p v-if="micro" class="entree">entrée : {{ micro }}</p>
  </div>
</template>

<style scoped>
.accordeur {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem 1.2rem;
  margin: 0.6rem 0;
}
.jauge,
.justesse {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}
.barre {
  position: relative;
  display: inline-block;
  width: 6rem;
  height: 0.6rem;
  border: var(--filet) solid var(--encre);
}
.justesse .barre {
  width: 9rem;
}
.plein {
  position: absolute;
  inset: 0 auto 0 0;
  background: var(--encre);
}
.plein.bas {
  background: var(--minium);
}
.seuil,
.milieu {
  position: absolute;
  top: -0.2rem;
  bottom: -0.2rem;
  width: var(--filet);
  background: var(--encre);
}
.milieu {
  left: 50%;
}
.zone {
  position: absolute;
  inset: 0 auto;
  background: var(--encre);
  opacity: 0.15;
}
.aiguille {
  position: absolute;
  top: -0.25rem;
  bottom: -0.25rem;
  width: 0.2rem;
  margin-left: -0.1rem;
  background: var(--minium);
}
.aiguille.juste {
  background: var(--encre);
}
.chiffre {
  min-width: 3.2rem;
}
.note {
  min-width: 7rem;
  font-size: 0.9rem;
  opacity: 0.45;
}
.note.compte {
  opacity: 1;
}
.raison,
.entree {
  flex-basis: 100%;
  margin: 0;
}
.raison {
  color: var(--minium);
}
.entree {
  opacity: 0.6;
}
</style>
