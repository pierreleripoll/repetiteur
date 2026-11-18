# Plan du répétiteur : répéter une pièce au micro

*Ce fichier fait foi pour ce dépôt. Le répétiteur est né dans scriptorium
(`~/code/scriptorium`, §6.3 de son `PLAN.md`) et en est sorti le 18.11.2026, avec son
histoire git. Cocher les étapes faites, avec la date.*

## 0. Ce qu'on construit

Une page web pour répéter : une pièce à l'écran, le micro suit la voix et montre ce qu'on
chante contre ce qui est écrit ; puis écouter ou couper les autres voix (faux-bourdon,
polyphonie), s'enregistrer, chanter sur sa prise ; des exercices de déchiffrage sur la
portée, par mode ou par ton de psaume.

Le navigateur fait tout : exsurge lit le GABC (notes et hauteurs, gravure, `id` de chaque
note), SwiftF0 (MIT, par onnxruntime-web dans un worker) mesure la voix, pitchy (McLeod,
MIT) en secours, un suiveur sans mesure attend le chanteur. Le chant n'a pas de mesure :
on suit la voix note à note. Pierre d'abord, sur son portable ; la schola plus tard, en
ligne (rien de non libre dedans).

## 1. Le lien avec scriptorium

Scriptorium (`~/code/scriptorium`) prépare les programmes de la schola et sort les
documents à imprimer. Le répétiteur n'en prend que des pièces, par quatre routes en
lecture de son serveur (`uv run scriptorium serveur`, `src/api.ts` ici) :

| Route | Ce qu'elle rend |
|---|---|
| `/api/programmes` | la liste des programmes (nom, titre) |
| `/api/programmes/{nom}` | les pièces : GABC ou MusicXML, latin, ton, mode, indications. Jamais le français de Divinum Officium (il n'est pas libre) |
| `/api/bibliotheque?q=` | les pièces de la bibliothèque par incipit |
| `/api/pieces/{référence}` | une pièce de la bibliothèque, avec son GABC |

`tests/donnees/essai.json` est ce que rend `/api/programmes/{nom}` pour un programme de
deux pièces : c'est le contrat, le test de bout en bout s'en sert. Sans serveur, la page
marche encore avec un GABC collé.

- [ ] Un programme en fichier JSON (la même forme), écrit par une commande de scriptorium
  et lu par la page depuis un fichier ou une adresse : la page n'a plus besoin du serveur,
  elle peut être mise en ligne telle quelle.
- [ ] La recherche dans la bibliothèque sans serveur : un index des pièces libres
  (GregoBase CC0, mélodies de DO MIT), ou la recherche reste en local.

## 2. Étapes

**La répétition, tranche 1 : suivre la voix sur une pièce** (fait le 17.11.2026)
- [x] exsurge (fork bbloomf, paquet `exsurge-ts` 2.8.4, MIT, pris sur GitHub : le paquet npm
  `exsurge` date de 2016). Il lit les deux dialectes (DO et Gregorio), donne la hauteur de
  chaque note (`Pitch.toInt()`) et grave chaque note avec l'`id` `note-N`. Essai sur 826
  pièces (400 de GregoBase, 400 de DO, le programme `exemple`) : aucune erreur, une note
  du SVG pour chaque note lue. (17.11.2026)
- [x] Le serveur : `serveur.py` de scriptorium (FastAPI), `uv run scriptorium serveur`.
  `/api/programmes`, `/api/programmes/{nom}` (les pièces en GABC, sans `texte_fr`),
  `/api/bibliotheque?q=`, `/api/pieces/{référence}` ; la page construite, avec ses
  adresses (`/repetition`). (17.11.2026)
- [x] La page : Vite, Vue 3, TypeScript, Pinia, vue-router, pnpm, vitest. Le style : les
  tokens du DS (`tokens/encres.css`, `tokens/fonts.css`) par l'alias `@ds`. (17.11.2026)
- [x] L'écran Répétition (`/repetition`) : une pièce d'un programme, de la bibliothèque, ou
  du GABC collé. Le do de la clé à choisir (± un demi-ton, « donner le ton », « caler sur
  ma voix »), gardé par pièce dans le navigateur. Le curseur (au minium) suit la voix ; un
  clic sur une note l'y met. Écouter la pièce depuis le curseur (une pulsation par note,
  deux pour une note pointée), bourdon sur la finale. La voix en trait sur les degrés de la
  pièce, et **sur la portée** : un trait au minium part de la note du curseur, à la hauteur
  chantée (un degré par position, un demi-ton hors gamme entre deux ; le si♭ sur la ligne du
  si dans une phrase qui a un si♭), et reste après la pièce (`voixSurPortee.ts`). Après la pièce : les notes à plus de 25 cents au minium, l'écart de chaque phrase.
  Les réglages sont tous dans `src/reglages.ts`. (17.11.2026)
