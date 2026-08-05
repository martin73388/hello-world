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

## À faire, dans l'ordre du plan

- **Tier 1 restant** : 1.1 airmass (weather.js — couleur/intensité de la
  directionnelle par extinction, retirer les teintes keyframées de la
  directionnelle SEULE) ; 1.2 teinte par instance + sénescence (~1/9) via un
  buffer thin-instance `color` ; 1.3 stand()/bulk() dans les boucles de
  placement ; 1.5 lobe de translucidité courbé par la normale + variance par
  instance + face abaxiale (wind.js/grass.js) — PRÉREQUIS avant tout grade ;
  1.6 semis à queue lourde (3 octaves de clump, probabilité continue).
- **Système 2 du brief — densité** : litière de feuilles mortes
  individuelles (petites cartes courbées très pliées, thin instances,
  concentrées sous les arbres et en lisière) ; étage moyen qui ferme les
  côtés (grandes feuilles en rosettes bentCard à 1,5–8 m du bord) ;
  surplomb au-dessus de la route (bouleaux de lisière à couronne penchée —
  les troncs restent hors chaussée, roadQuery fait foi).
- **Ensuite** : PORTAGE Tier 2/3 (bake GPU, transmittance de canopée,
  volumétrique, grade) — voir PORTAGE.md.

## Outillage

- Serveur : `cd la-route && npm run dev` (port 5173 ; s'il affiche 5174,
  ajuster les scripts de capture).
- Captures : `scratchpad/cj2.js`. Usage :
  `SCRATCH=$PWD SHOTS='[{"n":"x.png","t":0.42,"x":10,"z":-30,"yaw":1.2,"pitch":-0.5,"d":8}]' node cj2.js`
  (~6 min par image en SwiftShader ; lancer en fond). Les trois cadrages
  canoniques sont ceux de `src/ui/capture.js` (FRAMINGS) ; les « avant » de
  la passe sont dans `scratchpad/avant/`.
- Le jeu expose `window.__laroute` (state, weather.setTime/setWeather, …).
- Références Valheim : `scratchpad/ref/valheim-01..10.jpg` (jamais commis).

## Pièges connus (ne pas retomber dedans)

- Samplers de plugins : à déclarer dans `CUSTOM_VERTEX_DEFINITIONS`, jamais
  dans le bloc d'uniformes (sinon UBO → compilation cassée).
- Textures à découpe alpha : PAS de mipmaps, sinon blocs verts volants.
- `thinInstanceSetBuffer` une fois, `thinInstanceBufferUpdated` ensuite.
- Le vent des plugins croît en y² : tout archétype plus haut doit baisser
  son `strength` (les pins de 12 m sont à 0.2).
- bentCard pousse vers +Z, À PLAT, normale +Y — ne pas réappliquer le
  RotationX(π/2) de l'époque CreatePlane.
- Zéro allocation par frame ; LCG `(s*16807)%2147483647` partout.
