# LA ROUTE

Démo technique Babylon.js / WebGPU : un mécano, son van, une route en forêt.
On ouvre dans un garage sombre, la porte s'enroule sur la forêt, et on part.

## Lancer

```bash
cd la-route
npm install
npm run dev
```

Puis **http://localhost:5173** dans Chrome (pas `file://`, pas une adresse IP
du réseau — WebGPU est masqué hors contexte sécurisé). Si WebGPU manque,
l'écran de diagnostic nomme la cause exacte et propose un repli WebGL
(`?gl`) réservé au développement.

## Commandes

| | |
| --- | --- |
| ZQSD / WASD | marcher — **Maj** pour courir |
| clic dans la fenêtre | la souris pilote la caméra (Échap libère) |
| molette | zoom de la caméra épaule |
| **E** | ouvrir la porte du garage (au bouton) · entrer dans le van · prendre le volant · descendre |
| **1** | phares (ils s'allument seuls à la nuit et sous l'averse quand on conduit) |
| **2** | déclencher une averse |
| **3** | feu de camp (à pied, hors chaussée et hors garage) |
| **4** | avancer l'heure d'un quart de journée |
| **5** | klaxon — il vide la clairière |
| **F1** | overlay : frame-time, 1 % low, curseurs heure / saturation / brume / bloom, passes de post, patine rétro |

## Ce qui tourne là-dedans

- **Terrain** sculpté par une spline de route (déblai/remblai, chaussée
  bombée, talus), plus un ruisseau creusé qui la coupe à un gué.
- **Buffer d'état du terrain** (2048² RGBA16F qui suit le joueur) :
  enfoncement, masse déplacée, humidité, brûlure. Persistant et additif,
  avec guérison lente. Pieds, pneus, pluie et feu écrivent dedans ; le sol
  le lit pour déplacer ses sommets, recalculer ses normales, assombrir la
  terre compressée et faire briller les flaques.
- **Végétation** : 1900 pins et des bosquets de bouleaux en thin instances,
  vent hiérarchique et translucidité à contre-jour ; un tapis de cinq
  strates (herbe rase, hautes tiges, roseaux dans les creux, fleurs en
  colonies, fougères) qui **se couche dans les ornières** en lisant le
  buffer d'état, puis se relève à mesure que la terre guérit.
- **Le van** : suspension par roue, transfert de masse, glisse sur gravier,
  tôle ondulée, sillage de poussière, sapin désodorisant qui balance — et un
  **intérieur praticable** : on entre par la portière et on marche dedans
  pendant qu'il roule (physique en repère local du véhicule).
- **Le garage** : porte sectionnelle 8 panneaux, établi, mur d'outils,
  suspensions tungstène, exposition qui s'adapte quand le jour entre.
- **Le temps** : cycle jour/nuit complet en 10 minutes (arc solaire réel, la
  lune prend le relais, étoiles, lucioles) et météo à cinq états qui dérivent
  d'eux-mêmes — clair, voilé, couvert, averse, brume.
- **Le ciel** : cumulus en billboard qui dérivent, crêtes lointaines qui
  prennent la couleur de la brume, rais de lumière rasante entre les troncs.
- **La vie** : chevreuils qui broutent et détalent, vols d'oiseaux, nuées de
  moucherons, pollen dans la lumière, chauves-souris à la nuit.

## Étalonner l'image

Le développement se fait en WebGL logiciel, plus terne que la cible WebGPU.
Les quatre leviers de l'image sont donc des curseurs vivants dans **F1** :
**heure**, **saturation**, **brume**, **bloom** — plus une case *rétro* qui
bascule la patine PS1 (quantification + tramage) pour comparer d'un coup
d'œil. Les valeurs par défaut sont dans `src/retro.js`, `src/post.js` et la
ligne `hazeShared.d` de `src/main.js`.

`DECISIONS.md` consigne chaque écart au brief et sa raison, `PERF.md` le
budget de frame, `ASSETS.md` la provenance (tout est procédural).
