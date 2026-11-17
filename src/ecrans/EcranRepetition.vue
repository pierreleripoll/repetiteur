<script setup lang="ts">
// La répétition : une pièce (d'un programme, de la bibliothèque, ou du GABC collé), le
// micro, et le curseur qui suit la voix sur la partition. Après la pièce : les notes
// fausses au minium et l'écart de chaque phrase.
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { api, type PieceBibliotheque, type Programme, type ProgrammeResume } from "../api";
import { Detecteur, type Mesure } from "../audio/hauteur";
import { ouvrirMicro, type Micro } from "../audio/micro";
import { bourdon, donnerLeTon, jouer } from "../audio/son";
import type { NoteChant, Partition } from "../chant/partition";
import { cents, degre, nomNote } from "../chant/solfege";
import { Calage, Suiveur, type Etat } from "../chant/suiveur";
import TraceHauteur, { type Ligne } from "../composants/TraceHauteur.vue";
import VuePartition from "../composants/VuePartition.vue";
import { REGLAGES } from "../reglages";
import { useRepetition } from "../stores/repetition";

interface Choix {
  /** pour garder le do de la pièce : « programme:lux_aeterna/communion », « gregobase:3879 » */
  cle: string;
  titre: string;
  gabc: string;
  avant?: string;
  apres?: string;
}

const route = useRoute();
const routeur = useRouter();
const reglages = useRepetition();
/** `?do=55` : le do (MIDI) de la première pièce lue, au lieu de celui gardé. */
let doDemande = Number.isFinite(Number(route.query.do)) && route.query.do ? Number(route.query.do) : null;

// --- Le choix de la pièce ------------------------------------------------------------
const programmes = ref<ProgrammeResume[]>([]);
const nomProgramme = ref("");
const programme = ref<Programme | null>(null);
const recherche = ref("");
const resultats = ref<PieceBibliotheque[]>([]);
const gabcColle = ref("");
const choix = ref<Choix | null>(null);
const message = ref("");

async function choisirProgramme(nom: string, piece?: string) {
  nomProgramme.value = nom;
  programme.value = null;
  if (!nom) return;
  try {
    programme.value = await api.programme(nom);
  } catch (e) {
    message.value = String(e instanceof Error ? e.message : e);
    return;
  }
  const notees = programme.value.pieces.filter((p) => p.gabc);
  choisirPieceProgramme(notees.find((p) => p.nom === piece)?.nom ?? notees[0]?.nom ?? "");
}

function choisirPieceProgramme(nom: string) {
  const p = programme.value?.pieces.find((x) => x.nom === nom);
  if (!p?.gabc || !programme.value) return;
  choix.value = {
    cle: `programme:${programme.value.nom}/${p.nom}`,
    titre: `${programme.value.titre} · ${p.nom} · ${p.incipit}`,
    gabc: p.gabc,
    avant: p.avant,
    apres: p.apres,
  };
  routeur.replace({ query: { ...garde(), programme: programme.value.nom, piece: p.nom } });
}

async function chercher() {
  message.value = "";
  try {
    resultats.value = recherche.value.trim() ? await api.chercher(recherche.value) : [];
    if (!resultats.value.length) message.value = "Rien trouvé.";
  } catch (e) {
    message.value = String(e instanceof Error ? e.message : e);
  }
}

async function choisirReference(reference: string) {
  try {
    const p = await api.piece(reference);
    choix.value = { cle: p.reference, titre: `${p.incipit} · ${p.livre ?? p.reference}`, gabc: p.gabc ?? "" };
    nomProgramme.value = "";
    routeur.replace({ query: { ...garde(), ref: p.reference } });
  } catch (e) {
    message.value = String(e instanceof Error ? e.message : e);
  }
}

function lireColle() {
  const gabc = gabcColle.value.trim();
  if (!gabc) return;
  let h = 0;
  for (const c of gabc) h = (h * 31 + c.charCodeAt(0)) | 0;
  choix.value = { cle: `gabc:${(h >>> 0).toString(36)}`, titre: "GABC collé", gabc };
  nomProgramme.value = "";
}

/** Les réglages de l'adresse à garder quand on change de pièce. */
function garde() {
  const { micro } = route.query;
  return micro ? { micro } : {};
}