- [x] Tests : `pnpm test` (lecture du GABC, hauteur sur des sons faits, suiveur
  sur une pièce « chantée » en mesures) ; `tests/test_serveur.py` de scriptorium ;
  `tests/test_repetition.py` : Chrome sans écran, un faux micro chante l'antienne
  du 26.11, le curseur va au bout. (17.11.2026)
- [x] L'accordeur, au-dessus de la partition (`composants/Accordeur.vue`) : le niveau et la
  netteté du micro avec leur seuil, la note entendue même si elle ne compte pas, trop
  grave ou trop aigu par rapport à la note à chanter, la raison quand une mesure ne compte
  pas, et le nom de l'entrée. Premier essai de Pierre au micro : rien ne comptait
  (« vous : — » tout le temps). La cause : le décalage continu du micro interne (§4). Le
  seuil de volume passe de 0,01 à 0,003 (−50 dB). (17.11.2026)
- [x] Le banc de la hauteur (`banc/hauteur.py`, `banc/`, résultats dans
  `banc/resultats.md`) : les 40 voix de vocadito (CC BY 4.0) salies cinq fois (propre,
  bruit, pièce, église, micro de portable), les détecteurs de l'app et des modèles (SwiftF0,
  PESTO, pYIN). Ce qu'il dit :
  - la hauteur de pitchy est bonne (97 % juste sur la voix propre, 81 % au portable) ;
    c'est le seuil de clarté 0,9 qui perdait des trames (83 % justes, 62 % au portable) ;
  - d'où les nouveaux réglages : une voix déjà suivie compte encore jusqu'à une clarté de
    0,5 si elle ne saute pas d'un demi-ton (`clarteGarde`, `sautGarde`), et la médiane sur
    3 mesures au lieu de 5. Trames justes : 92 % (propre), 68 % (portable) ; notes au faux
    bilan : 2 % au lieu de 6 % ; retard : 40 ms au lieu de 48. Le prix : plus de fausses
    alertes dans une pièce qui résonne (26 % au lieu de 13 %), la queue de la note ;
  - essayés aussi : garde 0,3 ou 0,7 (pareil ou moins bien), saut 0,5 (moins bien), clarté
    0,8 seule (plus de notes trouvées, mais deux fois plus de fausses alertes et de faux
    bilans à l'église), la fenêtre de 4096 (moins bien partout sauf l'octave) ;
  - SwiftF0 (MIT, 135 Ko) est le meilleur : presque aucune erreur d'octave (0,1 % contre
    1 à 2 %), 2 fois moins de notes perdues au portable, faux bilan 0,6 % sur la voix
    propre. En direct, il lui faut des trames après la note : 4 (80 ms de retard) ou 2
    (48 ms) avec un seuil de confiance à 0,3. À 0, sa confiance reste nulle ;
  - PESTO perd presque tout au portable (sa confiance tombe avec le niveau) ; pYIN ne
    supporte pas le décalage continu ; les deux sont hors ligne ou lents. (18.11.2026)
- [ ] Pierre chante *Lux æterna* et une antienne au micro, et dit si les réglages vont
  (tolérance 50 cents, tenue 100 ms, confiance de SwiftF0 0,3 ; avec pitchy, clarté 0,9
  puis 0,5 pour une voix suivie ; volume −50 dB).

