// Les réglages de la répétition, tous ici (PLAN §6.3, la répétition).

export const REGLAGES = {
  /** SwiftF0 (`audio/swiftf0.ts`) : une trame compte si la confiance du modèle atteint ce
   * seuil. Le banc : 0,3 avec 2 trames d'avance (`swiftf0-direct-a2-s0.3`). */
  confianceMin: 0.3,
  /** SwiftF0 : en dessous, on n'affiche même pas la note captée. Le bruit monte à 0,2 et
   * plus ; une voix trop faible garde sa confiance (la fenêtre est normée). */
  confianceVue: 0.3,
  /** SwiftF0 : une trame se mesure quand `avanceSwift` trames de 16 ms la suivent. */
  avanceSwift: 2,
  /** SwiftF0 : les trames mesurées par inférence (2 : deux fois moins de calcul, et la
   * première a une trame d'avance de plus, 16 ms plus tard). */
  parInference: 2,
  /** SwiftF0 : le niveau (dB, RMS) où chaque fenêtre est mise avant le modèle. */
  niveauSwift: -20,
  /** pitchy (en secours) : taille de la fenêtre d'analyse (échantillons). */
  fenetre: 2048,
  /** pitchy : une mesure toutes les `periode` ms de son. */
  periode: 20,
  /** pitchy : le retard de sa mesure (ms, le banc), retiré de son instant. */
  retardPitchy: 40,
  /** pitchy : une mesure compte si sa clarté (McLeod, 0 à 1) atteint ce seuil… */
  clarteMin: 0.9,
  /** … et si le volume (RMS du signal, 0 à 1) le dépasse (0,003 : −50 dB). */
  volumeMin: 0.003,
  /** pitchy : une voix déjà suivie compte encore jusqu'à cette clarté, si elle reste à
   * moins de `sautGarde` demi-tons de la mesure d'avant (la réverbération, le bruit).
   * Le banc (`banc/resultats.md`) : 6 à 11 points de trames justes en plus. */
  clarteGarde: 0.5,
  sautGarde: 1,
  /** pitchy : en dessous de cette clarté, on n'affiche même pas la note captée (du bruit). */
  clarteVue: 0.5,
  /** Les fréquences possibles d'une voix (Hz). */
  frequenceMin: 60,
  frequenceMax: 1100,
  /** pitchy : médiane sur ce nombre de mesures (contre les sauts d'octave). 3 plutôt que
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
  /** Chanter avec les autres voix : le retard du micro et des haut-parleurs (ms), retiré
   * avant de placer une mesure dans la pièce. Le retard du détecteur est déjà retiré de
   * l'instant de chaque mesure (80 ms avant SwiftF0 : 40 de pitchy et 40 du reste). */
  latence: 40,
  /** Lecture : la pulsation (ms par note ; une note pointée en vaut deux). */
  pulsation: 450,
} as const;

export type Reglages = { -readonly [K in keyof typeof REGLAGES]: number };
