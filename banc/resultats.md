# Le banc de la hauteur : les résultats

Écrit par `uv run --script banc/hauteur.py bilan`. Les 40 extraits de vocadito (13,6 min de
voix seules), dans cinq conditions : propre ; bruit (rose, 15 dB sous la voix) ; piece
(RT60 0,5 s) ; eglise (RT60 3 s, plus de réverbération que de son direct : un cas dur) ;
portable (la pièce, puis le micro d'un portable : sans graves ni aigus, −38 dB, souffle,
50 Hz, décalage continu). Un détecteur « direct » mesure au fil du son, comme l'app ; son
retard est celui qui lui donne le plus de trames justes sur la voix propre.

- pitchy : l'app ; pitchy-avant : l'app jusqu'au 18.11.2026 (clarté 0,9 seule, médiane 5) ;
  pitchy-4096 : la fenêtre de la voix grave ; pitchy-c0.8 : un seuil de clarté plus bas.
- swiftf0-direct : SwiftF0, 4 trames d'avance (64 ms) ; -a2 : 2 trames ; -s0.3 : chantée
  dès une confiance de 0,3 (0,5 sinon).
- pesto-direct : PESTO en flux (blocs de 20 ms, 48 kHz). pyin, swiftf0, pesto : hors ligne.


| détecteur | sorte | retard (ms) | calcul (ms par s de son) |
|---|---|---:|---:|
| pesto | hors ligne | 0 | 151 |
| pesto-direct | direct | 88 | 169 |
| pitchy | direct | 40 | 8 |
| pitchy-4096 | direct | 68 | 17 |
| pitchy-avant | direct | 48 | 8 |
| pitchy-c0.8 | direct | 40 | 8 |
| pyin | hors ligne | 4 | 70 |
| swiftf0 | hors ligne | 0 | 13 |
| swiftf0-direct | direct | 80 | 158 |
| swiftf0-direct-a2 | direct | 48 | 148 |
| swiftf0-direct-a2-s0.3 | direct | 48 | 148 |
| swiftf0-direct-s0.3 | direct | 80 | 158 |

**Trames justes (%) : chantées, dites chantées, à moins de 50 cents**

| détecteur | propre | bruit | piece | eglise | portable |
|---|---:|---:|---:|---:|---:|
| pesto | 80.5 | 78.3 | 64.1 | 42.6 | 1.9 |
| pesto-direct | 92.9 | 91.6 | 80.2 | 55.2 | 15.8 |
| pitchy | 92.2 | 86.3 | 73.6 | 28.4 | 68.4 |
| pitchy-4096 | 86.8 | 80.4 | 71.9 | 26.9 | 67.0 |
| pitchy-avant | 82.9 | 72.0 | 67.3 | 23.0 | 62.0 |
| pitchy-c0.8 | 94.5 | 91.0 | 80.4 | 40.9 | 75.8 |
| pyin | 96.8 | 96.1 | 86.7 | 56.6 | 14.9 |
| swiftf0 | 97.2 | 97.3 | 85.7 | 55.0 | 83.4 |
| swiftf0-direct | 97.1 | 97.3 | 84.7 | 53.0 | 76.8 |
| swiftf0-direct-a2 | 96.2 | 97.0 | 85.4 | 56.8 | 63.6 |
| swiftf0-direct-a2-s0.3 | 96.9 | 97.5 | 88.6 | 62.6 | 76.0 |
| swiftf0-direct-s0.3 | 97.7 | 97.7 | 88.4 | 61.6 | 85.5 |

**Hauteur brute juste (%) : à moins de 50 cents, sans regarder si la trame est dite chantée**