// --- La pièce lue, le suiveur ------------------------------------------------------------
const notes = shallowRef<NoteChant[]>([]);
const suiveur = shallowRef<Suiveur | null>(null);
const doMidi = ref(55);
const etat = ref<Etat>("attente");
/** le pas du curseur (`Suiveur.k`), pour que la note à chanter suive */
const pas = ref(0);
const courantes = ref<number[]>([]);
const fausses = ref<Set<number>>(new Set());
const derives = ref<{ phrase: number; ecart: number | null }[]>([]);

/** Le do qui met la pièce au milieu d'une voix d'homme (sol2 au centre). */
function doParDefaut(n: NoteChant[]): number {
  if (!n.length) return 55;
  const h = n.map((x) => x.hauteur);
  return Math.round(55 - (Math.min(...h) + Math.max(...h)) / 2);
}

function lue(p: Partition) {
  message.value = "";
  notes.value = p.notes;
  doMidi.value = doDemande ?? reglages.doPour(choix.value!.cle, doParDefaut(p.notes));
  doDemande = null;
  suiveur.value = new Suiveur(p.notes, doMidi.value);
  fausses.value = new Set();
  derives.value = [];
  arreterLecture();
  majEtat();
  if (route.query.micro && !micro) basculerMicro();
}

function majEtat() {
  const s = suiveur.value;
  if (!s) return;
  const termine = s.etat === "fini";
  if (termine && etat.value !== "fini") {
    fausses.value = s.fausses();
    derives.value = s.derives();
  }
  etat.value = s.etat;
  pas.value = s.k;
  const p = s.pas[s.k];
  const nouvelles = termine || !p ? [] : Array.from({ length: p.derniere - p.premiere + 1 }, (_, i) => p.premiere + i);
  if (nouvelles.join() !== courantes.value.join()) courantes.value = nouvelles;
}

function recommencer() {
  suiveur.value?.recommencer();
  fausses.value = new Set();
  derives.value = [];
  majEtat();
}

function allerA(note: number) {
  if (lecture) return;
  suiveur.value?.allerA(note);
  fausses.value = new Set();
  majEtat();
}

watch(doMidi, (v) => {
  if (suiveur.value) suiveur.value.doMidi = v;
  if (choix.value) reglages.garderDo(choix.value.cle, v);
});

const cible = computed(() =>
  suiveur.value && etat.value !== "fini" && pas.value < suiveur.value.pas.length
    ? doMidi.value + suiveur.value.pas[pas.value].hauteur
    : null,
);
const lignes = computed<Ligne[]>(() =>
  [...new Set(notes.value.map((n) => n.hauteur))].sort((a, b) => a - b)
    .map((h) => ({ midi: doMidi.value + h, nom: degre(h) })),
);
const nomDo = computed(() => {
  const ecart = (doMidi.value - Math.round(doMidi.value)) * 100;
  return nomNote(doMidi.value) + (Math.abs(ecart) >= 1 ? " " + cents(ecart) : "");
});

// --- Le micro -----------------------------------------------------------------------
let micro: Micro | null = null;
const microOuvert = ref(false);
const calage = ref(false);
let calageur = new Calage();
const mesures: Mesure[] = [];
const derniere = shallowRef<Mesure | null>(null);

async function basculerMicro() {
  if (micro) {
    micro.arreter();
    micro = null;
    microOuvert.value = false;
    calage.value = false;
    return;
  }
  const taille = reglages.voixGrave ? REGLAGES.fenetreGrave : REGLAGES.fenetre;
  try {
    let detecteur: Detecteur | null = null;
    micro = await ouvrirMicro(taille, (tampon, temps) => {
      detecteur ??= new Detecteur(taille, micro!.frequenceEchantillons);
      recevoir(detecteur.mesurer(tampon, temps));
    });
    microOuvert.value = true;
  } catch (e) {
    message.value = `Micro refusé ou absent : ${e instanceof Error ? e.message : e}`;
  }
}

watch(() => reglages.voixGrave, async () => {
  if (!micro) return;
  await basculerMicro();
  await basculerMicro();
});

