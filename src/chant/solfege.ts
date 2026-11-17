// Les noms des notes, à la française : do3 est le do du milieu du piano (MIDI 60).

const NOMS = ["do", "do♯", "ré", "mi♭", "mi", "fa", "fa♯", "sol", "la♭", "la", "si♭", "si"];

/** « ré3 » pour MIDI 62 ; arrondi au demi-ton le plus proche. */
export function nomNote(midi: number): string {
  const n = Math.round(midi);
  return NOMS[((n % 12) + 12) % 12] + (Math.floor(n / 12) - 2);
}

/** Le degré d'une note dans la gamme du do de la clé : 0 → « do », 10 → « si♭ ». */
export function degre(demiTonsDepuisDo: number): string {
  return NOMS[((Math.round(demiTonsDepuisDo) % 12) + 12) % 12];
}

/** L'écart en cents, signé : « +12 c », « −8 c ». */
export function cents(ecart: number): string {
  const c = Math.round(ecart);
  return (c > 0 ? "+" : c < 0 ? "−" : "±") + Math.abs(c) + " c";
}

export function midiDe(frequence: number): number {
  return 69 + 12 * Math.log2(frequence / 440);
}

export function frequenceDe(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

// La place d'une hauteur sur la portée, en continu : un degré de la gamme par position
// (ligne ou interligne), un demi-ton hors gamme entre deux. Avec le si bémol, le si♭ est
// sur la position du si.
const GAMME = [[0, 0], [2, 1], [4, 2], [5, 3], [7, 4], [9, 5], [11, 6], [12, 7]];
const GAMME_BEMOL = [[0, 0], [2, 1], [4, 2], [5, 3], [7, 4], [9, 5], [10, 6], [12, 7]];

/** La position sur la portée (0 = do, 7 = do de l'octave) de `demiTons` au-dessus du do. */
export function positionContinue(demiTons: number, bemol = false): number {
  const octave = Math.floor(demiTons / 12);
  const reste = demiTons - 12 * octave;
  const g = bemol ? GAMME_BEMOL : GAMME;
  let i = 0;
  while (reste > g[i + 1][0]) i++;
  const [h0, p0] = g[i];
  const [h1, p1] = g[i + 1];
  return 7 * octave + p0 + ((reste - h0) / (h1 - h0)) * (p1 - p0);
}
