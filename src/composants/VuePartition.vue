<script setup lang="ts">
// La partition gravée par exsurge, à la largeur de la page. Les notes du curseur sont au
// minium ; après la pièce, les notes fausses aussi. Un clic sur une note la choisit. Par
// dessus, la voix du chanteur en trait rouge (`voixSurPortee.ts`).
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { graver, idNote, lire, type Partition } from "../chant/partition";
import { dessiner, mesurer, type Geometrie, type Voix } from "./voixSurPortee";

const props = defineProps<{
  gabc: string;
  /** les notes du curseur (rangs) */
  courantes: number[];
  /** les notes chantées faux, après la pièce */
  fausses: Set<number>;
  /** la voix à dessiner sur la portée */
  voix: Voix | null;
}>();
const emit = defineEmits<{
  lue: [p: Partition];
  choisir: [note: number];
  erreur: [message: string];
}>();

const boite = ref<HTMLDivElement>();
const gravure = ref<HTMLDivElement>();
const toile = ref<HTMLCanvasElement>();
let partition: Partition | null = null;
let geometrie: Geometrie | null = null;
let image = 0;
let largeur = 0;
let observateur: ResizeObserver | null = null;
let attente: ReturnType<typeof setTimeout> | undefined;

async function lireEtGraver() {
  if (!gravure.value) return;
  // exsurge mesure le texte au canvas : la police doit être là avant.
  await document.fonts.load("22px 'EB Garamond'").catch(() => undefined);
  try {
    partition = lire(props.gabc);
  } catch (e) {
    partition = null;
    geometrie = null;
    gravure.value.replaceChildren();
    emit("erreur", `GABC illisible : ${e instanceof Error ? e.message : e}`);
    return;
  }
  emit("lue", partition);
  await afficher();
}

async function afficher() {
  if (!boite.value || !gravure.value || !partition) return;
  largeur = boite.value.clientWidth;
  const svg = await graver(partition, largeur);
  gravure.value.replaceChildren(svg);
  geometrie = mesurer(boite.value, svg, partition.notes, partition.contexte.noteIdPrefix);
  marquer();
}

/** À chaque image : la voix sur la portée. */
function peindre() {
  image = requestAnimationFrame(peindre);
  if (!toile.value || !geometrie || !partition || !props.voix) return;
  const minium = getComputedStyle(document.documentElement).getPropertyValue("--minium").trim() || "#C22310";
  dessiner(toile.value, geometrie, partition.notes, props.voix, minium);
}

function marquer() {
  const b = gravure.value;
  if (!b) return;
  b.querySelectorAll("use.note.courante, use.note.fausse").forEach((n) => n.classList.remove("courante", "fausse"));
  const glyphe = (i: number) => b.querySelector(`[id="${idNote(i, partition?.contexte)}"]`);
  props.fausses.forEach((i) => glyphe(i)?.classList.add("fausse"));
  props.courantes.forEach((i) => glyphe(i)?.classList.add("courante"));
  if (props.courantes.length) {
    glyphe(props.courantes[0])?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }
}

function clic(e: MouseEvent) {
  const note = (e.target as Element).closest("use.note");
  const n = note?.id.match(/(\d+)$/);
  if (n) emit("choisir", Number(n[1]) - 1);
}

watch(() => props.gabc, lireEtGraver);
watch(() => [props.courantes, props.fausses], marquer);

onMounted(() => {
  lireEtGraver();
  image = requestAnimationFrame(peindre);
  observateur = new ResizeObserver(() => {
    if (!boite.value || Math.abs(boite.value.clientWidth - largeur) < 24) return;
    clearTimeout(attente);
    attente = setTimeout(afficher, 150);
  });
  if (boite.value) observateur.observe(boite.value);
});
onBeforeUnmount(() => {
  observateur?.disconnect();
  cancelAnimationFrame(image);
});
</script>

<template>
  <div ref="boite" class="partition" @click="clic">
    <div ref="gravure"></div>
    <canvas ref="toile" class="voix"></canvas>
  </div>
</template>

<style scoped>
.partition {
  position: relative;
  width: 100%;
  min-height: 4rem;
  fill: var(--encre);
}
/* Le trait de la voix, par-dessus la gravure ; les clics passent aux notes. */
.voix {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
.partition :deep(svg) {
  display: block;
  overflow: visible;
}
.partition :deep(use.note) {
  cursor: pointer;
}
.partition :deep(use.note.fausse),
.partition :deep(use.note.courante) {
  fill: var(--minium);
}
</style>