| détecteur | propre | bruit | piece | eglise | portable |
|---|---:|---:|---:|---:|---:|
| pesto | 98.6 | 98.0 | 87.5 | 59.5 | 85.2 |
| pesto-direct | 98.6 | 98.1 | 86.9 | 58.9 | 85.0 |
| pitchy | 96.9 | 95.2 | 83.1 | 46.8 | 81.1 |
| pitchy-4096 | 91.9 | 90.8 | 82.6 | 48.3 | 80.9 |
| pitchy-avant | 96.9 | 95.2 | 83.1 | 46.8 | 81.1 |
| pitchy-c0.8 | 96.9 | 95.2 | 83.1 | 46.8 | 81.1 |
| pyin | 96.8 | 96.1 | 86.7 | 56.6 | 14.9 |
| swiftf0 | 98.2 | 98.1 | 89.5 | 65.6 | 90.1 |
| swiftf0-direct | 98.1 | 98.1 | 89.3 | 64.6 | 89.4 |
| swiftf0-direct-a2 | 97.4 | 98.0 | 89.5 | 64.5 | 85.4 |
| swiftf0-direct-a2-s0.3 | 97.4 | 98.0 | 89.5 | 64.5 | 85.4 |
| swiftf0-direct-s0.3 | 98.1 | 98.1 | 89.3 | 64.6 | 89.4 |

**Erreurs d'octave (%)**

| détecteur | propre | bruit | piece | eglise | portable |
|---|---:|---:|---:|---:|---:|
| pesto | 0.6 | 0.9 | 1.5 | 2.1 | 3.0 |
| pesto-direct | 0.6 | 0.9 | 1.5 | 2.1 | 2.8 |
| pitchy | 1.2 | 1.2 | 2.0 | 2.1 | 2.3 |
| pitchy-4096 | 0.8 | 0.8 | 1.7 | 1.6 | 1.9 |
| pitchy-avant | 1.2 | 1.2 | 2.0 | 2.1 | 2.3 |
| pitchy-c0.8 | 1.2 | 1.2 | 2.0 | 2.1 | 2.3 |
| pyin | 0.2 | 0.2 | 0.4 | 0.4 | 1.9 |
| swiftf0 | 0.1 | 0.1 | 0.1 | 0.1 | 0.1 |
| swiftf0-direct | 0.1 | 0.1 | 0.1 | 0.1 | 0.2 |
| swiftf0-direct-a2 | 0.1 | 0.1 | 0.1 | 0.1 | 0.1 |
| swiftf0-direct-a2-s0.3 | 0.1 | 0.1 | 0.1 | 0.1 | 0.1 |
| swiftf0-direct-s0.3 | 0.1 | 0.1 | 0.1 | 0.1 | 0.2 |

**Fausses alertes (%) : silence ou souffle dit chanté**

| détecteur | propre | bruit | piece | eglise | portable |
|---|---:|---:|---:|---:|---:|
| pesto | 2.0 | 1.8 | 8.8 | 30.8 | 0.0 |
| pesto-direct | 6.5 | 5.9 | 20.2 | 54.2 | 0.5 |
| pitchy | 8.8 | 3.7 | 26.2 | 30.3 | 14.3 |
| pitchy-4096 | 12.8 | 6.9 | 27.4 | 28.4 | 15.9 |
| pitchy-avant | 7.6 | 3.7 | 13.0 | 17.3 | 7.7 |
| pitchy-c0.8 | 13.3 | 7.1 | 31.1 | 43.1 | 17.6 |
| pyin | 36.8 | 23.8 | 56.9 | 80.1 | 8.9 |
| swiftf0 | 11.5 | 11.5 | 31.5 | 57.1 | 22.5 |
| swiftf0-direct | 11.7 | 11.3 | 32.2 | 56.1 | 14.6 |
| swiftf0-direct-a2 | 9.4 | 9.7 | 32.7 | 60.3 | 5.9 |
| swiftf0-direct-a2-s0.3 | 18.7 | 14.2 | 49.2 | 74.9 | 12.1 |
| swiftf0-direct-s0.3 | 18.2 | 16.0 | 46.5 | 73.6 | 25.6 |

**Précision (cents) : écart médian des trames justes**

