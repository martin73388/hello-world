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

**Solide** : la passe d'ombres pèse ~11 ms, soit près de la moitié de la
frame, pour un budget écrit à 1,8 ms. Deux cascades qui re-soumettent 209
casters de feuillage alpha-testé, c'est le poste numéro un — très loin devant
tout le reste. C'est reproductible et le signal est énorme.

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
