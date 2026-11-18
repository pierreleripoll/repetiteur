// Vite pour l'app web de Scriptorium (phase 2). Le serveur Python (`uv run scriptorium
// serveur`) donne /api ; ici, la page. Les ports viennent de l'environnement.
import { homedir } from "node:os";
import { resolve } from "node:path";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vitest/config";

// Le système graphique Laus Perennis : ses tokens (encres, polices) font le style de l'app.
const DS = process.env.SCRIPTORIUM_DS ?? resolve(homedir(), "code/laus-perennis-design");
const SERVEUR = process.env.SCRIPTORIUM_PORT ?? "8000";

export default defineConfig({
  plugins: [vue()],
  resolve: { alias: { "@ds": DS } },
  server: {
    port: Number(process.env.WEB_PORT ?? 5173),
    fs: { allow: [".", DS] },
    proxy: { "/api": `http://127.0.0.1:${SERVEUR}` },
  },
  // Verovio (gravure des pièces à plusieurs voix) pèse 8 Mo : chargé à part, à la demande.
  build: { chunkSizeWarningLimit: 9000 },
  // SwiftF0 tourne dans un worker module (`audio/swiftf0.worker.ts`), avec onnxruntime-web,
  // son wasm (15 Mo) et le modèle : rien de cela dans le paquet principal. Vite ne
  // pré-empaquette pas onnxruntime-web : il cherche son wasm à côté de lui.
  worker: { format: "es" },
  optimizeDeps: { exclude: ["onnxruntime-web"] },
  test: { environment: "node" },
});