| détecteur | propre | bruit | piece | eglise | portable |
|---|---:|---:|---:|---:|---:|
| pesto | 8.8 | 8.8 | 14.2 | 18.3 | 13.2 |
| pesto-direct | 8.8 | 8.9 | 13.7 | 18.3 | 12.5 |
| pitchy | 3.6 | 3.6 | 9.8 | 14.3 | 9.5 |
| pitchy-4096 | 5.6 | 5.4 | 9.2 | 13.7 | 8.7 |
| pitchy-avant | 7.7 | 7.1 | 10.3 | 13.2 | 9.5 |
| pitchy-c0.8 | 3.7 | 3.7 | 10.3 | 15.2 | 10.0 |
| pyin | 5.0 | 5.1 | 10.0 | 16.4 | 17.6 |
| swiftf0 | 3.9 | 4.1 | 10.4 | 15.2 | 10.5 |
| swiftf0-direct | 3.8 | 4.1 | 10.3 | 15.0 | 9.9 |
| swiftf0-direct-a2 | 3.5 | 3.9 | 9.9 | 15.3 | 8.7 |
| swiftf0-direct-a2-s0.3 | 3.5 | 4.0 | 10.1 | 15.6 | 9.1 |
| swiftf0-direct-s0.3 | 3.8 | 4.1 | 10.5 | 15.5 | 10.4 |

**Notes au faux bilan (%) : écart médian de la note à plus de 25 cents du vrai**

| détecteur | propre | bruit | piece | eglise | portable |
|---|---:|---:|---:|---:|---:|
| pesto | 3.7 | 3.6 | 18.8 | 47.0 | 2.1 |
| pesto-direct | 2.4 | 2.5 | 17.2 | 51.6 | 5.0 |
| pitchy | 2.2 | 2.5 | 10.2 | 11.4 | 9.1 |
| pitchy-4096 | 2.6 | 2.5 | 8.5 | 9.9 | 7.8 |
| pitchy-avant | 5.8 | 6.2 | 11.3 | 6.8 | 8.9 |
| pitchy-c0.8 | 1.8 | 2.0 | 11.7 | 22.5 | 12.3 |
| pyin | 0.5 | 0.9 | 10.9 | 43.6 | 29.4 |
| swiftf0 | 0.8 | 0.9 | 8.5 | 28.8 | 8.3 |
| swiftf0-direct | 0.6 | 0.7 | 8.1 | 28.0 | 7.5 |
| swiftf0-direct-a2 | 1.1 | 0.7 | 7.6 | 32.8 | 7.1 |
| swiftf0-direct-a2-s0.3 | 1.1 | 0.6 | 8.0 | 38.7 | 9.3 |
| swiftf0-direct-s0.3 | 0.6 | 0.7 | 8.2 | 36.9 | 8.6 |

**Notes manquées (%) : moins de 3 mesures au milieu de la note**

| détecteur | propre | bruit | piece | eglise | portable |
|---|---:|---:|---:|---:|---:|
| pesto | 6.2 | 7.1 | 8.2 | 9.0 | 92.6 |
| pesto-direct | 2.4 | 2.9 | 2.7 | 2.4 | 71.0 |
| pitchy | 0.7 | 3.7 | 7.3 | 57.2 | 12.0 |
| pitchy-4096 | 1.9 | 6.4 | 10.6 | 61.3 | 14.6 |
| pitchy-avant | 2.6 | 9.3 | 12.0 | 65.1 | 16.1 |
| pitchy-c0.8 | 0.4 | 2.1 | 2.9 | 34.5 | 5.4 |
| pyin | 0.1 | 0.1 | 0.1 | 4.6 | 58.1 |
| swiftf0 | 0.1 | 0.1 | 1.4 | 14.1 | 2.8 |
| swiftf0-direct | 0.1 | 0.1 | 1.6 | 15.9 | 6.1 |
| swiftf0-direct-a2 | 0.2 | 0.1 | 1.2 | 8.4 | 14.9 |
| swiftf0-direct-a2-s0.3 | 0.1 | 0.1 | 0.4 | 1.5 | 5.5 |
| swiftf0-direct-s0.3 | 0.1 | 0.0 | 0.4 | 3.1 | 1.8 |
