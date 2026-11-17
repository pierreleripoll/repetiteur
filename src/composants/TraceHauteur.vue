<script setup lang="ts">
// La voix, en trait, sur les degrés de la pièce. Les lignes sont à leur vraie distance en
// demi-tons : mi-fa et si-do sont serrés. La ligne de la note à chanter est au minium.
import { onBeforeUnmount, onMounted, ref } from "vue";
import type { Mesure } from "../audio/hauteur";

export interface Ligne {
  midi: number;
  nom: string;
}

const props = defineProps<{
  /** les dernières mesures (le parent ajoute, la trace lit à chaque image) */
  mesures: Mesure[];
  lignes: Ligne[];
  /** la note à chanter (MIDI), ou null */
  cible: number | null;
}>();

const FENETRE = 8000; // ms affichées
const HAUTEUR = 200; // px

const toile = ref<HTMLCanvasElement>();
let image = 0;

function couleur(nom: string, defaut: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(nom).trim() || defaut;
}

function dessiner() {
  image = requestAnimationFrame(dessiner);
  const c = toile.value;
  if (!c) return;
  const ratio = window.devicePixelRatio || 1;
  const l = c.clientWidth;
  if (c.width !== Math.round(l * ratio)) {
    c.width = Math.round(l * ratio);
    c.height = Math.round(HAUTEUR * ratio);
  }
  const g = c.getContext("2d");
  if (!g) return;
  g.setTransform(ratio, 0, 0, ratio, 0, 0);
  g.clearRect(0, 0, l, HAUTEUR);
  const encre = couleur("--encre", "#201E15");
  const minium = couleur("--minium", "#C22310");

  const hauteurs = props.lignes.map((x) => x.midi);
  if (!hauteurs.length) return;
  const bas = Math.min(...hauteurs) - 1.5;
  const haut = Math.max(...hauteurs) + 1.5;
  const y = (midi: number) => HAUTEUR - ((midi - bas) / (haut - bas)) * HAUTEUR;
  const gauche = 44;

  g.font = "11px 'Nimbus Sans', sans-serif";
  g.textBaseline = "middle";
  for (const ligne of props.lignes) {
    const cible = props.cible !== null && Math.abs(ligne.midi - props.cible) < 0.01;
    g.strokeStyle = cible ? minium : encre;
    g.fillStyle = cible ? minium : encre;
    g.globalAlpha = cible ? 1 : 0.35;
    g.lineWidth = cible ? 1.5 : 0.75;
    g.beginPath();
    g.moveTo(gauche, y(ligne.midi));
    g.lineTo(l, y(ligne.midi));
    g.stroke();
    g.globalAlpha = cible ? 1 : 0.7;
    g.fillText(ligne.nom, 4, y(ligne.midi));
  }
  g.globalAlpha = 1;

  const mesures = props.mesures;
  if (!mesures.length) return;
  const maintenant = mesures[mesures.length - 1].temps;
  const x = (t: number) => gauche + ((t - (maintenant - FENETRE)) / FENETRE) * (l - gauche);
  g.strokeStyle = encre;
  g.lineWidth = 2;
  g.beginPath();
  let leve = true;
  for (const m of mesures) {
    if (m.temps < maintenant - FENETRE || m.midi === null || m.midi < bas || m.midi > haut) {
      leve = true;
      continue;
    }
    if (leve) g.moveTo(x(m.temps), y(m.midi));
    else g.lineTo(x(m.temps), y(m.midi));
    leve = false;
  }
  g.stroke();
}

onMounted(() => (image = requestAnimationFrame(dessiner)));
onBeforeUnmount(() => cancelAnimationFrame(image));
</script>

<template>
  <canvas ref="toile" class="trace" :style="{ height: HAUTEUR + 'px' }"></canvas>
</template>

<style scoped>
.trace {
  display: block;
  width: 100%;
  border-top: var(--filet) solid var(--encre);
  border-bottom: var(--filet) solid var(--encre);
}
</style>
