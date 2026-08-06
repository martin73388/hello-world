# État de reprise — passe densité

Ce fichier existe parce que la session tombe en limite de contexte et que le
travail reprend sur « resume » comme s'il n'y avait pas eu de coupure. Il dit
où on en est, ce qui vient ensuite, et où sont les outils. Il se met à jour à
chaque pause et se supprime quand la passe est finie.

## La commande

Le brief de la passe est `PROMPT.md` (écrit d'après le repo de référence
`martin73388/jungle-trail`, cloné en lecture dans
`/workspace/martin73388/jungle-trail`). Le plan de portage priorisé est
`PORTAGE.md` — chaque item porte son critère de vérification par capture.
Le goal auto-assigné est dans PROMPT.md, section « Le goal de la passe » :
densité, occupation du cadre, silhouettage, vérifiable sur le rendu logiciel.
**Le 1440p depuis la machine du joueur n'est PLUS une condition** (levée
explicitement). Ordre du joueur en vigueur : **pause à 30 % de session
restante**, tout commité/poussé avant la pause.

## Fait (commité et poussé)

1. `PROMPT.md` — le brief adapté.
2. `PORTAGE.md` — le plan complet (8 agents de reconnaissance ; les notes de
   lecture brutes : `scratchpad/lectures.json` et la sortie du workflow
   `wf_31d45c28-59e`, réutilisable en cache avec `resumeFromRunId`).
3. **Système 1 du brief — la primitive courbée** (`bentCard.js`) : arc de
   nervure, cuvette qui se détend, colonnes en |q|^0.74, normale analytique,
   déchirures. Branchée dans les pins (branches), les bouleaux (coque du
   houppier) et un nouvel archétype de fougère (rosette de 7 frondes,
   texture `frondCardTexture` peinte le long de u). Vérifié par captures.
4. **PORTAGE 1.4 (partiel)** — occlusion de contact sur le TAPIS seulement
   (grass.js, `color.rgb *= 0.58 + 0.72*grUp`). Capture de vérif :
   `scratchpad/occl-jour.png` (si absente, la refaire — voir plus bas).

## Fait aussi (tranche « resume » n°1)

- Tier 1 : 1.1 airmass (weather.js), 1.5 lobe courbé + variance + abaxial
  (wind.js, grass.js), 1.3 stand/bulk (pins), 1.2 teinte par instance
  (pins + houppiers bouleaux). Vérifié par captures t1-cj/t1-jour.
- Système 2 : `world/litter.js` (12 600 feuilles mortes, 3 archétypes) et
  `world/understory.js` (420 rosettes + 300 arbustes) — écrits par agents,
  intégrés dans main.js après plantFlora. VÉRIFIÉ sur d2-jour/midi/cj :
  cadre fermé en haut et sur les côtés, plus de sol nu, trois plans nets.
  Correctif : buffer de teinte séparé et quasi neutre pour les fûts de pin
  (le partage avec le feuillage les peignait carotte) — vérifié d3-jour.
  Si les fûts semblent encore trop chauds sur la machine cible, la vraie
  réponse est la texture d'écorce bakée (PORTAGE Tier 3), pas un réglage.

## Re-jugement sur les captures honnêtes (à traiter EN PREMIER)

Première lecture des trois cadrages de `screenshots/cible/`. Ce sont des
constats d'image, pas encore des correctifs.

- **Le tapis rétroéclairé est très clair, et il tire au JAUNE.** Mesuré sur la
  bande d'herbe du contre-jour (45–80 % de la hauteur) : 13 % des pixels
  au-dessus de 200 de luminance, p99 à 230, et les pixels clairs tournent
  autour de RGB 200/220/110. Le G-R n'y est que de **+8 à +26** alors que le
  G-B est de +85 à +119 : au point le plus lumineux, le brin n'est pas vert, il
  est jaune. C'est cohérent avec le terme, dont la teinte (0.78, 0.86, 0.30) est
  déjà jaune et se trouve multipliée par 2,2 puis par la variance — mais ça va
  contre la thèse G-R du PORTAGE, qui veut que le vert devance le rouge là où
  la lumière traverse la feuille.
  *Réserve honnête* : à l'œil et en vignette, j'avais écrit « néon fluorescent ».
  La mesure ne le confirme pas — les teintes sont plausibles pour un
  rétroéclairage. Ce qui est établi, c'est la clarté et la dérive vers le jaune ;
  savoir si c'est trop est un arbitrage de DA, pas un constat. Ne pas toucher au
  gain sans trancher ça d'abord, et sans un A/B chiffré sur le G-R.
  À noter aussi : `grass.js` n'a jamais reçu le **lobe courbé** du PORTAGE 1.5
  (il fait encore `dot(V, soleil)` pur, quand `wind.js` fait bien
  `normalize(sun + N*0.6)`), ni la face abaxiale. Le 1.5 n'est donc qu'à moitié
  porté côté tapis.
