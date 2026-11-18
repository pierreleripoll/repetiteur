# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Le répétiteur est une page web pour répéter le chant : une pièce à l'écran (GABC ou
MusicXML), le micro suit la voix note à note. Pour la schola Laus Perennis. Tout est en
français : le code (identifiants compris), les commentaires, les commits. Le plan fait
foi : `PLAN.md` (lire avant d'agir). Il dit où on en est, la prochaine étape, et les pièges
déjà rencontrés (§4). Cocher les étapes faites, avec la date.

Il est sorti de scriptorium (`~/code/scriptorium`) le 18.11.2026. Scriptorium prépare les
programmes et les documents à imprimer ; ici, seulement la répétition.

## Commandes

```bash
pnpm install
pnpm dev                  # port 5173 ($WEB_PORT), /api vers $SCRIPTORIUM_PORT (8000)
pnpm test                 # vitest, 3 s
pnpm exec vitest run src/chant/suiveur.test.ts   # un seul fichier
pnpm build                # vue-tsc puis dist/
pnpm e2e                  # uv run --with pytest pytest tests : dist/ dans Chrome sans écran (35 s)
```

Pas de linter. `pnpm e2e` demande `dist/` (construit) et Chrome, sinon il est sauté.

Les pièces des programmes et de la bibliothèque viennent du serveur de scriptorium :
`uv run scriptorium serveur` dans `~/code/scriptorium` (port 8000). Sans lui, la page
marche avec un GABC collé.

Dans le bac à sable de Claude Code, pnpm a besoin de `XDG_RUNTIME_DIR=$TMPDIR/run`, et
pour installer de `--store-dir ~/.local/share/pnpm/store --cache-dir $TMPDIR/pnpm-cache` ;
uv de `UV_CACHE_DIR=$HOME/.cache/uv` (PLAN §4).

Le banc de la hauteur (`banc/`) : quel détecteur de hauteur pour la répétition. Les voix de
vocadito (https://zenodo.org/records/5578807, `vocadito.zip` dézippé dans
`donnees/banc/vocadito/`), salies cinq fois dans `donnees/banc/conditions/` (800 Mo, ignoré
par git). Un script uv à part : torch et les modèles restent hors du projet.

```bash
uv run --script banc/hauteur.py preparer   # vocadito → donnees/banc/conditions
uv run --script banc/hauteur.py python     # pYIN, SwiftF0, PESTO : 25 min, 3 cœurs (BANC_COEURS)
uv run --script banc/hauteur.py pitchy     # banc/detecteurs.banc.test.ts : pitchy (6 min), swiftf0-web (10 min) ; BANC_VARIANTES=a,b
uv run --script banc/hauteur.py bilan      # banc/resultats.md
uv run --script banc/hauteur.py reference  # src/audio/swiftf0.reference.json (les sons du test de SwiftF0)
```

Il chauffe la machine : `python` et `pitchy` tournent en priorité basse. Au premier
lancement, il lui faut le réseau vers pypi.org, files.pythonhosted.org et
download.pytorch.org.

## L'architecture

Tout est dans le navigateur (Vue 3, TypeScript, Vite, Pinia). Un seul écran,
`src/ecrans/EcranRepetition.vue`.

- `src/api.ts` : les quatre routes en lecture du serveur de scriptorium (programmes,
  bibliothèque). `tests/donnees/essai.json` est ce que rend `/api/programmes/{nom}` : le
  contrat entre les deux dépôts.
- `src/chant/` : la musique, sans audio. `partition.ts` lit le GABC avec exsurge
  (`exsurge-ts`, pris sur GitHub) en notes (hauteur depuis le do de la clé, syllabe,
  phrase) et le grave (chaque note a l'id `note-N`). `polyphonie.ts` lit un MusicXML à
  plusieurs voix. `suiveur.ts` suit le chanteur note à note (testé seul). `solfege.ts`.
- `src/audio/` : la voix. `micro.ts` (un `AudioWorklet`, `capteur.worklet.js`, en blocs de
  256 échantillons), `ecoute.ts` (qui mesure), `swiftf0.ts` (SwiftF0, `swiftf0.onnx`, à
  16 kHz par `reechantillonner.ts`, chaque fenêtre sans sa moyenne et à −20 dB ; dans le
  worker `swiftf0.worker.ts` avec onnxruntime-web, chargé à la demande ; testé contre le
  Python par `swiftf0.reference.json`), `hauteur.ts` (pitchy, en secours, et la `Mesure`,
  datée à l'instant du son), `son.ts` (donne le ton, joue, tient le bourdon, `jouerVoix`).
- `src/composants/` : `VuePartition.vue` (le chant), `VuePolyphonie.vue` (Verovio, chargé à
  la demande), `voixSurPortee.ts` (la voix dessinée sur la portée, sur le pas du suiveur),
  `Accordeur.vue` (ce que capte le micro : niveau, netteté, note, trop grave ou trop aigu),
  `TraceHauteur.vue`.
- `src/reglages.ts` : tous les réglages (tolérance, tenue, seuils des détecteurs).
- `src/stores/repetition.ts` : ce que le navigateur garde par pièce (le do, la voix). Les
  clés commencent par `scriptorium:` : ne pas les renommer, on perdrait les réglages gardés.
- `src/style.css` : les tokens du système graphique (`~/code/laus-perennis-design` ou
  `$SCRIPTORIUM_DS`), par l'alias `@ds` de `vite.config.ts`.
- `tests/test_repetition.py` : de bout en bout. Un faux serveur (la page de `dist` et
  `essai.json`), Chrome sans écran, un faux micro qui chante un WAV fait depuis les notes.
- `banc/` : `hauteur.py` (Python, modèles), `detecteurs.banc.test.ts` (les détecteurs de la
  page, tels quels, sauté sans `BANC_DOSSIER`).

## Les worktrees (wtx)

Chaque branche a son worktree git, sa session tmux et son agent (`wtx.toml`). La session
s'appelle `repetiteur/<branche>`, ses panneaux sont `agent`, `web`, `shell`.

- Les ports sont par worktree, dans `.env.worktree`, que chaque panneau exporte. Ne jamais
  écrire un port en dur : lire `WEB_PORT` (`vite.config.ts` le fait déjà).
- `pnpm dev` tourne déjà dans le panneau `web`. Ne pas le relancer. Son journal est dans
  `.wt-logs/web.log` : le bac à sable n'atteint pas tmux.
- `wtx curl web [chemin] [options de curl]` appelle la page de ce worktree, sans demander.
  Un curl simple tourne dans le bac à sable et n'atteint pas un port local.
- `/api` va toujours au port 8000 (`SCRIPTORIUM_PORT`) : le serveur de scriptorium, lancé
  à la main, le même pour tous les worktrees.
- Travailler sur sa branche seulement. Ne jamais pousser `main`. Quand le travail est prêt,
  le commiter et le dire. Un humain lance `wtx land <branche>` depuis le dépôt principal
  (une fusion locale, après `pnpm typecheck` et `pnpm test`) ; il refuse les changements
  non commités.
- Un crochet pre-push garde cette règle. S'il refuse, c'est voulu : ne pas le contourner.
- Ne tuer que ses propres serveurs (le processus lancé, ou le port), jamais par un
  `pkill -f vite` qui tue ceux des autres worktrees.
- `../scriptorium` et `../laus-perennis-design` se lisent sans demander, et ne s'écrivent
  jamais depuis ici.

## Règles

- Rien de non libre dans ce dépôt : pas de français de Divinum Officium, pas de MusicXML de
  la schola (Franco, lu depuis scriptorium par un test qui se saute sans lui). La page doit
  pouvoir aller en ligne.
- Le style vient du système graphique. Une règle qui manque se règle là-bas.
- `~/code/scriptorium` et `~/code/laus-perennis-design` : lecture seule depuis ici. Si
  l'API doit changer, c'est un changement dans scriptorium, et `tests/donnees/essai.json`
  se refait.
