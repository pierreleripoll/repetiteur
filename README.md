# Répétiteur

Une page web pour répéter le chant : on choisit une pièce (grégorien en GABC, ou une pièce à
plusieurs voix en MusicXML), on chante au micro, et le curseur suit la voix sur la
partition. Après la pièce : les notes trop hautes ou trop basses au minium, et l'écart de
chaque phrase. Pour la schola Laus Perennis. Le plan et les étapes sont dans `PLAN.md`.

Tout se passe dans le navigateur. Les pièces viennent de scriptorium
(`~/code/scriptorium`, qui prépare les programmes et les documents à imprimer), ou d'un
GABC collé dans la page.

## Prérequis

- Node 24 et pnpm (`corepack enable` ou `npm i -g pnpm`).
- Le système graphique cloné dans `~/code/laus-perennis-design` (ou `SCRIPTORIUM_DS=chemin`) :
  ses encres et ses polices font le style de la page.
- Un micro, et un casque pour le bourdon et l'écoute.
- Pour les pièces des programmes et de la bibliothèque : scriptorium, et son serveur lancé
  (`uv run scriptorium serveur`, port 8000).
- Pour le test de bout en bout : Chrome et uv.

## Utilisation

```bash
pnpm install
pnpm dev                  # la page, port 5173 ($WEB_PORT) ; /api vers $SCRIPTORIUM_PORT (8000)
pnpm test                 # vitest, 3 s
pnpm build                # vue-tsc puis dist/
pnpm e2e                  # dist/ dans Chrome sans écran, un faux micro chante (35 s)
```

Pour que `uv run scriptorium serveur` serve aussi la page construite :
`pnpm build`, il prend `~/code/repetiteur/dist` (ou `SCRIPTORIUM_REPETITEUR=chemin` du dépôt).

Le banc de la hauteur (`banc/`) compare les détecteurs de hauteur sur les voix de vocadito
(https://zenodo.org/records/5578807, `vocadito.zip` dézippé dans `donnees/banc/vocadito/`).
Ses résultats sont dans `banc/resultats.md`.

```bash
uv run --script banc/hauteur.py preparer   # vocadito → donnees/banc/conditions (800 Mo)
uv run --script banc/hauteur.py python     # pYIN, SwiftF0, PESTO : 25 min, 3 cœurs (BANC_COEURS)
uv run --script banc/hauteur.py pitchy     # les détecteurs de la page (banc/detecteurs.banc.test.ts)
uv run --script banc/hauteur.py bilan      # banc/resultats.md
uv run --script banc/hauteur.py reference  # src/audio/swiftf0.reference.json
```

## Licences

- exsurge de Benjamin Bloomfield (https://github.com/bbloomf/exsurge, paquet `exsurge-ts`),
  MIT : lit et grave le GABC.
- SwiftF0 (Lars Nieradzik, MIT, paquet PyPI `swift-f0` 0.3.0 : son modèle
  `src/audio/swiftf0.onnx`, non modifié, avec sa licence `swiftf0.LICENSE`) mesure la
  hauteur de la voix, par onnxruntime-web (Microsoft, MIT) ; pitchy (MIT) le remplace
  pendant qu'il se charge.
- Verovio (LGPL-3.0, paquet npm `verovio`, non modifié) grave les pièces à plusieurs voix.
- vocadito (Bittner et al.), CC BY 4.0 : les voix du banc, en local dans `donnees/banc/`.
  Le banc seul utilise aussi PESTO (LGPL-3.0) et librosa (ISC), qui ne sont pas dans la page.
- Les données de test (`tests/donnees/`) : du GABC latin de Divinum Officium (MIT) et de
  GregoBase (3879, CC0), et un Kyrie à deux voix fait pour les tests.
- Rien de non libre ici : le français de Divinum Officium et les MusicXML de la schola
  restent dans scriptorium.
