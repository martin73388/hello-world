# PERF — budget de frame (cible 90 fps = 11,1 ms)

| Système        | Budget | Mesuré |
| -------------- | ------ | ------ |
| Terrain        | 2,0 ms | —      |
| Végétation     | 2,2 ms | —      |
| Ombres         | 1,8 ms | —      |
| Déformation    | 0,8 ms | —      |
| Véhicule       | 0,8 ms | —      |
| VFX            | 1,2 ms | —      |
| Post           | 1,6 ms | —      |
| Marge          | 0,7 ms | —      |

Mesures à faire sur la machine cible à chaque milestone (machine réelle du
joueur : MacBook M4, WebGPU/Metal — le brief visait une RTX, on juge sur le
M4). La colonne « Mesuré » se remplit avec l'overlay F1 sur cette machine ;
le SwiftShader de CI ne mesure rien d'utile.

## Première mesure réelle sur la cible (MacBook Air M4, WebGPU)

Prise au cadrage plein-jour, dehors, **en 1470 × 671** — soit un quart des
pixels de la cible 1440p. Boucle de rendu arrêtée, `scene.render()` appelé en
rafale et chronométré, médiane sur 24 frames.

| Configuration | Coût par frame |
| --- | --- |
| Tout | **23 – 30 ms** |
| Sans la passe d'ombres (renderList vidée) | **12 ms** |

Deux choses à en tirer, et une seule est solide.

**~~Solide~~ — RETIRÉ, voir la contre-mesure ci-dessous.** On lisait ici que la
passe d'ombres pesait ~11 ms sur 23. Ce chiffre n'a pas été reproduit et ne
doit pas servir de base de travail.

**Pas solide** : l'attribution poste par poste. Masquer le tapis, les pins ou
la litière sort des mesures non monotones (le retour au cas de base dérive de
24 à 34 ms), donc la mesure dérive plus vite que l'effet cherché. Ces chiffres
ne sont pas publiés ici parce qu'ils ne veulent rien dire. Il faut une vraie
session de profilage, fenêtre au premier plan, avec l'overlay F1.

**Conséquence sur le plan.** À 23-30 ms au quart de la résolution cible, on est
déjà 2 à 3 fois au-dessus du budget de 11,1 ms. Le PORTAGE 2.5 (bucketing en
tuiles + LOD) était classé « prérequis de la densité » sur un raisonnement ;
c'est maintenant une mesure. **Toute hausse de densité (1.6, litière de 2.1)
passe après 2.5**, sans quoi on triple le coût de soumission d'une frame déjà
trois fois trop chère.

Piège de mesure consigné : un onglet Chrome occulté suspend `requestAnimation-
Frame` (zéro frame, et `getFps()` continue de renvoyer la dernière valeur —
elle ment). Toute mesure passant par la boucle de rendu doit vérifier
`document.visibilityState === 'visible'`, ou chronométrer `scene.render()`
directement comme ci-dessus.

## LA MESURE QUI FAIT FOI (méthode validée par un témoin)

Les deux sections qui suivent racontent deux mesures successives, toutes deux
fausses, et pour la même raison. Elles sont conservées parce que l'erreur est
instructive — mais **ce sont les chiffres ci-dessous qui font foi**.

**La méthode.** `scene.render()` seul ne referme pas le cycle : `beginFrame` et
`endFrame` encadrent l'acquisition et la présentation du swap chain, et c'est là
que se posent les jalons GPU. Pire, sous WebGPU la soumission rend la main
avant que le GPU ait travaillé — chronométrer la soumission ne mesure donc
presque rien. On force la synchronisation en relisant UN pixel après
`endFrame` : le temps mural devient alors le temps GPU.

**Le témoin qui valide la méthode** : la relecture seule, sans rien rendre,
coûte **0,3 ms**. Elle ne pollue donc pas la mesure — c'était la première chose
à vérifier, et c'est ce qui manquait aux deux tentatives précédentes.

Au cadrage plein-jour, en 1087 × 780, médiane sur 14 frames :

| Configuration | Coût | Écart |
| --- | --- | --- |
| Scène complète | **25,3 ms** | — |
| Sans les aiguilles de pin dans les casters | 19,0 ms | **−6,3 ms** |
| Sans aucun caster d'ombre | 18,7 ms | −6,6 ms |
| MSAA 4× → 1× | 21,5 ms | **−3,8 ms** |
| Frame vide (tous maillages cachés), chaîne de post comprise | 7,6 ms | — |

**Ce que ça dit.** La passe d'ombres coûte 6,6 ms, et `pineFoliage` en porte 6,3
à lui seul — 95 %. Le premier chiffre de ce document (« ~11 ms ») était donc
dans le bon ordre de grandeur ; ma rétractation l'était moins. La chaîne de post
et le coût fixe de frame pèsent 7,6 ms, dont 3,8 pour le seul MSAA 4×.

**Les deux leviers, mesurés :** sortir le feuillage de pin des casters rend
6,3 ms sur 25,3 — un quart de la frame. Passer MSAA à 1× en rend 3,8. Mais
sortir le feuillage des ombres SANS rien mettre à la place éclaire le sol
uniformément : c'est exactement le « c'est plat » qu'on cherche à guérir. Ce
gain-là finance le dapple analytique du PORTAGE 2.4, il ne s'encaisse pas seul.

## CONTRE-MESURE (fausse, conservée pour la leçon) : `scene.render()` ne mesure pas ce qu'on croit

Reprise le lendemain, au cadrage plein-jour, boucle arrêtée, médiane sur 30
frames — les chiffres ne ressemblent pas aux précédents :

