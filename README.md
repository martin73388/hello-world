# Éolia — terres du vent 🍃
### Un voyage au long cours

Un jeu d'**exploration 3D en monde ouvert à l'échelle réelle** : 1 unité = 1 mètre,
1 seconde réelle = 1 minute de jeu. Une île de **22 km²**, un pic à **1104 m**
dont l'ascension à pied demande une **journée de jeu entière** (~25 minutes
réelles), comme en vrai — avec la nuit qui tombe en route et la fatigue qui
s'accumule.

Tu y vis dans un **vieux camping-car vide**, que tu conduis et que tu aménages
au fil de tes trouvailles.

## Jouer

Ouvre `index.html` dans un navigateur — aucun serveur nécessaire, tout est local.

| Commande | Action |
|---|---|
| ZQSD / WASD / flèches | Marcher (7 km/h) — Maj : courir |
| Espace | Sauter · en l'air : **paravoile** |
| E | Ramasser / prendre le volant / descendre |
| F | Entrer dans l'habitacle du van |
| T | Manger (repas, sinon baies) |
| Souris / molette | Caméra / zoom |

## La boucle de jeu

**Explorer → récolter → aménager le van → partir plus loin.**

- **Le camping-car** se conduit (~80 km/h max, pentes raides infranchissables,
  l'océan l'arrête). Il consomme du carburant : récupère des **jerricans**
  près des épaves, repérables à leur colonne de fumée.
- **Les ressources** : du **bois** (branches en forêt), des **baies**
  (buissons), de la **ferraille** (épaves), des **cristaux** (offerts par les
  sanctuaires éveillés).
- **L'habitacle** (vue maison de poupée) s'aménage pièce par pièce :
  vrai lit → kitchenette → étagères → plante & tapis → guirlande → radio
  (musique générative !) → panneau solaire (−30 % de carburant).
  Chaque meuble apparaît physiquement dans le van. Confort affiché en %.
- **L'énergie** : marcher fatigue, grimper épuise, la nuit coûte plus cher.
  Cueille des baies, cuisine des repas pour les expéditions, et dors dans le
  van (sans lit, la nuit sur le siège récupère mal…).
- **Les sept sanctuaires** aux piliers de lumière cyan restent le fil rouge :
  chacun offre un cristal, nécessaire aux aménagements avancés.

## Les dimensions, en vrai

| Trajet | Durée |
|---|---|
| Ascension du pic à pied | ~25 h de jeu (≈ 25 min réelles) |
| Traversée de l'île en van | ~6 h de jeu (≈ 6 min réelles) |
| Une journée complète | 24 min réelles |

## Technique

- `three.min.js` — Three.js r147 embarqué (jouable hors ligne)
- `game.js` — terrain procédural déterministe (bruit fractal + masque d'île),
  couleurs par sommet, ombres dynamiques, végétation instanciée, ciel en
  shader, cycle jour/nuit, personnage et van animés, trois modes de jeu
  (marche / conduite / habitacle), audio 100 % WebAudio (vent réactif, moteur,
  radio générative, carillons)
- `index.html` — page et HUD (horloge, énergie, carburant, inventaire,
  boussole, panneau d'aménagement)

Les fonctions de terrain sont pures et testables sous Node :
`node -e "console.log(require('./game.js').findPeak())"`
