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
  test: { environment: "node" },
});
