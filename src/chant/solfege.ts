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
