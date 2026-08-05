# DECISIONS

Chaque écart au brief, en une ligne, avec sa raison.

- M1 : capsule + boîtes de repère au lieu d'un plan nu — juger l'échelle et
  les ombres coûte zéro et évite un « milestone aveugle ».
- M1 : léger soleil chaud + brume EXP2 posés dès la fondation — le brief les
  place au M2, mais l'overlay a besoin de curseurs branchés sur du réel.
- Graphe de perf : tri d'un buffer fixe (256 frames) pour le 1% low, throttle
  du texte à 4 Hz — conforme à la règle « zéro chaîne par frame ».
- Chemin WebGL activable par `?gl` : OUTIL DE DÉVELOPPEMENT uniquement, pour
  itérer visuellement en CI où aucun adaptateur WebGPU n'existe. Sans le
  paramètre, la démo reste WebGPU sans repli.
- M2 : le clipmap est remplacé provisoirement par une grille dense (320 m,
  ~1,15 m/vertex) + un anneau lointain troué — le vrai clipmap suivant la
  caméra arrive au M3 avec la déformation.
- M2 : le bombé de la chaussée est porté par le ruban de route (3 sommets de
  section) et le terrain est aplani dessous — supprime le z-fighting.
- M2 : ombres en cascades (2 cascades, PCF, stabilisées) dès maintenant ;
  vent hiérarchique et translucidité des aiguilles différés en M2b.
- M2b : vent + translucidité en plugin matériau (injection GLSL dans le
  StandardMaterial, compilé vers WebGPU par Babylon) plutôt qu'un shader
  entièrement custom — on garde lumières/ombres/brouillard du moteur.
