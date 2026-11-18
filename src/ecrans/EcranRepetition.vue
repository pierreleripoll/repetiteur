<script setup lang="ts">
// La répétition : une pièce (d'un programme, de la bibliothèque, ou du GABC collé), le
// micro, et le curseur qui suit la voix sur la partition. Après la pièce : les notes
// fausses au minium et l'écart de chaque phrase.
//
// Une pièce à plusieurs voix (MusicXML) : le chanteur choisit sa voix, et le suiveur suit
// celle-là. « Écouter » joue les voix cochées, en mesure ; « Chanter avec » joue les
// autres, et ce que chante le micro va sur la note de sa voix qui sonne à ce moment.
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { api, type PieceBibliotheque, type Programme, type ProgrammeResume } from "../api";
import { ecouterChanteur, type EtatDetecteur, type NomDetecteur } from "../audio/ecoute";
import type { Mesure } from "../audio/hauteur";
import type { Micro } from "../audio/micro";
import { bourdon, donnerLeTon, jouer, jouerVoix, type Lecture } from "../audio/son";
import type { NoteChant, Partition } from "../chant/partition";
import { cents, degre, nomNote } from "../chant/solfege";
import { noteA, notesDuSuiveur, voixProche, type Polyphonie } from "../chant/polyphonie";
import { bilanDesTraces, Calage, Suiveur, type Etat } from "../chant/suiveur";
import Accordeur from "../composants/Accordeur.vue";
import TraceHauteur, { type Ligne } from "../composants/TraceHauteur.vue";
import VuePartition from "../composants/VuePartition.vue";
import VuePolyphonie from "../composants/VuePolyphonie.vue";
import type { Voix } from "../composants/voixSurPortee";
import { REGLAGES } from "../reglages";
import { useRepetition } from "../stores/repetition";

interface Choix {
  /** pour garder le do de la pièce : « programme:lux_aeterna/communion », « gregobase:3879 » */
  cle: string;
  titre: string;
  gabc: string;
  /** une pièce à plusieurs voix : son MusicXML (et `gabc` vide) */
  musicxml?: string;
  avant?: string;
  apres?: string;
}

const route = useRoute();
const routeur = useRouter();
const reglages = useRepetition();
/** `?do=55` : le do (MIDI) de la première pièce lue, au lieu de celui gardé. */
let doDemande = Number.isFinite(Number(route.query.do)) && route.query.do ? Number(route.query.do) : null;
/** `?voix=1` : la voix chantée de la première pièce à plusieurs voix lue. */
let voixDemandee = route.query.voix !== undefined && Number.isInteger(Number(route.query.voix)) ? Number(route.query.voix) : null;

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
  const notees = programme.value.pieces.filter((p) => p.gabc || p.musicxml);
  choisirPieceProgramme(notees.find((p) => p.nom === piece)?.nom ?? notees[0]?.nom ?? "");
}

