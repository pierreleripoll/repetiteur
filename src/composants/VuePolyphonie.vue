<script setup lang="ts">
// Une pièce à plusieurs voix, gravée par Verovio (chargé à la demande : 7 Mo). La voix
// choisie est à l'encre, les autres en gris ; ses notes du curseur au minium, et après la
// pièce ses notes fausses. Un clic sur une de ses notes la choisit. Par-dessus, la voix du
// chanteur en trait rouge (`voixSurPortee.ts`), comme sur une partition grégorienne.
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { VerovioToolkit } from "verovio/esm";
import type { NoteChant } from "../chant/partition";
import { lireMusicXml, pourVerovio, type Polyphonie } from "../chant/polyphonie";
import { dessiner, mesurerVerovio, type Geometrie, type Voix } from "./voixSurPortee";

const props = defineProps<{
  musicxml: string;
  /** la voix du chanteur (rang dans la pièce) */
  voixChoisie: number;
  /** ses notes, pour le trait (hauteur depuis le do) */
  notes: NoteChant[];
  courantes: number[];
  fausses: Set<number>;
  voix: Voix | null;
}>();
const emit = defineEmits<{
  lue: [p: Polyphonie];
  choisir: [note: number];
  erreur: [message: string];
}>();

const ECHELLE = 40; // % : la taille des notes de Verovio

let chargement: Promise<VerovioToolkit> | null = null;
function verovio(): Promise<VerovioToolkit> {
  chargement ??= Promise.all([import("verovio/wasm"), import("verovio/esm")]).then(
    async ([wasm, esm]) => new esm.VerovioToolkit(await wasm.default()),
  );
  return chargement;
}

const boite = ref<HTMLDivElement>();
const gravure = ref<HTMLDivElement>();
const toile = ref<HTMLCanvasElement>();
const attente = ref("");
let polyphonie: Polyphonie | null = null;
/** les `g.note` de chaque voix, dans l'ordre de ses notes */
let parVoix: Element[][] = [];
let geometrie: Geometrie | null = null;
let largeur = 0;
let image = 0;
let observateur: ResizeObserver | null = null;
let minuterie: ReturnType<typeof setTimeout> | undefined;

async function lireEtGraver() {
  try {
    polyphonie = lireMusicXml(props.musicxml);
  } catch (e) {
    polyphonie = null;
    gravure.value?.replaceChildren();
    emit("erreur", `MusicXML illisible : ${e instanceof Error ? e.message : e}`);
    return;
  }
  emit("lue", polyphonie);
  await afficher();
}

async function afficher() {
  if (!boite.value || !gravure.value || !polyphonie) return;
  attente.value = "Gravure…";
  const tk = await verovio();
  attente.value = "";
  largeur = boite.value.clientWidth;
  tk.setOptions({
    pageWidth: Math.round((largeur * 100) / ECHELLE),
    pageHeight: 60000, // une seule page : tous les systèmes à la suite
    adjustPageHeight: true,
    breaks: "auto",
    scale: ECHELLE,
    header: "none",
    footer: "none",
    pageMarginLeft: 0,
    pageMarginRight: 0,
    pageMarginTop: 40,
    pageMarginBottom: 40,
  });
  if (!tk.loadData(pourVerovio(props.musicxml))) {
    emit("erreur", "Verovio ne lit pas ce MusicXML.");
    return;
  }
  const pages = Array.from({ length: tk.getPageCount() }, (_, i) => tk.renderToSVG(i + 1));
  gravure.value.innerHTML = pages.join("");
  // Dans chaque mesure, la i-e portée est la i-e voix.
  parVoix = polyphonie.voix.map(() => []);
  for (const mesure of gravure.value.querySelectorAll("g.measure")) {
    [...mesure.querySelectorAll(":scope > g.staff")].forEach((portee, i) =>
      parVoix[i]?.push(...portee.querySelectorAll("g.note")),
    );
  }
  polyphonie.voix.forEach((v, i) => {
    if (parVoix[i].length !== v.notes.length) {
      console.warn(`[polyphonie] ${v.nom} : ${v.notes.length} notes lues, ${parVoix[i].length} gravées`);
    }
  });
  marquerVoix();
  marquer();
}

/** La voix choisie à l'encre, les autres en gris ; sa géométrie pour le trait. */
function marquerVoix() {
  const b = gravure.value;
  if (!b || !boite.value) return;
  for (const mesure of b.querySelectorAll("g.measure")) {
    [...mesure.querySelectorAll(":scope > g.staff")].forEach((portee, i) =>
      portee.classList.toggle("autre", i !== props.voixChoisie),
    );
  }
  geometrie = mesurerVerovio(boite.value, parVoix[props.voixChoisie] ?? []);
  // Pour les tests : les notes gravées de la voix choisie.
  boite.value.dataset.gravees = String(parVoix[props.voixChoisie]?.length ?? 0);
}

function marquer() {
  const b = gravure.value;
  if (!b) return;
  b.querySelectorAll("g.note.courante, g.note.fausse").forEach((n) => n.classList.remove("courante", "fausse"));
  const notes = parVoix[props.voixChoisie] ?? [];
  props.fausses.forEach((i) => notes[i]?.classList.add("fausse"));
  props.courantes.forEach((i) => notes[i]?.classList.add("courante"));
  if (props.courantes.length) notes[props.courantes[0]]?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
}

function peindre() {
  image = requestAnimationFrame(peindre);
  if (!toile.value || !geometrie || !props.voix) return;
  const minium = getComputedStyle(document.documentElement).getPropertyValue("--minium").trim() || "#C22310";
  dessiner(toile.value, geometrie, props.notes, props.voix, minium);
}

function clic(e: MouseEvent) {
  const note = (e.target as Element).closest("g.note");
  const i = note ? (parVoix[props.voixChoisie] ?? []).indexOf(note) : -1;
  if (i >= 0) emit("choisir", i);
}

watch(() => props.musicxml, lireEtGraver);
watch(() => props.voixChoisie, () => {
  marquerVoix();
  marquer();
});
watch(() => [props.courantes, props.fausses], marquer);

onMounted(() => {
  lireEtGraver();
  image = requestAnimationFrame(peindre);
  observateur = new ResizeObserver(() => {
    if (!boite.value || Math.abs(boite.value.clientWidth - largeur) < 24) return;
    clearTimeout(minuterie);
    minuterie = setTimeout(afficher, 150);
  });
  if (boite.value) observateur.observe(boite.value);
});
onBeforeUnmount(() => {
  observateur?.disconnect();
  cancelAnimationFrame(image);
});
</script>

<template>
  <div ref="boite" class="polyphonie" @click="clic">
    <p v-if="attente" class="machine">{{ attente }}</p>
    <div ref="gravure"></div>
    <canvas ref="toile" class="voix"></canvas>
  </div>
</template>

<style scoped>
.polyphonie {
  position: relative;
  width: 100%;
  min-height: 4rem;
}
.voix {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
.polyphonie :deep(svg) {
  display: block;
  overflow: visible;
}
/* Verovio écrit color="black" et Times : les encres et la police du système graphique. */
.polyphonie :deep(.definition-scale) {
  color: var(--encre);
  fill: currentColor;
  font-family: "EB Garamond", serif;
}
.polyphonie :deep(g.staff.autre) {
  opacity: 0.38;
}
.polyphonie :deep(g.staff:not(.autre) g.note) {
  cursor: pointer;
}
.polyphonie :deep(g.note.courante),
.polyphonie :deep(g.note.fausse) {
  color: var(--minium);
  fill: var(--minium);
}
</style>