- M2b : trois échelles de vent superposées (rafale d'arbre déphasée par
  instance, branches, frisson d'aiguilles), amplitude en carré de la hauteur
  pour ancrer le pied. La passe de profondeur des ombres n'applique PAS le
  plugin : les ombres portées ne se balancent pas (amplitude faible, invisible
  au sol ; un ShadowDepthWrapper pourrait le faire si ça se voit un jour).
- M2b : translucidité = terme à contre-jour (dot(vue→œil, direction du
  soleil)³ × rim), pas de vraie épaisseur — un faux « subsurface » suffisant
  pour des cônes de feuillage, vérifié par A/B (0 → sombre, 3 → halo or).
- M2b : caméra souris, yaw corrigé en `+=` — en main gauche, yaw croissant
  tourne à droite (l'inverse de la convention Three de L'Atelier).
- M3 : buffer d'état 2048² RGBA16F sur 80 m (≈ 4 cm/texel) au lieu du 4096²
  sur 120-160 m du brief — dimensionné pour un marcheur ; on élargira quand
  le van roulera (le côté et la résolution sont des paramètres).
- M3 : recentrage par redraw décalé plutôt que scroll toroïdal — même coût
  GPU, sans l'arithmétique d'adressage ; cranté au texel (pas de nage).
- M3 : « clipmap » réduit à l'anneau utile : un patch de 32 m à ~12,5 cm/vertex
  suit le joueur (re-remplissage CPU en 2 phases via la grille d'accélération
  roadQuery) ; le terrain grossier plonge de 32 cm sous son emprise pour que
  les ornières ne crèvent jamais le maillage à 1,15 m.
- M3 : roadQuery interpole désormais la hauteur par projection sur les
  segments — la version « plus proche échantillon » faisait des marches de
  2 m sous le ruban de route (le patch les révélait en tirets de z-fight).
- M3 : la chaussée en gravier compacté ne prend pas l'empreinte des pas ;
  elle recevra ses propres ornières avec les pneus du van.
- M3 : la passe de profondeur des ombres n'applique pas le déplacement —
  l'« auto-ombrage » des ornières vient des normales recalculées du buffer
  + assombrissement de la terre compressée (une empreinte de 4 cm est de
  toute façon sous le texel de la shadow map).
- M3 : validé sur le chemin dev WebGL (CI sans WebGPU) ; la passe
  EffectWrapper, le texelFetch au vertex et les hooks de plugin doivent être
  confirmés sur WebGPU réel (Mac M4) — premier point à vérifier au retour.
- M4 : van procédural (boîtes + textures dynamiques) plutôt qu'un asset
  importé — cohérent avec la DA low-poly du reste ; le budget est allé à la
  silhouette (galerie, jerrican, bavettes, jonc chromé, lettrage) et au
  mouvement (suspension, sapin désodorisant à ressort).
- M4 : suspension par sondage du sol aux 4 roues + ressort-amortisseur —
  pas de raycast physique, le sol est analytique (groundHeight). Transfert
  de masse par termes accélération/braquage dans tangage/roulis.
- M4 : pas d'animation de porte à la montée — la transition est masquée par
  le fondu de la caméra chase (le brief l'autorise si le fondu couvre).
  L'échappement au démarrage attend les particules du M5.
- M4 : groundHeight = height + épaisseur du ruban (bombé 14→5 cm) — joueur
  et van roulaient DANS le ruban de route depuis le M2, corrigé.
- M4 : caméra initiale retournée (camYaw 0, regard vers le sud) — on
  démarrait dos au van et au voyage depuis le M1.
- M4 : exclusion des pins portée à 8 m du tracé — les couronnes (≈3 m de
  rayon) surplombaient la chaussée et traversaient la caisse du van.
- M4 : plans Babylon : face avant vers -z (main gauche) — le lettrage
  arrière était retourné vers l'intérieur du van.
- M4 : collisions troncs/rochers par hachage spatial 4 m (cercle joueur,
  deux essieux pour le van) — on traversait les arbres depuis le M2.
- M4 : les sillons de pneus sont continus à 60 fps (pas d'émission 0,24 m
  < diamètre de tampon 0,38 m) ; en dev SwiftShader (~2,5 fps) ils
  apparaissent pointillés — artefact d'itération, pas du produit.
- M5 : panaches en particules CPU (ParticleSystem, sprite radial procédural,
  fondu alpha) plutôt que compute GPU — la densité visée (2×240 particules)
  ne le justifie pas ; les particules ne portent pas d'ombre (coût), la
  dérive au vent vient du terme de gravité orienté vent dominant.
- M5 : glisse = relaxation de la vélocité réelle vers l'axe du van
  (adhérence 6,5 route / 2,6 terre) — pas de modèle de pneu ; borné par
  construction, jamais un « verglas ».
- M5 : tôle ondulée = bruit sinusoïdal indexé sur l'odomètre injecté dans le
  sondage de sol des roues (chaussée uniquement, > 3 m/s) — le châssis et le
  sapin réagissent par la chaîne de suspension existante.
- M5 : stries de vent en espace écran reportées au M7 (chaîne de post) ;
  secousses caméra plafonnées à 5 cm et amorties en ~0,5 s.
- M6 : particules CPU pour les cinq interactions (pluie/feu/lucioles/
  oiseaux/feuilles) plutôt que compute GPU — les densités visées ne le
  justifient pas ; les feuilles et oiseaux sont des pools CPU pré-alloués.
- M6 : quota de lumières porté à 6 par matériau ; les lumières d'interaction
  (phares, feu, lueur de seuil) sont DÉSACTIVÉES éteintes pour rester sous
  le quota. Pire cas (phares + feu + garage + seuil = 8) : 2 lumières
  peuvent être ignorées localement — assumé, cas rare.
- M6 : la brillance humide passe par une globale de shader posée à
  BEFORE_LIGHTS et consommée à BEFORE_FOG (specularColor n'existe pas
  encore au hook BEFORE_LIGHTS dans le fragment standard de Babylon 7).
- M6 : leçon de warm-up — manualEmitCount ≥ 0 bascule un ParticleSystem en
  mode manuel DÉFINITIVEMENT ; il faut le rendre à -1 après la pré-compile.
- M7 : la porte s'ouvre au BOUTON (E, diégétique, hérité de L'Atelier) et
  non au premier input comme dans le brief — plus lisible, même effet.
- M7 : pas de TAA (pas d'implémentation robuste WebGPU+WebGL en Babylon 7) —
  FXAA + MSAA 4 + sharpen en tiennent lieu ; SSAO/SSR/DoF écartés
  (robustesse WebGPU/Metal non vérifiable en CI, budget frame) — consigné
  comme dette d'écart au brief.
- M7 : l'exposition « œil qui s'adapte » = cible 1,3 dans le garage porte
  close, glissée vers 1,0 quand la porte s'ouvre (τ 0,4 s).
- M7 : dalle béton 7 cm au-dessus du terrain pour que le patch de
  déformation (zOffset -2) ne perce jamais ; sol de marche unifié
  groundAll (terrain + ruban dehors, dalle dedans).
- M8 : freeze()/blockMaterialDirtyMechanism évalués puis ÉCARTÉS : les
  lumières togglées (phares, feu, seuil) invalident les defines des
  matériaux — les geler casserait l'éclairage dynamique. Le warm-up
  compile chaque pipeline sous l'écran de chargement à la place.
- M8 : la mesure 90 fps / 1 % low se fait sur la machine du joueur
  (M4/WebGPU, overlay F1) — le SwiftShader de CI ne mesure rien d'utile.
## Revue adversariale M6-M8 (correctifs appliqués)

- Descente du van : la position de sortie était posée aveuglément à côté de
  la caisse — le joueur pouvait être expulsé À TRAVERS un mur ou la porte
  close. Elle est maintenant balayée depuis le centre du van et s'arrête à
  la dernière position libre.
- Le jerrican debout culminait à 3,70 m pour une ouverture de porte de
  3,50 m : il traversait le linteau à chaque franchissement. Couché sur la
  galerie, le van culmine à 3,44 m.
- doorBlocked passé de 0,75 à 0,92 : à 0,75 le bas du premier panneau était
  encore à 2,48 m, sous le toit du van (3,08 m) — le van cisaillait la porte.
- Warm-up : la pré-compile de la pluie passait par rain.toggle(), ce qui
  armait la traîne d'égouttement — bruine fantôme de 10 s et sol mouillé
  pendant la révélation. Remplacée par manualEmitCount seul. Les phares se
  coupent net (snapLightsOff) et la porte est reposée fermée.
- Le feu ne peut plus s'allumer dans le garage (foyer enterré sous la dalle)
  ni se rallumer pendant son agonie ; le bouton de porte ne s'actionne plus
  à travers la façade, et ne referme jamais la porte sur le van au seuil.
- Le mécano ne traverse plus le van (rect ajouté aux obstacles de marche) ;
  la caméra ne s'échappe plus par le toit (AABB occlusif par le dessus).
- specularBase n'existe que sous SPECULARTERM : le hook BEFORE_FOG est
  désormais gardé par les deux defines.
- thinInstanceSetBuffer par frame (feuilles) → thinInstanceBufferUpdated :
  le buffer GPU n'est plus détruit/recréé 60 fois par seconde.
- Zéro-alloc : roadQuery, wheelWorld, doorWorld et resolveRects rendent des
  scratchs ; les splices de files vides sont évités.
- Les 2 spots du garage sont désactivés au-delà de 22 m — ils évinçaient la
  lumière du feu de camp du quota de 6.
- Captures : M3-M5 et M7 sont en 1440p ; le bivouac M6 est en 720p — les
  compositions nocturnes en 1440p sous SwiftShader coûtent >5 min par
  cadrage et se disputent le feu avec le warm-up. Les captures de
  référence définitives se prennent sur la machine cible.

## Passe Valheim (direction artistique)

- Herbe : cartes à brins peints dans l'alpha (découpe franche, aucun tri de
  transparence sur 20 000 instances) ; la LUMINANCE de la texture sert de
  hauteur le long du brin pour le terme de translucidité — la pointe, fine,
  transmet plus que la base. Pas de mipmaps sur ces textures : le moyennage
  de l'alpha faisait passer des cartes entières au test de découpe.
- Cinq strates (tapis, hautes tiges, roseaux dans les creux détectés par
  échantillonnage du relief, fleurs en colonies, fougères) : c'est la
  variété de HAUTEUR qui fait la prairie, pas la densité d'une espèce.
- Nuages : cartes en billboard, pas un dôme texturé. Un dôme à 700 m n'est
  plus séparé du dôme de ciel par le depth buffer et disparaît derrière.
  Au passage, minZ de la caméra remonté de 0,05 à 0,2 — un plan proche aussi
  serré ruine toute la précision au loin.
- Eau : Fresnel vers la couleur du ciel plutôt qu'une MirrorTexture. Une
  passe de réflexion coûte une seconde caméra, impose une renderList à
  tenir, et rendait du blanc sur certains pilotes.
- Étagement : le fog EXP2 de Babylon noie tout uniformément. Le HazePlugin
  ajoute une nappe dont la densité décroît avec l'altitude RELATIVE À L'ŒIL
  (en absolu, le monde descendant à −40 m, tout plongeait dans la brume dès
  le premier plan) et qui ne démarre qu'à 18 m.
- Plancher de ciel diffus sur tout le décor et sur l'herbe : au soleil
  rasant, une surface horizontale reçoit N·L ≈ 0 et tombe au noir. Les
  cartes d'herbe, à normale verticale, s'éteignaient les premières.
- Saturation appliquée AVANT la quantification rétro : sinon la palette
  réduite vire au gris. C'est ce qui sépare le 32 bits coloré du délavé.
- Les quatre leviers d'étalonnage (heure, saturation, brume, bloom) sont des
  curseurs vivants dans F1 : le rendu de développement est du WebGL logiciel,
  plus terne que la cible, donc le calage final se fait sur la machine du
  joueur. Les anciens curseurs soleil/brume écrivaient des valeurs que le
  cycle jour/nuit réécrit chaque frame — ils étaient devenus inopérants.
- RISQUE WEBGPU consigné : nos plugins matériau sont en GLSL et Babylon les
  transpile en WGSL via glslang et twgsl, qu'il télécharge depuis son CDN.
  Réseau bloqué = aucun shader ne compile. L'échec est désormais explicite
  (écran de diagnostic dédié) au lieu d'un écran noir, et tout shader qui
  échoue à compiler est signalé à l'écran plutôt que dégradé en silence.

## Premier démarrage sur la machine cible (WebGPU réel, MacBook M4)

Le M3 avait consigné : « la passe EffectWrapper, le texelFetch au vertex et
les hooks de plugin doivent être confirmés sur WebGPU réel (Mac M4) — premier
point à vérifier au retour ». C'est fait. La démo n'avait JAMAIS tourné
ailleurs qu'en `?gl` : quatre pannes en série, chacune masquée par la
précédente, toutes en amont du premier pixel.

- Les capacités du moteur ne sont pas dans la classe, ce sont des greffes de
  prototype livrées par des modules à effet de bord — et `dynamicTexture.js`
  n'importe QUE la version WebGL (greffée sur `ThinEngine`, dont
  `WebGPUEngine` ne descend pas). En ESM tree-shaké, le chemin WebGPU partait
  sans `createDynamicTexture` : plantage au premier ciel peint. On importe
  désormais `Engines/WebGPU/Extensions/index.js` en entier — treize greffes
  minuscules, plutôt qu'une liste à la carte qui se venge trois milestones
  plus tard sur un chemin rare.
