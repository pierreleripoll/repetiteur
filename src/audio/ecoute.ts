// Écouter le chanteur : le micro, et la hauteur de chaque instant. SwiftF0 mesure
// (`swiftf0.worker.ts`) ; pitchy (`hauteur.ts`) le remplace pendant que le modèle se
// charge, s'il échoue, ou si on le demande. Chaque mesure a l'instant du son mesuré (le
// retard du détecteur retiré) : on passe de l'un à l'autre sans trou ni retour en arrière.

import { REGLAGES } from "../reglages";
import { Detecteur, type Mesure } from "./hauteur";
import { ouvrirMicro, type Micro } from "./micro";

export type NomDetecteur = "swiftf0" | "pitchy";

export interface EtatDetecteur {
  nom: NomDetecteur;
  /** pitchy : pourquoi lui */
  raison?: "chargement" | "echec" | "choisi";
  message?: string;
}

export async function ecouterChanteur(
  surMesure: (m: Mesure) => void,
  surDetecteur: (e: EtatDetecteur) => void,
  choix: NomDetecteur,
): Promise<Micro> {
  let worker: Worker | null = null;
  let swift = false;
  let pitchy: Detecteur | null = null;
  const fenetre = new Float32Array(REGLAGES.fenetre);
  let depuis = 0;
  let pas = Infinity;
  let dernier = -Infinity;

  const emettre = (m: Mesure) => {
    if (m.temps <= dernier) return;
    dernier = m.temps;
    surMesure(m);
  };

  const echec = (message: string) => {
    console.warn("[swiftf0]", message);
    worker?.terminate();
    worker = null;
    swift = false;
    surDetecteur({ nom: "pitchy", raison: "echec", message });
  };

  surDetecteur({ nom: "pitchy", raison: choix === "pitchy" ? "choisi" : "chargement" });

  const micro = await ouvrirMicro((bloc, fin) => {
    // pitchy : la fenêtre des derniers échantillons, une mesure toutes les `periode` ms de son.
    fenetre.copyWithin(0, Math.min(bloc.length, fenetre.length));
    fenetre.set(bloc.subarray(Math.max(0, bloc.length - fenetre.length)), Math.max(0, fenetre.length - bloc.length));
    depuis += bloc.length;
    if (!swift && pitchy && depuis >= pas) {
      depuis -= pas;
      emettre(pitchy.mesurer(fenetre, fin - REGLAGES.retardPitchy));
    }
    worker?.postMessage({ type: "bloc", bloc, fin }, [bloc.buffer]);
  });
  const fe = micro.frequenceEchantillons;
  pitchy = new Detecteur(REGLAGES.fenetre, fe);
  pas = Math.round((REGLAGES.periode / 1000) * fe);

  if (choix === "swiftf0") {
    try {
      worker = new Worker(new URL("./swiftf0.worker.ts", import.meta.url), { type: "module" });
      worker.onmessage = (e: MessageEvent) => {
        const m = e.data;
        if (m.type === "pret") {
          swift = true;
          console.info("[swiftf0] prêt, retard", Math.round(m.retard), "ms");
          surDetecteur({ nom: "swiftf0" });
        } else if (m.type === "mesure") {
          if (swift) emettre(m.mesure);
        } else if (m.type === "erreur") {
          echec(m.message);
        }
      };
      worker.onerror = (e) => echec(e.message || "le worker ne démarre pas");
      worker.postMessage({ type: "ouvrir", fe });
    } catch (e) {
      echec(e instanceof Error ? e.message : String(e));
    }
  }

  return {
    ...micro,
    arreter() {
      micro.arreter();
      worker?.terminate();
      worker = null;
    },
  };
}
