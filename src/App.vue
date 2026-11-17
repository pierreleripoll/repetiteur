<script setup lang="ts">
import { RouterLink, RouterView } from "vue-router";
</script>

<template>
  <header class="tete">
    <span class="nom">Scriptorium</span>
    <nav><RouterLink to="/repetition">Répétition</RouterLink></nav>
  </header>
  <RouterView />
</template>

<style scoped>
.tete {
  display: flex;
  align-items: baseline;
  gap: 2rem;
  padding: 1rem 1.5rem 0.5rem;
  border-bottom: var(--filet) solid var(--encre);
}
.nom {
  font-family: "Basteleur", serif;
  font-weight: 700;
  font-size: 1.6rem;
}
nav a {
  font-family: "Nimbus Sans", sans-serif;
  font-size: 0.8rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--encre);
  text-decoration: none;
}
nav a.router-link-active {
  color: var(--minium);
}
</style>