- Babylon 7 génère du **WGSL natif** pour StandardMaterial dès qu'il tourne
  sur WebGPU, et le gestionnaire de plugins REFUSE un plugin GLSL sur un
  matériau WGSL. Nos cinq plugins (vent, herbe, brume, déformation, nuages)
  seraient tombés d'un bloc — silencieusement, hors console. D'où
  `StandardMaterial.ForceGLSL` + `EffectWrapper.ForceGLSL` : le moteur
  transpile notre GLSL par glslang/twgsl, ce qui est l'architecture consignée
  au M2b et jamais branchée. Vérifié : 100 matériaux en GLSL, plugins attachés
  (Haze 89, Wind 6, Grass 6, Cloud 3, Deform 2), 361 sous-maillages prêts.
- `uniform vec4 splats[16]` ressort de la chaîne GLSL→SPIR-V→WGSL en
  `@stride(16) array<…>`, attribut RETIRÉ de la spécification : Tint refuse le
  module entier. Le piège déjà noté (« pas de tableau indexé dynamiquement »)
  était trop étroit — c'est la DÉCLARATION qui casse. Les trois boucles de
  `deform.js` sont désormais déroulées à la génération du source.
- WGSL impose que `textureSample` soit appelé en **flot de contrôle uniforme**.
  Deux shaders lisaient une texture sous un `if` dépendant du fragment
  (`deform.js`, `deformPlugin.js`). Les lectures sont hoistées et le masque
  appliqué après — équivalent au terme près, puisque le masque multipliait
  déjà chaque contribution. Au passage, les ThinTexture du buffer d'état
  passent en CLAMP : elles arrivaient en RÉPÉTITION, et les consommateurs
  lisent hors domaine en confiance parce qu'ils masquent le résultat.