- **Le sol est écrasé au noir à contre-jour.** Les 12 600 feuilles de litière
  sont invisibles — soit noyées sous le tapis, soit sans lumière. Le travail
  existe dans le code et ne se voit pas dans l'image : à vérifier avant d'en
  ajouter.
- **Les fûts sont des silhouettes pleines**, sans aucune modulation interne. En
  contre-jour c'est défendable ; à confirmer que ce n'est pas le cas partout.
- **Le ciel de couchant est une bande orange franche** avec un disque pâle
  délavé. Crude — mais c'est du ressort du dôme (3.4 / raccord horizon), pas de
  la densité.
- **Le surplomb manque toujours au plein-jour** : le haut du cadre est ouvert
  au centre, seuls les angles portent du feuillage. Confirme l'item resté au
  plan.
- **Le tapis lit comme un seul vert** au plein-jour — la teinte par instance du
  tapis (PORTAGE 1.2, volet herbe) est bien le manque le plus visible.

## À faire, dans l'ordre du plan

- **Tier 1 restant** : 1.1 airmass (weather.js — couleur/intensité de la
  directionnelle par extinction, retirer les teintes keyframées de la
  directionnelle SEULE) ; 1.2 teinte par instance + sénescence (~1/9) via un
  buffer thin-instance `color` ; 1.3 stand()/bulk() dans les boucles de
  placement ; 1.5 lobe de translucidité courbé par la normale + variance par
  instance + face abaxiale (wind.js/grass.js) — PRÉREQUIS avant tout grade ;
  1.6 semis à queue lourde (3 octaves de clump, probabilité continue).
- **Système 2, reste** : le SURPLOMB au-dessus de la route (bouleaux de
  lisière à couronne penchée — troncs hors chaussée, roadQuery fait foi).
  ~~La teinte par instance du TAPIS~~ FAIT : les six strates ont leur buffer
  'color' rempli par sowCell (possible depuis le semis par cellules ancrées
  au sol — retours joueur de la session locale : semis stable, caméra du van
  bornée au volume habitable, livrée du van par teinte de matériau, garage
  exclu des six strates).
- **Ensuite** : PORTAGE Tier 2/3 (bake GPU, transmittance de canopée,
  volumétrique, grade) — voir PORTAGE.md.

**Ordre revu par la mesure (voir PERF.md).** À 23-30 ms par frame au quart de
la résolution cible, dont ~11 ms d'ombres, le PORTAGE 2.5 (bucketing + LOD)
n'est plus un prérequis théorique de la densité : c'est un prérequis mesuré.
Toute hausse de densité (1.6, litière de 2.1) passe après lui. La passe
d'ombres est le premier poste à attaquer, et de loin.

## Outillage (machine locale — plus de sandbox, plus de SwiftShader)

- Serveur : `cd la-route && npm run dev`. Note le port annoncé : 5173 peut
  déjà être pris par une instance laissée ouverte.
- **Chrome finit par confisquer le GPU d'un onglet resté masqué.** Après une
  longue session en arrière-plan, les avertissements « Destroyed texture
  IOSurface used in a submit » s'accumulent, puis la compilation ASYNCHRONE des
  pipelines cesse de progresser : tout `isReadyForSubMesh` reste faux pour
  toujours, sur les deux moteurs, même après redémarrage de vite, même sur un
  commit vérifié bon une heure avant. Ça ressemble à s'y méprendre à un shader
  cassé — la bissection par `git stash` de TOUT le travail non commité est le
  seul test qui coupe court. Remède : remettre la fenêtre au premier plan et
  recharger. Diagnostiquer du code là-dessus est une perte de temps pure.
- **La fenêtre doit être VISIBLE pour capturer.** Onglet masqué : rAF est
  suspendu (zéro frame) et le canvas se lit noir — une capture de 76 ko,
  moyenne (0,0,0). Si la boucle est arrêtée, on peut la piloter à la main
  (`en._activeRenderLoops.slice()` puis appeler les callbacks en boucle : elles
  font la mise à jour du jeu ET le rendu), mais ça ne rend PAS le canvas
  lisible — seule la visibilité le fait. Toujours vérifier
  `document.visibilityState` avant de conclure d'une série.