| Configuration | Coût |
| --- | --- |
| Tout | **2,8 ms** |
| Sans les aiguilles de pin dans les casters | 2,9 ms |
| Sans aucun feuillage d'arbre dans les casters | 2,6 ms |
| Sans aucune ombre du tout | 0,9 ms |

Deux enseignements, et une leçon de méthode.

**Le premier est ~~solide~~ FAUX, et c'est la leçon** : on lisait ici que
retirer `pineFoliage` des casters ne changeait rien (2,8 → 2,9 ms). Mesuré
correctement, ça rend **6,3 ms sur 25,3**. L'erreur venait de la méthode, pas
du raisonnement : sans `beginFrame`/`endFrame` et sans synchronisation GPU, on
chronométrait une soumission qui rend la main avant que le GPU travaille. Une
comparaison relative faite dans la même session ne vaut rien si les deux termes
mesurent la mauvaise chose.

**Le second est que je ne sais pas mesurer cette scène.** `scene.render()`
chronomètre la SOUMISSION côté CPU ; sous WebGPU le GPU travaille après, et la
file d'attente rend la mesure élastique. 2,3 ms de CPU par frame pour un rendu
observé aux alentours de 30 fps signifie que le goulot est le GPU — et le
compteur `getGPUFrameTimeCounter()` reste vide, Babylon n'ayant pas ouvert la
fonctionnalité timestamp-query à la création du device.

Tant qu'on n'a pas d'instrument GPU, **aucun chiffre absolu de ce document ne
doit servir à arbitrer**. Les comparaisons RELATIVES prises dans la même
session gardent leur valeur — c'est ce qui rend la mesure sur les aiguilles
utilisable. Prochaine étape pour sortir de l'aveugle : demander
`timestamp-query` au device, ou faire varier la résolution de rendu et observer
si le temps suit (s'il suit, on est bien limité par le remplissage).

Coûts M6/M7 à surveiller :
- particules : pluie 1400 + flammes/braises/fumée ~370 + lucioles 70 +
  poussière 480 — toutes CPU, ~2 300 quads max simultanés ;
- 6 lumières max/matériau ; les lumières d'interaction sont désactivées
  éteintes ; pire cas simultané rare à 8 lumières actives ;
- chaîne de post : FXAA + MSAA 4 + bloom + grain + sharpen + ACES + vignette,
  chaque passe toggleable dans F1 pour l'A/B de coût ;
- warm-up : ~10 frames sous l'écran de chargement compilent particules,
  phares, feu, vue garage — « no hitch on first use ».

Coûts M4 à surveiller :
- van : ~45 petits maillages (draw calls) — à fusionner par matériau si ça
  pèse ; 4 sondages de sol par frame (grille roadQuery O(1), négligeable) ;
- collisions : hachage spatial rempli une fois au chargement, requête O(1).

Coûts M3 à surveiller (overlay F1 sur le M4) :
- passe de déformation : 2048² RGBA16F, 5 taps + 16 splats max par frame ;
- patch : 131 k triangles supplémentaires, texelFetch au vertex ;
- recentrage du patch : ~66 k `height()` CPU en phase 1 + ComputeNormals en
  phase 2 (étalé sur 2 frames, tous les ~6 m de marche) — si un à-coup se
  sent, découper la phase 1 en bandes.

## Systèmes ajoutés par la passe Valheim

| Système | Coût à surveiller |
| --- | --- |
| Tapis d'herbe | ~23 000 instances sur 5 maillages, re-semées en 2 phases tous les 7 m ; alpha-test (pas de tri), pas de mipmaps |
| Pins | 1 900 instances × 78 cartes de branche = ~150 k quads alpha-testés. Le poste tient parce que les cartes sont minuscules au-delà de 40 m ; s'il faut couper, retirer un verticille sur deux au-dessus de 8 m dans `WHORLS` |
| Bouleaux et repères | thin instances, construits une fois puis figés ; houppier = 31 cartes alpha-testées par arbre sur 420 arbres |
| Nuages | 26 cartes en billboard, matrices recomposées chaque frame ; +3 taps de texture par fragment pour l'ombrage volumétrique — coût de fill, pas de draw |
| Crêtes | 3 cylindres texturés, aucune mise à jour de géométrie |
| Rais de lumière | 16 quads additifs, inactifs hors lumière rasante — coût nul à midi et la nuit |
| Gué | nappe + écume + rides (3 passes transparentes), 260 galets et 46 nénuphars en thin instances |
| Faune | 2 chevreuils, 14 oiseaux, 5 chauves-souris en pools ; 4 systèmes de particules |
| Brume étagée | un plugin fragment sur tous les matériaux du décor — 3 taps de plus, pas de passe |
| Patine rétro | une passe plein écran de plus (quantification + tramage), débrayable |
| Litière | 12 600 feuilles mortes en 3 maillages thin-instancés (~302 k tris), pas de shadow caster, aucun coût par frame |
| Étage moyen | 420 rosettes + 300 arbustes (~162 k tris), 2 draw calls + 2 passes d'ombre, vent par plugin |
| bentCard | +4 à +40 tris par carte selon l'archétype — payé en mémoire vertex, pas en draw calls |

Le poste le plus lourd est le tapis d'herbe. Si le budget se tend sur la
machine cible, les leviers dans l'ordre : nombre d'instances (`plantGrass`
accepte `{grass, tall, reeds, flowers, ferns, bushes}`), rayon du tapis
(`R`), puis résolution du buffer de déformation.