- Perf : 0,3 fps pendant le warm-up WebGPU (compilation des pipelines, c'est
  précisément ce que l'écran de chargement couvre), puis parité avec WebGL une
  fois chaud. Les chiffres de PERF.md se mesurent fenêtre au premier plan —
  Chrome bride un onglet occulté à 30 fps, ce qui invalide toute mesure prise
  en pilotage automatique.
- WebGL et WebGPU rendent la MÊME image : au même cadrage, les deux séries de
  captures sont identiques à moins de 6 code values de moyenne absolue (l'écart
  restant est la phase du vent et du re-semis, pas le moteur). Le chemin `?gl`
  reste donc un outil de dev honnête.

## Le mode capture mesurait autre chose que l'écran

Découvert en prenant les premières captures sur la machine cible, et c'est le
correctif le plus lourd de conséquences de la session : **F9 ne rendait pas
l'image du jeu**.

`Tools.CreateScreenshotUsingRenderTarget` re-rend la scène dans une cible hors
écran via `camera.outputRenderTarget`, et ce chemin ne fait pas passer l'image
par la chaîne de post accrochée à la caméra. Les captures sortaient donc en
couleur brute : sans ACES, sans saturation, sans lift bleu, sans quantification
rétro. Mesuré au cadrage plein-jour, même frame :

| | écran | capture RTT |
|---|---|---|
| moyenne RVB | 80/104/67 | 159/165/165 |
| 1er centile | 30 | 139 |
| étendue (p01→p99) | 154 | 41 |
| saturation moyenne | 51 | 7 |

Une bouillie grise sans ombres, là où l'écran montre une forêt verte
contrastée. La conséquence dépasse le bug : **toutes les vérifications « par
capture » des passes précédentes ont jugé cette bouillie** — y compris les
critiques confiées à des agents qui ne voyaient QUE l'image rendue, dispositif
dont c'était précisément la raison d'être. Le critère du PORTAGE 3.2 (« 1er
percentile de la frame entre 3 et 8 code values ») était inatteignable par
construction : la capture partait à 139.

Le mode capture copie désormais le back buffer réel — tampon de rendu
redimensionné en 1440p, quelques frames pour que les passes de post se
recalent, puis recopie du canvas tel qu'il est présenté. Ce que la capture
montre est ce que le joueur voit. Sur les trois cadrages : saturation 46→55,
1er centile 22→30, étendue 131→193.

Les trois captures de référence de la machine cible sont dans
`screenshots/cible/` — ce sont les premières images honnêtes du projet, et
l'« avant » réel de la passe densité.

## Passe « d'après référence » (silhouettes et lumière)

## Passe « d'après référence » (silhouettes et lumière)

Cette passe-là n'est pas partie d'une idée mais de dix captures de la
référence, regardées une par une. Ce qu'elles ont appris :

- Un conifère n'est PAS un cône. C'est un fût NU sur ses deux premiers
  tiers — c'est ce vide qui fait la forêt-colonnade et qui laisse passer
  les rais — surmonté de branches INDIVIDUELLES qui rayonnent et
  retombent. La silhouette est ajourée : on voit à travers l'arbre. D'où
  des cartes de branche découpées dans l'alpha, deux croisées par branche
  (une carte plate seule disparaît vue par la tranche).
- Un houppier de feuillu n'est pas un volume non plus. Les icosaèdres
  pleins lisaient comme des cailloux verts facettés. Une coque de cartes
  de feuilles à bord déchiqueté, réparties en spirale de Fibonacci à
  rayons irréguliers, coûte le même budget et laisse passer la lumière.
- Ce qui fait le contre-jour n'est pas l'intensité du soleil, c'est le
  BASCULEMENT DE TEINTE : dans la référence, la moitié de l'image tournée
  vers le soleil est orangée et l'autre franchement bleue. La brume prend
  donc la couleur de la lumière qui la traverse, modulée par l'angle entre
  le regard et le soleil. Elle suit l'arc solaire toute seule.
- Corollaire découvert par ce contre-jour : le plancher de ciel diffus
  ajoutait `baseColor * ambiante`, or baseColor est la texture SEULE
  (blanche sans texture). Tout ce qui n'est pas texturé recevait du bleu
  de ciel PUR — les troncs viraient au mauve au lieu de rester des
  silhouettes. Il faut passer par vDiffuseColor.
- Le volume d'un nuage se CALCULE, il ne se peint pas : ré-échantillonner
  l'alpha de la carte décalée vers le soleil approxime l'épaisseur
  traversée. L'ombrage tourne alors avec la journée. Peint, il restait
  figé du même côté à toute heure.
- La fougère est une strate à part, large et basse, pas une touffe
  d'herbe de plus. Peinte avec la recette des brins fins, elle se
  confondait avec le tapis.
- Le sol du sous-bois est vert-terre, pas kaki : un kaki vire au sable en
  plein jour et fait des plaques nues entre les touffes.
