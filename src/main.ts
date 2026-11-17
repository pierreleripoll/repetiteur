import { createPinia } from "pinia";
import { createApp } from "vue";
import App from "./App.vue";
import { routeur } from "./routeur";
import "./style.css";

createApp(App).use(createPinia()).use(routeur).mount("#app");
