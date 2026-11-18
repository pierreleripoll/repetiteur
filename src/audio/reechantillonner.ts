// Le son du micro (48 ou 44,1 kHz) à 16 kHz pour SwiftF0, bloc par bloc. Un filtre sinc
// fenêtré (Kaiser), en polyphase : pour un rapport L/M (48 kHz → 16 kHz : 1/3 ; 44,1 kHz :
// 160/441), L tables de coefficients. Le filtre est centré : la sortie n est l'instant
// n / 16000 s, comme l'entrée, sans décalage ; on attend seulement `retard` ms de son en plus.
// Couper le son en blocs autrement ne change rien à la sortie.

const ZEROS = 24; // passages à zéro du sinc de chaque côté
const BETA = 8; // Kaiser : environ 80 dB d'atténuation

function pgcd(a: number, b: number): number {
  while (b) [a, b] = [b, a % b];
  return a;
}

/** Bessel modifiée d'ordre 0 (la fenêtre de Kaiser). */
function i0(x: number): number {
  let somme = 1;
  let terme = 1;
  for (let k = 1; k < 50; k++) {
    terme *= (x / (2 * k)) ** 2;
    somme += terme;
    if (terme < 1e-12 * somme) break;
  }
  return somme;
}

export class Reechantillonneur {
  /** ms de son à attendre après un instant pour avoir sa sortie */
  readonly retard: number;
  private L: number;
  private M: number;
  /** demi-largeur du filtre, en échantillons d'entrée */
  private K: number;
  private tables: Float32Array[] = [];
  private entree = new Float32Array(0);
  /** l'indice (dans tout le flux) du premier échantillon gardé dans `entree` */
  private base = 0;
  /** le nombre d'échantillons reçus */
  private recus = 0;
  /** la prochaine sortie (indice dans tout le flux de sortie) */
  private n = 0;

  constructor(
    readonly feEntree: number,
    readonly feSortie = 16000,
  ) {
    const g = pgcd(feEntree, feSortie);
    this.L = feSortie / g;
    this.M = feEntree / g;
    const coupure = 0.45 * Math.min(feEntree, feSortie); // Hz
    const demi = ZEROS / (2 * coupure); // s
    this.K = Math.ceil(demi * feEntree);
    this.retard = (this.K / feEntree) * 1000;
    // Table r : les coefficients des entrées q + m (m de −K à K) pour une sortie en q + r/L.
    for (let r = 0; r < this.L; r++) {
      const t = new Float32Array(2 * this.K + 1);
      let somme = 0;
      for (let j = 0; j < t.length; j++) {
        const m = j - this.K;
        const s = (r / this.L - m) / feEntree; // s, de l'entrée à la sortie
        if (Math.abs(s) >= demi) continue;
        const u = 2 * coupure * s;
        const sinc = u === 0 ? 1 : Math.sin(Math.PI * u) / (Math.PI * u);
        const w = i0(BETA * Math.sqrt(1 - (s / demi) ** 2)) / i0(BETA);
        t[j] = sinc * w;
        somme += t[j];
      }
      for (let j = 0; j < t.length; j++) t[j] /= somme; // gain 1 pour chaque phase
      this.tables.push(t);
    }
  }

  /** Ajoute un bloc ; rend les échantillons de sortie devenus prêts. */
  pousser(bloc: Float32Array): Float32Array {
    const tout = new Float32Array(this.entree.length + bloc.length);
    tout.set(this.entree);
    tout.set(bloc, this.entree.length);
    this.entree = tout;
    this.recus += bloc.length;
    const { L, M, K } = this;
    const sortie: number[] = [];
    for (;;) {
      const q = Math.floor((this.n * M) / L);
      if (q + K >= this.recus) break; // il manque des entrées à droite
      const t = this.tables[this.n * M - q * L];
      let y = 0;
      for (let j = 0; j < t.length; j++) {
        const k = q - K + j - this.base;
        if (k >= 0) y += t[j] * this.entree[k]; // avant le début : du silence
      }
      sortie.push(y);
      this.n++;
    }
    // Garder ce dont la prochaine sortie a besoin.
    const garder = Math.floor((this.n * M) / L) - K - this.base;
    if (garder > 0) {
      this.entree = this.entree.slice(garder);
      this.base += garder;
    }
    return Float32Array.from(sortie);
  }
}
