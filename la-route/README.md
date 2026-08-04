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
| **E** | ouvrir la porte (au bouton) · monter et descendre du van |
| **1** | phares |
| **2** | averse |
| **3** | feu de camp (à pied, hors chaussée) |
| **4** | heure dorée → crépuscule |
| **5** | klaxon |
| **F1** | overlay : frame-time, 1 % low, réglages soleil/brume, passes de post |

## Ce qui tourne là-dedans

- **Terrain** sculpté par une spline de route (déblai/remblai, chaussée
  bombée, talus), forêt de 1900 pins en thin instances avec vent
  hiérarchique et translucidité des aiguilles à contre-jour.
- **Buffer d'état du terrain** (2048² RGBA16F qui suit le joueur) :
  enfoncement, masse déplacée, humidité, brûlure. Persistant et additif,
  avec guérison lente. Pieds, pneus, pluie et feu écrivent dedans ; le sol
  le lit pour déplacer ses sommets, recalculer ses normales, assombrir la
  terre compressée et faire briller les flaques.
- **Le van** : suspension par roue, transfert de masse, glisse sur gravier,
  tôle ondulée, sillage de poussière, sapin désodorisant qui balance.
- **Le garage** : porte sectionnelle 8 panneaux, établi, mur d'outils,
  suspensions tungstène, exposition qui s'adapte quand le jour entre.

`DECISIONS.md` consigne chaque écart au brief et sa raison, `PERF.md` le
budget de frame, `ASSETS.md` la provenance (tout est procédural).
