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
