<script setup lang="ts">
// La partition gravée par exsurge, à la largeur de la page. Les notes du curseur sont au
// minium ; après la pièce, les notes fausses aussi. Un clic sur une note la choisit.
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { graver, idNote, lire, type Partition } from "../chant/partition";

const props = defineProps<{
  gabc: string;
  /** les notes du curseur (rangs) */
  courantes: number[];
  /** les notes chantées faux, après la pièce */
  fausses: Set<number>;
}>();
const emit = defineEmits<{
  lue: [p: Partition];
  choisir: [note: number];
  erreur: [message: string];
}>();

const boite = ref<HTMLDivElement>();
let partition: Partition | null = null;
let largeur = 0;
let observateur: ResizeObserver | null = null;
let attente: ReturnType<typeof setTimeout> | undefined;

async function lireEtGraver() {
  if (!boite.value) return;
  // exsurge mesure le texte au canvas : la police doit être là avant.
  await document.fonts.load("22px 'EB Garamond'").catch(() => undefined);
  try {
    partition = lire(props.gabc);
  } catch (e) {
    partition = null;
    boite.value.replaceChildren();
    emit("erreur", `GABC illisible : ${e instanceof Error ? e.message : e}`);
    return;
  }
  emit("lue", partition);
  await afficher();
}

async function afficher() {
  if (!boite.value || !partition) return;
  largeur = boite.value.clientWidth;
  const svg = await graver(partition, largeur);
  boite.value.replaceChildren(svg);
  marquer();
}

function marquer() {
  const b = boite.value;
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
  observateur = new ResizeObserver(() => {
    if (!boite.value || Math.abs(boite.value.clientWidth - largeur) < 24) return;
    clearTimeout(attente);
    attente = setTimeout(afficher, 150);
  });
  if (boite.value) observateur.observe(boite.value);
});
onBeforeUnmount(() => observateur?.disconnect());
</script>

<template>
  <div ref="boite" class="partition" @click="clic"></div>
</template>

<style scoped>
.partition {
  width: 100%;
  min-height: 4rem;
  fill: var(--encre);
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