**La répétition, tranche 3 : les voix** (commencée le 17.11.2026)
- [x] Une pièce à plusieurs voix dans un programme libre : `musicxml_fichier` (chemin depuis
  le programme), `programme.polyphonie`, `musicxml.py` de scriptorium (les voix, le texte de
  la voix du dessus pour le livret). L'API donne `musicxml`. Au lutrin : pas encore gravée,
  une rubrique « partition à part » et le texte. (17.11.2026)
- [x] Dans l'app : `chant/polyphonie.ts` lit le MusicXML (voix, MIDI, temps en noires,
  syllabes, phrases coupées aux silences) ; `VuePolyphonie.vue` le grave avec Verovio 6.4.1
  (npm, chargé à la demande, 8 Mo), la voix choisie à l'encre et les autres en gris. On
  choisit sa voix (gardée par pièce) : le suiveur, le curseur et le trait sur la portée
  marchent comme pour le chant (`voixSurPortee.mesurerVerovio`). « Écouter » joue les voix
  cochées en mesure (tempo du fichier, de 40 à 130 %) ; « Chanter avec » joue les autres
  et place chaque mesure du micro sur la note de sa voix qui sonne (retard du micro :
  `latence`, 80 ms), puis le bilan (`bilanDesTraces`). Les altérations de l'éditeur de
  Franco (paroles n° 9 : « # », « ♭ », « (♮) ») sont chantées, et gravées au-dessus de la
  note (`pourVerovio`). (17.11.2026)
- [x] L'office des morts : leçon IV *Responde mihi* et répons IV *Memento mei* de Franco,
  depuis les MusicXML de la schola (titre et compositeur corrigés : le fichier disait
  « ¿Quieres, pastorcillo? », Gaspar Fernandes). (17.11.2026)
- [x] Tests : `polyphonie.test.ts`, `bilanDesTraces`, `tests/donnees/kyrie_deux_voix.musicxml`
  (fait pour les tests) ; de bout en bout, le faux micro chante sa basse. (17.11.2026)
- [ ] Pierre chante sa voix du *Memento* de Franco, seul puis « avec », et dit si la
  latence (40 ms, plus le retard du détecteur, déjà retiré : 80 ms en tout avec pitchy)
  et le tempo vont.
- [ ] S'enregistrer (PCM brut dans un `AudioWorklet`, prises dans OPFS), chanter sur sa
  prise. Au casque ; un essai de latence (un clap en boucle).

**La répétition, la suite** (pas commencée)
- [ ] Exercices : des incipits de la bibliothèque par mode (`piece.mode`), les tons de
  psaumes de `tons.TONS` (intonation, médiante, terminaison), lire en clé d'ut et en clé de
  fa. Même écran, même suiveur.
- [ ] La voix : stabilité d'une note tenue, attaque par en dessous, dérive, vibrato
  (vitesse, largeur), spectrogramme. Pas fiable au micro d'un portable : jitter, shimmer,
  rapport bruit / harmoniques. Le formant du chanteur ne compare que deux prises au même micro.
- [ ] En ligne pour la schola : la page seule (statique), sur téléphone, les droits vérifiés.
- [x] SwiftF0 mesure la voix dans l'app, pitchy en secours (pendant le chargement, si
  onnxruntime-web échoue, ou la case « pitchy », `?detecteur=pitchy`). Le micro passe par
  un `AudioWorklet` (blocs de 256 échantillons sans trou) ; `reechantillonner.ts` le met à
  16 kHz ; `swiftf0.ts` refait `swiftf0_direct` du banc (2 trames d'avance, confiance 0,3)
  dans un worker (onnxruntime-web 1.31.1, un fil, le wasm de 15 Mo à la demande). Deux
  écarts au plan, décidés avec Pierre : chaque fenêtre est mise sans sa moyenne et à −20 dB
  avant le modèle (sa confiance tombe avec le niveau, et le décalage continu du ThinkPad lui
  fait dire 2060 Hz, §4) ; une inférence pour 2 trames (6 ms par inférence : 15 % d'un cœur
  au lieu de 37 %). Une `Mesure` est datée à l'instant du son : `latence` passe de 80 à
  40 ms. La case « voix grave » est retirée. `swiftf0.test.ts` compare le TS au Python
  (`banc/hauteur.py reference`) ; le faux micro de `test_repetition.py` chante avec SwiftF0,
  et avec pitchy. Le banc (`swiftf0-web`, retard 68 ms) :

  | | propre | bruit | pièce | église | portable |
  |---|---:|---:|---:|---:|---:|
  | trames justes (pitchy) | 98,0 (92,2) | 98,0 (86,3) | 90,3 (73,6) | 63,8 (28,4) | 87,3 (68,4) |
  | notes manquées | 0,1 (0,7) | 0,1 (3,7) | 0,1 (7,3) | 0,7 (57,2) | 1,2 (12,0) |
  | notes au faux bilan | 0,6 (2,2) | 0,6 (2,5) | 7,5 (10,2) | 40,0 (11,4) | 9,3 (9,1) |
  | fausses alertes | 16,7 (8,8) | 17,1 (3,7) | 46,3 (26,2) | 78,1 (30,3) | 26,8 (14,3) |

  Le prix : deux fois plus de fausses alertes que pitchy (la queue d'une note dans une
  pièce qui résonne, le souffle du portable mis à −20 dB), et plus de faux bilans à
  l'église. (18.11.2026)
- [ ] Pierre chante au micro avec SwiftF0, puis avec la case « pitchy », et dit si c'est
  mieux. À regarder : les fausses alertes après une note (le curseur attend-il trop pour
  finir ?), et à l'église.

## 3. Limites connues

  - Le trait sur la portée est placé par le suiveur : s'il se trompe de note, le trait est
    au mauvais endroit. Il avance d'au plus 1,2 px par mesure (une toutes les 16 ms avec
    SwiftF0), puis se serre jusqu'à la note suivante.
  - Des notes de même hauteur à la suite (la teneur d'un psaume) font un seul pas : le
    suiveur n'entend pas où une syllabe finit. Entre deux phrases, un souffle (150 ms de
    silence) permet de passer à une note de même hauteur.
  - SwiftF0 (18.11.2026) : environ 14 % d'un cœur dans un worker tant que le micro est
    ouvert, et 15 Mo de wasm au premier micro (pitchy mesure pendant ce temps). Il va de
    47 Hz à 2 kHz : plus de case « voix grave ». Une mesure arrive 48 ou 64 ms après le son
    (2 trames par inférence). La case « pitchy » (ou `?detecteur=pitchy`) remet l'ancien
    détecteur, pour comparer.
  - Le bourdon et l'écoute passent par les haut-parleurs : sans casque, le micro les entend.
    Pendant l'écoute, le suiveur se tait.
  - Tempérament égal, et la hauteur est relative (le do choisi). Pas de rythme fin à
    l'écoute : une pulsation par note, deux pour une note pointée.
  - exsurge vient de GitHub (pas de npm) : pour le mettre à jour, changer le commit dans
    `package.json`.