function choisirPieceProgramme(nom: string) {
  const p = programme.value?.pieces.find((x) => x.nom === nom);
  if (!(p?.gabc || p?.musicxml) || !programme.value) return;
  choix.value = {
    cle: `programme:${programme.value.nom}/${p.nom}`,
    titre: `${programme.value.titre} · ${p.titre || p.nom} · ${p.incipit}`,
    gabc: p.gabc ?? "",
    musicxml: p.musicxml ?? undefined,
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
  const { micro, detecteur } = route.query;
  return { ...(micro ? { micro } : {}), ...(detecteur ? { detecteur } : {}) };
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
/** ce que le chanteur a chanté sur chaque pas (MIDI, null : silence), dessiné sur la
 * portée ; les tableaux changent sans réactivité, la partition les relit à chaque image */
const traces = shallowRef<(number | null)[][]>([]);

/** Efface les traits à partir du pas `k`. */
function effacer(k = 0) {
  for (let j = k; j < traces.value.length; j++) traces.value[j] = [];
}

/** Le do qui met la pièce au milieu d'une voix d'homme (sol2 au centre). */
function doParDefaut(n: NoteChant[]): number {
  if (!n.length) return 55;
  const h = n.map((x) => x.hauteur);
  return Math.round(55 - (Math.min(...h) + Math.max(...h)) / 2);
}

function lue(p: Partition) {
  polyphonie.value = null;
  lueNotes(p.notes, doParDefaut(p.notes));
}

// --- Une pièce à plusieurs voix -----------------------------------------------------------
const polyphonie = shallowRef<Polyphonie | null>(null);
const voixChoisie = ref(0);
/** les voix jouées par « Écouter » (et par « Chanter avec », sauf la sienne) */
const entendues = ref<boolean[]>([]);
const facteurTempo = ref(1);
/** la voix dont le suiveur a les notes */
let voixLue = -1;

function luePolyphonie(p: Polyphonie) {
  polyphonie.value = p;
  entendues.value = p.voix.map(() => true);
  const v = voixDemandee ?? reglages.voixPour(choix.value!.cle, voixProche(p));
  voixDemandee = null;
  voixChoisie.value = voixLue = Math.min(Math.max(v, 0), p.voix.length - 1);
  // Écrit à la vraie hauteur : le do est do3 (MIDI 60), sauf transposition.
  lueNotes(notesDuSuiveur(p.voix[voixChoisie.value]), 60);
}

watch(voixChoisie, (v) => {
  const p = polyphonie.value;
  if (!p || !choix.value || v === voixLue) return;
  voixLue = v;
  reglages.garderVoix(choix.value.cle, v);
  relire(notesDuSuiveur(p.voix[v]));
});

/** Les notes d'une autre voix, au même do. */
function relire(n: NoteChant[]) {
  notes.value = n;
  suiveur.value = new Suiveur(n, doMidi.value);
  traces.value = suiveur.value.pas.map(() => []);
  fausses.value = new Set();
  derives.value = [];
  arreterLecture();
  majEtat();
}

function lueNotes(n: NoteChant[], doDefaut: number) {
  message.value = "";
  notes.value = n;
  doMidi.value = doDemande ?? reglages.doPour(choix.value!.cle, doDefaut);
  doDemande = null;
  suiveur.value = new Suiveur(n, doMidi.value);
  traces.value = suiveur.value.pas.map(() => []);
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
  effacer();
  fausses.value = new Set();
  derives.value = [];
  majEtat();
}

function allerA(note: number) {
  if (lecture) return;
  suiveur.value?.allerA(note);
  if (suiveur.value) effacer(suiveur.value.k);
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
const nomMicro = ref("");
const enPause = ref(false);
const calage = ref(false);
let calageur = new Calage();
const mesures: Mesure[] = [];
const derniere = shallowRef<Mesure | null>(null);
/** qui mesure la hauteur : SwiftF0, ou pitchy en secours */
const detecteur = ref<EtatDetecteur>({ nom: "pitchy", raison: "chargement" });
/** `?detecteur=pitchy`, ou la case « pitchy » : pitchy seul, pour comparer */
const choixDetecteur = computed<NomDetecteur>(() =>
  route.query.detecteur === "pitchy" || reglages.pitchySeul ? "pitchy" : "swiftf0",
);
const nomDetecteur = computed(() => {
  const d = detecteur.value;
  if (d.nom === "swiftf0") return "SwiftF0";
  if (d.raison === "chargement") return "pitchy (SwiftF0 se charge)";
  if (d.raison === "echec") return "pitchy (SwiftF0 a échoué)";
  return "pitchy";
});

async function basculerMicro() {
  if (micro) {
    micro.arreter();
    micro = null;
    microOuvert.value = false;
    calage.value = false;
    return;
  }
  try {
    micro = await ecouterChanteur(recevoir, (d) => (detecteur.value = d), choixDetecteur.value);
    microOuvert.value = true;
    nomMicro.value = micro.nom;
  } catch (e) {
    message.value = `Micro refusé ou absent : ${e instanceof Error ? e.message : e}`;
  }
}

watch(choixDetecteur, async () => {
  if (!micro) return;
  await basculerMicro();
  await basculerMicro();
});

function recevoir(m: Mesure) {
  mesures.push(m);
  while (mesures.length && m.temps - mesures[0].temps > 10_000) mesures.shift();
  derniere.value = m;
  enPause.value = micro?.enPause() ?? false;
  const s = suiveur.value;
  if (lecture && modeLecture === "avec") return enregistrerAvec(m);
  if (!s || lecture) return;
  if (calage.value) {
    const chantee = calageur.recevoir(m);
    if (chantee !== null) {
      doMidi.value = Math.round((chantee - s.pas[s.k].hauteur) * 100) / 100;
      calage.value = false;
    }
    return;
  }
  if (s.etat === "fini") return;
  s.recevoir(m);
  // Le trait du pas courant : depuis la première mesure chantée sur lui.
  const trace = traces.value[s.k];
  if (trace && (trace.length || m.midi !== null)) trace.push(m.midi);
  majEtat();
}

const voixChantee = computed<Voix | null>(() =>
  suiveur.value
    ? { pas: suiveur.value.pas, traces: traces.value, doMidi: doMidi.value, courant: etat.value === "fini" ? null : pas.value }
    : null,
);

function caler() {
  calageur = new Calage();
  calage.value = !calage.value;
}

/** « Chanter avec » : la mesure va sur la note de sa voix qui sonne à ce moment. */
function enregistrerAvec(m: Mesure) {
  const p = polyphonie.value;
  const s = suiveur.value;
  if (!p || !s || !enCours) return;
  const i = noteA(p.voix[voixChoisie.value], enCours.temps(m.temps - REGLAGES.latence));
  const k = i < 0 ? -1 : s.pas.findIndex((x) => x.premiere <= i && i <= x.derniere);
  const trace = traces.value[k];
  if (trace && (trace.length || m.midi !== null)) trace.push(m.midi);
}

// --- Le son -----------------------------------------------------------------------
let lecture: (() => void) | null = null;
/** la lecture en mesure d'une pièce à plusieurs voix, et ce qu'on en fait */
let enCours: Lecture | null = null;
let modeLecture: "ecoute" | "avec" | null = null;
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

/** Une pièce à plusieurs voix, en mesure, depuis la note du curseur de sa voix. `avec` :
 * sans sa voix, et le micro enregistre (« Chanter avec »). */
async function ecouterVoix(avec: boolean) {
  if (lecture) return arreterLecture();
  const p = polyphonie.value;
  const s = suiveur.value;
  if (!p || !s) return;
  const sienne = p.voix[voixChoisie.value];
  const depart = s.noteCourante;
  const depuis = sienne.notes[depart]?.debut ?? 0;
  const transposition = doMidi.value - 60;
  const jouees = p.voix
    .filter((_, i) => entendues.value[i] && !(avec && i === voixChoisie.value))
    .map((v) => v.notes.map((n) => ({ midi: n.midi + transposition, debut: n.debut, duree: n.duree })));
  if (avec) {
    effacer(s.k);
    fausses.value = new Set();
    derives.value = [];
  }
  modeLecture = avec ? "avec" : "ecoute";
  enLecture.value = true;
  enCours = await jouerVoix(jouees, depuis, p.tempo * facteurTempo.value, (t) => {
    const i = noteA(sienne, t);
    if (i >= 0 && courantes.value[0] !== i) courantes.value = [i];
  }, () => {
    const mode = modeLecture;
    lecture = null;
    enCours = null;
    modeLecture = null;
    enLecture.value = false;
    if (suiveur.value !== s) return; // une autre pièce, ou une autre voix, entre-temps
    if (mode !== "avec") return allerA(depart);
    // Le bilan de ce qui a été chanté, note par note.
    const b = bilanDesTraces(s.pas, traces.value, doMidi.value);
    s.etat = "fini";
    etat.value = "fini";
    courantes.value = [];
    fausses.value = b.fausses;
    derives.value = b.derives;
  });
  lecture = enCours.arreter;
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
  if (enLecture.value && polyphonie.value) {
    const nom = polyphonie.value.voix[voixChoisie.value].nom;
    return modeLecture === "avec" ? `Chantez la voix ${nom}, avec les autres.` : "Écoutez.";
  }
  if (!microOuvert.value) return "Micro coupé.";
  if (calage.value) return "Chantez la note du curseur et tenez-la : le do se cale sur votre voix.";
  if (etat.value === "fini") return "Fini.";
  const c = cible.value!;
  const nom = `${degre(c - doMidi.value)} (${nomNote(c)})`;
  return etat.value === "attente" ? `Attaquez ${nom}.` : `Chantez ${nom}.`;
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
    :data-detecteur="microOuvert ? detecteur.nom : ''"
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
            :disabled="!p.gabc && !p.musicxml"
            :selected="choix?.cle === `programme:${programme.nom}/${p.nom}`"
          >
            {{ p.nom }} · {{ p.titre || p.incipit }}{{ p.musicxml ? " (à plusieurs voix)" : p.gabc ? "" : " (pas notée)" }}
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
        <button type="button" :aria-pressed="enLecture" @click="polyphonie ? ecouterVoix(false) : ecouter()">
          {{ enLecture ? "Arrêter" : "Écouter" }}
        </button>
        <button v-if="polyphonie" type="button" :disabled="enLecture || !microOuvert" title="les autres voix jouent ; le micro vous suit en mesure" @click="ecouterVoix(true)">
          Chanter avec
        </button>
        <button type="button" :aria-pressed="bourdonTenu" title="la finale tenue ; au casque" @click="basculerBourdon">
          Bourdon
        </button>
        <button type="button" @click="recommencer">Recommencer</button>
        <label class="machine" title="mesurer la voix avec pitchy au lieu de SwiftF0, pour comparer">
          <input v-model="reglages.pitchySeul" type="checkbox" /> pitchy
        </label>
      </section>

      <section v-if="polyphonie" class="commandes voix-pieces">
        <label class="machine">
          votre voix
          <select v-model.number="voixChoisie" :disabled="enLecture">
            <option v-for="(v, i) in polyphonie.voix" :key="i" :value="i">{{ v.nom }}</option>
          </select>
        </label>
        <span class="machine">entendre</span>
        <label v-for="(v, i) in polyphonie.voix" :key="i" class="machine">
          <input v-model="entendues[i]" type="checkbox" :disabled="enLecture" /> {{ v.nom }}
        </label>
        <label class="machine">
          tempo
          <input v-model.number="facteurTempo" type="range" min="0.4" max="1.3" step="0.05" :disabled="enLecture" />
          ♩ = {{ Math.round(polyphonie.tempo * facteurTempo) }}
        </label>
      </section>

      <p class="etat">{{ consigne }}</p>
      <Accordeur
        v-if="microOuvert"
        :mesure="derniere"
        :cible="cible"
        :micro="nomMicro"
        :detecteur="nomDetecteur"
        :en-pause="enPause"
      />

      <VuePolyphonie
        v-if="choix.musicxml"
        :musicxml="choix.musicxml"
        :voix-choisie="voixChoisie"
        :notes="notes"
        :courantes="courantes"
        :fausses="fausses"
        :voix="voixChantee"
        @lue="luePolyphonie"
        @choisir="allerA"
        @erreur="(m) => (message = m)"
      />
      <VuePartition
        v-else
        :gabc="choix.gabc"
        :courantes="courantes"
        :fausses="fausses"
        :voix="voixChantee"
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
  min-height: 1.5rem;
  margin: 0.8rem 0 0.4rem;
}
.bilan {
  margin: 1rem 0;
}
</style>
