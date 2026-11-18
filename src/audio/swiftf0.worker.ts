// SwiftF0 dans un Web Worker : onnxruntime-web (build wasm seul, un fil) et le modèle sont
// chargés ici, hors du paquet principal, et l'inférence (quelques ms toutes les 16 ms) ne
// gêne pas la page. Les blocs reçus avant que le modèle soit prêt sont gardés (le passé
// que voit le modèle).
//
// Messages reçus : `ouvrir {fe}`, `bloc {bloc, fin}`. Envoyés : `pret {retard}`,
// `mesure {mesure}`, `erreur {message}`.

import * as ort from "onnxruntime-web/wasm";
import urlWasm from "onnxruntime-web/ort-wasm-simd-threaded.wasm?url";
import { REGLAGES } from "../reglages";
import urlModele from "./swiftf0.onnx?url";
import { SwiftF0, infererAvec } from "./swiftf0";

type Recu = { type: "ouvrir"; fe: number } | { type: "bloc"; bloc: Float32Array; fin: number };

const GARDES = 64; // blocs gardés avant que le modèle soit prêt (340 ms à 48 kHz)

let detecteur: SwiftF0 | null = null;
const avant: { bloc: Float32Array; fin: number }[] = [];
let occupe = false;

function erreur(e: unknown) {
  detecteur = null;
  postMessage({ type: "erreur", message: e instanceof Error ? e.message : String(e) });
}

async function ouvrir(fe: number) {
  try {
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.wasmPaths = { wasm: urlWasm };
    const reponse = await fetch(urlModele);
    if (!reponse.ok) throw new Error(`le modèle : ${reponse.status}`);
    const inferer = await infererAvec(ort, new Uint8Array(await reponse.arrayBuffer()));
    detecteur = new SwiftF0(fe, inferer, REGLAGES, true);
    for (const b of avant.splice(0)) detecteur.ajouter(b.bloc, b.fin);
    postMessage({ type: "pret", retard: detecteur.retard });
    void mesurer();
  } catch (e) {
    erreur(e);
  }
}

/** Mesure les trames prêtes, une à la fois. */
async function mesurer() {
  if (occupe || !detecteur) return;
  occupe = true;
  try {
    for (let t = await detecteur.suivante(); t; t = await detecteur!.suivante()) {
      postMessage({ type: "mesure", mesure: t.mesure });
      if (!detecteur) break;
    }
  } catch (e) {
    erreur(e);
  } finally {
    occupe = false;
  }
}

onmessage = (e: MessageEvent<Recu>) => {
  const m = e.data;
  if (m.type === "ouvrir") {
    void ouvrir(m.fe);
  } else if (detecteur) {
    detecteur.ajouter(m.bloc, m.fin);
    void mesurer();
  } else {
    avant.push(m);
    if (avant.length > GARDES) avant.shift();
  }
};
