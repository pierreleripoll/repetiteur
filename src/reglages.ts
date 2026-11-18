// Les réglages de la répétition, tous ici (PLAN §6.3, la répétition).

export const REGLAGES = {
  /** Micro : taille de la fenêtre d'analyse (échantillons). 4096 pour une voix grave. */
  fenetre: 2048,
  fenetreGrave: 4096,
  /** Micro : une mesure toutes les `periode` ms. */
  periode: 20,
  /** Hauteur : une mesure compte si sa clarté (McLeod, 0 à 1) atteint ce seuil… */
  clarteMin: 0.9,
  /** … et si le volume (RMS du signal, 0 à 1) le dépasse (0,003 : −50 dB). */
  volumeMin: 0.003,
  /** Hauteur : une voix déjà suivie compte encore jusqu'à cette clarté, si elle reste à
   * moins de `sautGarde` demi-tons de la mesure d'avant (la réverbération, le bruit).
   * Le banc (`banc/resultats.md`) : 6 à 11 points de trames justes en plus. */
  clarteGarde: 0.5,
  sautGarde: 1,
  /** Hauteur : en dessous de cette clarté, on n'affiche même pas la note captée (du bruit). */
  clarteVue: 0.5,
  /** Hauteur : les fréquences possibles d'une voix (Hz). */
  frequenceMin: 60,
  frequenceMax: 1100,
  /** Hauteur : médiane sur ce nombre de mesures (contre les sauts d'octave). 3 plutôt que
   * 5 : 8 ms de retard en moins, et le banc ne voit pas plus d'erreurs. */
  mediane: 3,
  /** Suiveur : la voix est « sur la note » à moins de `tolerance` cents… */
  tolerance: 50,
  /** … et le curseur passe à la note suivante après `tenue` ms sur elle. */
  tenue: 100,
  /** Suiveur : il cherche la note suivante jusqu'à `avance` notes plus loin (neumes rapides). */
  avance: 2,
  /** Suiveur : l'écart d'une note se mesure à moins de `toleranceMesure` cents. */
  toleranceMesure: 100,
  /** Suiveur : un silence de `souffle` ms permet de passer à une note de même hauteur. */
  souffle: 150,
  /** Suiveur : sur la dernière note, `silenceFin` ms de silence finissent la pièce. */
  silenceFin: 400,
  /** Bilan : une note à plus de `horsJustesse` cents sort au minium. */
  horsJustesse: 25,
  /** Calage sur la voix : une note tenue `calageDuree` ms, à `calageEcart` cents près. */
  calageDuree: 300,
  calageEcart: 30,
  /** Chanter avec les autres voix : le retard du micro (ms), retiré avant de placer une
   * mesure dans la pièce. */
  latence: 80,
  /** Lecture : la pulsation (ms par note ; une note pointée en vaut deux). */
  pulsation: 450,
} as const;

export type Reglages = { -readonly [K in keyof typeof REGLAGES]: number };