function recevoir(m: Mesure) {
  mesures.push(m);
  while (mesures.length && m.temps - mesures[0].temps > 10_000) mesures.shift();
  derniere.value = m;
  const s = suiveur.value;
  if (!s || lecture) return;
  if (calage.value) {
    const chantee = calageur.recevoir(m);
    if (chantee !== null) {
      doMidi.value = Math.round((chantee - s.pas[s.k].hauteur) * 100) / 100;
      calage.value = false;
    }
    return;
  }
  s.recevoir(m);
  majEtat();
}

function caler() {
  calageur = new Calage();
  calage.value = !calage.value;
}

// --- Le son -----------------------------------------------------------------------
let lecture: (() => void) | null = null;
const enLecture = ref(false);
let arretBourdon: (() => void) | null = null;
const bourdonTenu = ref(false);

function arreterLecture() {
  const a = lecture;
  lecture = null;
  a?.();
}

async function ecouter() {
  if (lecture) return arreterLecture();
  const s = suiveur.value;
  if (!s) return;
  const depuis = s.noteCourante;
  const suite = notes.value.slice(depuis).map((n) => ({ midi: doMidi.value + n.hauteur, duree: n.duree }));
  enLecture.value = true;
  lecture = await jouer(suite, REGLAGES.pulsation, (i) => (courantes.value = [depuis + i]), () => {
    // Après l'écoute, le curseur revient où elle a commencé : à vous.
    lecture = null;
    enLecture.value = false;
    allerA(depuis);
  });
}

async function basculerBourdon() {
  if (arretBourdon) {
    arretBourdon();
    arretBourdon = null;
    bourdonTenu.value = false;
    return;
  }
  const finale = notes.value[notes.value.length - 1];
  if (!finale) return;
  arretBourdon = await bourdon(doMidi.value + finale.hauteur);
  bourdonTenu.value = true;
}

function ton() {
  if (cible.value !== null) donnerLeTon(cible.value);
}

// --- Ce qu'on dit au chanteur -----------------------------------------------------------
const consigne = computed(() => {
  if (!choix.value) return "Choisissez une pièce.";
  if (!notes.value.length) return "";
  if (!microOuvert.value) return "Micro coupé.";
  if (calage.value) return "Chantez la note du curseur et tenez-la : le do se cale sur votre voix.";
  if (etat.value === "fini") return "Fini.";
  const c = cible.value!;
  const nom = `${degre(c - doMidi.value)} (${nomNote(c)})`;
  return etat.value === "attente" ? `Attaquez ${nom}.` : `Chantez ${nom}.`;
});

const voix = computed(() => {
  const m = derniere.value;
  if (!microOuvert.value || !m) return "";
  if (m.midi === null) return "—";
  const c = cible.value;
  if (c !== null && Math.abs(m.midi - c) <= 3) return `vous : ${nomNote(m.midi)}, ${cents((m.midi - c) * 100)}`;
  return `vous : ${nomNote(m.midi)}`;
});

const bilan = computed(() =>
  derives.value.map((d) => `${d.phrase + 1} : ${d.ecart === null ? "pas chantée" : cents(d.ecart)}`).join(" · "),
);

// --- Au départ : la pièce de l'adresse ---------------------------------------------------
onMounted(async () => {
  api.programmes().then((l) => (programmes.value = l), () => undefined);
  const q = route.query;
  if (typeof q.programme === "string") await choisirProgramme(q.programme, q.piece as string | undefined);
  else if (typeof q.ref === "string") await choisirReference(q.ref);
});

onBeforeUnmount(() => {
  micro?.arreter();
  arreterLecture();
  arretBourdon?.();
});
</script>