- **Captures** : ouvrir la page dans Chrome et appeler `__laroute.capture.run()`
  (ou F9). `run(false)` renvoie les data-URL au lieu de télécharger — c'est ce
  qu'il faut pour les écrire ailleurs que dans le dossier de téléchargement.
  Une série de trois prend quelques secondes, plus les ~20 s de warm-up WebGPU
  au chargement. Les cadrages canoniques sont dans `src/ui/capture.js`
  (FRAMINGS) ; l'« avant » de la passe est `screenshots/cible/`.
- Pour déposer les captures sur le disque sans passer par le navigateur : un
  petit serveur qui écrit ce qu'on lui POSTe suffit (la page fait
  `fetch(url, {method:'POST', body: dataURL})`), CORS ouvert.
- Comparaison chiffrée de deux séries : Python + PIL est présent. Les mesures
  qui comptent sont saturation moyenne, 1er centile et étendue p01→p99 — c'est
  ce triplet qui a révélé que les captures mentaient.
- Le jeu expose `window.__laroute` (state, scene, engine, weather.setTime/
  setWeather, capture, …).
- Le référentiel `jungle-trail` n'est PAS sur cette machine ; PORTAGE.md en est
  la distillation et fait foi. Les références Valheim ne sont pas commises.

## Tranche « machine cible » (session locale, MacBook M4)

La session tourne désormais SUR la machine cible, plus en sandbox : Chrome +
WebGPU réel, rendu à pleine vitesse. Deux choses en découlent.

1. **Le chemin WebGPU n'avait jamais démarré.** Quatre pannes en série, toutes
   avant le premier pixel (greffes de prototype WebGL-seulement, plugins GLSL
   refusés sur matériau WGSL, `@stride` sur les tableaux d'uniformes,
   `textureSample` en flot non uniforme). Corrigé et vérifié : 361
   sous-maillages compilés, image identique au chemin `?gl`.
2. **Le mode capture mesurait autre chose que l'écran.** Le chemin RTT
   n'appliquait pas la chaîne de post : toutes les captures de vérification des
   passes précédentes jugeaient une bouillie grise désaturée. Voir DECISIONS,
   section dédiée. F9 copie maintenant le back buffer.

**Conséquence sur ce qui précède** : les validations « vérifié par captures »
de la passe densité (bentCard, Tier 1, litière, étage moyen) ont été prononcées
sur des images fausses. Le travail lui-même n'est pas invalidé — le code est
sain, il tourne — mais son JUGEMENT esthétique est à refaire sur les nouvelles
captures. C'est le premier chantier de la reprise, avant d'ajouter quoi que ce
soit.

Nouvel « avant » de référence : `screenshots/cible/cible-{plein-jour,midi,
contre-jour}-1440p.png`.

## Pièges connus (ne pas retomber dedans)

- **WGSL — tableaux d'uniformes** : un `uniform vec4 x[16]` ressort de la
  transpilation en `@stride(16) array<…>`, attribut retiré de la spec : Tint
  refuse le module. Dérouler à la génération du source. Le piège n'est PAS
  l'indexation dynamique, c'est la déclaration.
- **WGSL — flot de contrôle uniforme** : `textureSample` ne peut pas être
  appelé sous un `if` qui dépend du fragment. Lire d'abord, masquer ensuite.
- **Backticks dans le GLSL** : les shaders vivent dans des template strings
  JS — un backtick dans un commentaire ferme la chaîne. `node --check` sur
  tous les fichiers de `src/` attrape ça en une seconde.
- Samplers de plugins : à déclarer dans `CUSTOM_VERTEX_DEFINITIONS`, jamais
  dans le bloc d'uniformes (sinon UBO → compilation cassée).
- Textures à découpe alpha : PAS de mipmaps, sinon blocs verts volants.
- `thinInstanceSetBuffer` une fois, `thinInstanceBufferUpdated` ensuite.
- Le vent des plugins croît en y² : tout archétype plus haut doit baisser
  son `strength` (les pins de 12 m sont à 0.2).
- bentCard pousse vers +Z, À PLAT, normale +Y — ne pas réappliquer le
  RotationX(π/2) de l'époque CreatePlane.
- Zéro allocation par frame ; LCG `(s*16807)%2147483647` partout.