## 4. Pièges déjà rencontrés

- pnpm dans le bac à sable : il pose son verrou dans `$XDG_RUNTIME_DIR` et son cache dans
  `~/.cache/pnpm`, en lecture seule. `XDG_RUNTIME_DIR=$TMPDIR/run pnpm add --store-dir
  ~/.local/share/pnpm/store --cache-dir $TMPDIR/pnpm-cache …` ; npm : `npm_config_cache=$TMPDIR/npm-cache`.
- exsurge-ts : `setFont` règle toutes les polices du texte (pas de `lyricTextFont` comme
  dans sa page d'exemple), et `setGlyphScaling` passe avant `setFont`. Sans DOM (vitest),
  il mesure le texte avec une police donnée : les tests lui en donnent une fausse. Une
  entête de DO peut tenir sur une ligne avec le corps (« mode:2; %% (c4) … »).
- La page de l'app a ses adresses (`/repetition`) : le serveur rend `index.html` pour une
  adresse inconnue hors de `/api` (`serveur.PageWeb` de scriptorium, `FauxServeur` du test de bout en bout), sinon un
  rechargement donne 404.
- Chrome sans écran et le micro : `--use-fake-device-for-media-stream
  --use-file-for-fake-audio-capture=x.wav --use-fake-ui-for-media-stream
  --autoplay-policy=no-user-gesture-required`. Le son se joue en temps réel :
  `--virtual-time-budget` ne marche pas, on lit la page par `--remote-debugging-pipe`
  (`tests/test_repetition.py`).
- Le micro interne du ThinkPad (« Digital Microphone ») a un fort décalage continu (+0,09
  et +0,33 sur ses deux canaux). Sans les traitements du navigateur, il arrive tel quel :
  −14 dB dans le silence, et McLeod ne trouve plus la période (45 demi-tons d'erreur).
  `Detecteur` retire la moyenne de chaque fenêtre ; le test de bout en bout chante avec un
  décalage de +0,2. Sans décalage, le bruit de la pièce est à −50 dB. Vérifier un micro :
  `pw-record --target <id de wpctl status> x.wav`. (17.11.2026)
- Le banc de la hauteur : la hauteur brute (sans la médiane de l'app) a un retard plus
  court que la mesure gardée (21 ms contre 48). Avec un seul retard pour les deux, pitchy
  semblait juste à 84 % au lieu de 97 %. Le bilan cherche les deux. Et il chauffe la
  machine : `python` tourne en priorité basse sur 3 cœurs (`BANC_COEURS`). (18.11.2026)
- SwiftF0 en direct : le modèle voit 2815 échantillons de chaque côté de la trame.
  Sans trame après elle, sa confiance reste nulle (la hauteur, elle, est juste à 95 %).
  Son ONNX prend `audio` [1, n] et `fmin`, `fmax` en scalaires : un lot de 1 seulement.
  (18.11.2026)
- SwiftF0 et le niveau : sa confiance tombe avec le niveau du son (un la 220 synthétique :
  0,97 à −15 dB, 0,02 à −41 dB, avec une hauteur fausse ; une voix de vocadito : 97 % de
  trames justes à −26 dB, 63 à 90 % à −48 dB). Et un décalage continu de +0,2 devant une
  voix faible lui fait dire 2060 Hz avec confiance. L'app retire la moyenne de chaque
  fenêtre et la met à −20 dB avant le modèle (`normer`, le même dans `banc/hauteur.py`) ;
  le volume minimal se juge sur le vrai niveau. Un son qui commence d'un coup juste après le
  silence d'avant le début donne une trame fausse et sûre d'elle (la2, trame 5 : 1459 Hz,
  0,81), dans le Python aussi : les tests sautent les 11 premières trames. (18.11.2026)
- onnxruntime-web 1.31.1 : le build Node (export `node`) tourne dans vitest et le banc,
  sans onnxruntime-node ; dans la page, `onnxruntime-web/wasm` dans un worker, un fil
  (pas besoin de COOP/COEP), le wasm par `?url` (`env.wasm.wasmPaths`). Une inférence
  prend environ 6 ms (2,4 en Python) : l'app en fait une pour 2 trames. pnpm 12 refuse
  d'installer tant qu'un script de construction n'est pas décidé : `pnpm-workspace.yaml`
  refuse celui de protobufjs (une vérification de version). Vite met le worklet du micro
  (`capteur.worklet.js`, moins de 4 Ko) en URL `data:` : Chrome l'accepte. (18.11.2026)

## 5. Règles

- Code, identifiants, commentaires et commits en français.
- Rien de non libre dans ce dépôt : pas de français de Divinum Officium, pas de MusicXML
  de la schola (Franco). La page doit pouvoir aller en ligne.
- Tous les réglages dans `src/reglages.ts`.