<template>
  <main
    class="repetition"
    :data-etat="etat"
    :data-courante="courantes[0] ?? ''"
    :data-notes="notes.length"
    :data-do="doMidi"
  >
    <section class="choix">
      <label>
        <span class="machine">Programme</span>
        <select :value="nomProgramme" @change="choisirProgramme(($event.target as HTMLSelectElement).value)">
          <option value="">—</option>
          <option v-for="p in programmes" :key="p.nom" :value="p.nom">{{ p.titre }}</option>
        </select>
      </label>
      <label v-if="programme">
        <span class="machine">Pièce</span>
        <select @change="choisirPieceProgramme(($event.target as HTMLSelectElement).value)">
          <option
            v-for="p in programme.pieces"
            :key="p.nom"
            :value="p.nom"
            :disabled="!p.gabc"
            :selected="choix?.cle === `programme:${programme.nom}/${p.nom}`"
          >
            {{ p.nom }} · {{ p.incipit }}{{ p.gabc ? "" : " (pas notée)" }}
          </option>
        </select>
      </label>
      <form class="recherche" @submit.prevent="chercher">
        <span class="machine">Bibliothèque</span>
        <input v-model="recherche" type="search" placeholder="Lux aeterna" />
        <button type="submit">Chercher</button>
      </form>
      <details>
        <summary class="machine">Coller un GABC</summary>
        <textarea v-model="gabcColle" rows="4" placeholder="(c4) AL(f)le(gh)lú(h)ia.(h.) (::)"></textarea>
        <button type="button" @click="lireColle">Lire</button>
      </details>
    </section>

    <ul v-if="resultats.length" class="resultats">
      <li v-for="r in resultats" :key="r.reference">
        <a href="#" @click.prevent="choisirReference(r.reference); resultats = []">{{ r.incipit }}</a>
        <span class="machine">{{ r.role }} · mode {{ r.mode ?? "?" }} · {{ r.livre ?? r.reference }}</span>
      </li>
    </ul>

    <p v-if="message" class="rubrique">{{ message }}</p>

    <template v-if="choix">
      <h1>{{ choix.titre }}</h1>
      <p v-if="choix.avant" class="rubrique">{{ choix.avant }}</p>

      <section class="commandes">
        <span class="do">
          <button type="button" title="un demi-ton plus bas" @click="doMidi = Math.round(doMidi) - 1">−</button>
          <span class="machine">do = {{ nomDo }}</span>
          <button type="button" title="un demi-ton plus haut" @click="doMidi = Math.round(doMidi) + 1">+</button>
        </span>
        <button type="button" :aria-pressed="microOuvert" @click="basculerMicro">Micro</button>
        <button type="button" :disabled="cible === null" @click="ton">Donner le ton</button>
        <button type="button" :disabled="!microOuvert" :aria-pressed="calage" @click="caler">Caler sur ma voix</button>
        <button type="button" :aria-pressed="enLecture" @click="ecouter">{{ enLecture ? "Arrêter" : "Écouter" }}</button>
        <button type="button" :aria-pressed="bourdonTenu" title="la finale tenue ; au casque" @click="basculerBourdon">
          Bourdon
        </button>
        <button type="button" @click="recommencer">Recommencer</button>
        <label class="machine"><input v-model="reglages.voixGrave" type="checkbox" /> voix grave</label>
      </section>

      <p class="etat">
        <span>{{ consigne }}</span>
        <span class="machine voix">{{ voix }}</span>
      </p>

      <VuePartition
        :gabc="choix.gabc"
        :courantes="courantes"
        :fausses="fausses"
        @lue="lue"
        @choisir="allerA"
        @erreur="(m) => (message = m)"
      />

      <p v-if="choix.apres" class="rubrique">{{ choix.apres }}</p>

      <section v-if="etat === 'fini'" class="bilan">
        <p>
          {{ fausses.size }} note{{ fausses.size > 1 ? "s" : "" }} à plus de {{ REGLAGES.horsJustesse }} cents
          (au minium sur la partition).
        </p>
        <p class="machine">Écart par phrase : {{ bilan }}</p>
      </section>

      <TraceHauteur :mesures="mesures" :lignes="lignes" :cible="cible" />
    </template>
  </main>
</template>

<style scoped>
.repetition {
  max-width: 60rem;
  margin: 0 auto;
  padding: 1rem 1.5rem 3rem;
}
.choix,
.commandes {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.6rem 1rem;
}
.choix label,
.recherche {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}
.machine {
  letter-spacing: 0.04em;
}
details textarea {
  margin: 0.4rem 0;
}
.resultats {
  list-style: none;
  padding: 0;
  margin: 0.8rem 0;
}
.resultats li {
  display: flex;
  gap: 1rem;
  align-items: baseline;
  padding: 0.15rem 0;
}
h1 {
  font-weight: 400;
  font-size: 1.4rem;
  margin: 1.2rem 0 0.6rem;
}
.commandes {
  margin: 0.6rem 0;
}
.do {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}
.etat {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  min-height: 1.5rem;
  margin: 0.8rem 0;
}
.voix {
  font-size: 0.9rem;
}
.bilan {
  margin: 1rem 0;
}
</style>
