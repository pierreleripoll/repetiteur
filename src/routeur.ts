import { createRouter, createWebHistory } from "vue-router";

export const routeur = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", redirect: "/repetition" },
    // ?programme=lux_aeterna&piece=communion, ?ref=gregobase:3879 ; ?do=55 (MIDI), ?micro=1
    { path: "/repetition", component: () => import("./ecrans/EcranRepetition.vue") },
  ],
});
