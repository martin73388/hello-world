# Éolia — terres du vent 🍃

Un jeu d'**exploration 3D en monde ouvert** : une grande île procédurale aux
graphismes stylisés low-poly — prairies vallonnées, forêts, plages, un pic
enneigé, un océan, des îles flottantes à l'horizon — baignée de brume et d'un
cycle jour/nuit.

**Le but :** parcourir l'île pour éveiller les **sept sanctuaires**, signalés
au loin par leurs piliers de lumière cyan. Une fois éveillés, ils passent à l'or.

## Jouer

Ouvre `index.html` dans un navigateur — aucun serveur nécessaire, tout est local.

| Commande | Action |
|---|---|
| ZQSD / WASD / flèches | Se déplacer |
| Maj | Courir |
| Espace | Sauter |
| Espace en l'air | Ouvrir / fermer le **paravoile** |
| Glisser la souris | Orienter la caméra |
| Molette | Zoom |

## Ce qu'il faut savoir

- Le **paravoile** est la clé de l'exploration : grimpe sur une hauteur, saute,
  et plane à travers l'île. Depuis le pic enneigé, on survole tout le monde.
- La **boussole** en haut de l'écran montre les points cardinaux et la direction
  de chaque sanctuaire (cyan = à éveiller, or = éveillé).
- On peut nager, mais on avance lentement — et le vent te ramène si tu t'éloignes
  trop d'Éolia.
- Le monde vit : cycle jour/nuit (5 min), étoiles, nuages dérivants, vent audible
  qui force quand tu planes.

## Technique

- `three.min.js` — Three.js r147 embarqué (aucun accès réseau requis)
- `game.js` — tout le jeu : terrain procédural déterministe (bruit fractal +
  masque d'île), couleurs par sommet, ombres dynamiques, végétation instanciée,
  ciel en shader avec soleil et étoiles, personnage animé, physique (course,
  saut, vol plané, nage), audio synthétisé au WebAudio (vent, nappe, carillons)
- `index.html` — la page et le HUD

Les fonctions de terrain sont pures et testables sous Node :
`node -e "console.log(require('./game.js').findPeak())"`
