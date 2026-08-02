# L'Atelier de Minuit

Un jeu construit pas à pas. **Prologue : le garage.**

Un personnage en vue 3ᵉ personne — Marcel, mécanicien de nuit — dans son
garage fermé, à minuit et quart. Pas encore de monde ouvert : ce chapitre
se concentre sur les fondations qui doivent être irréprochables avant tout
le reste : le personnage, ses animations, les contrôles et la caméra.

## Direction artistique

**Toon-shading à paliers + contours encrés.** Nuit bleue profonde, lumière
tungstène ambrée sous abat-jour émaillé, clair de lune par le bandeau vitré.
1 unité = 1 mètre partout (garage 7,2 × 5,6 m, plafond 2,9 m, personnage 1,78 m).

## Ce qui est soigné

- **Rig procédural** : squelette hiérarchique complet (bassin, colonne,
  tête, bras, jambes), jambes en **IK analytique 2 os** — les pieds se
  posent réellement au sol, sans glissade (la fréquence de foulée est
  asservie à la vitesse).
- **Cycle de marche et de course** générés par phase : appui/oscillation,
  déroulé talon-pointe, phase de vol en course, contre-rotation du buste,
  balancier des bras, inclinaison dans les virages et à l'accélération.
- **Vie au repos** : respiration, transferts d'appui, regards curieux,
  clignements des yeux.
- **Caméra 3ᵉ personne** : orbite à la souris (pointer lock), zoom molette,
  amortissements distincts, collision caméra (murs + obstacles) sans
  jamais traverser le décor, avance sur le déplacement, FOV qui s'élargit
  en courant.
- **Contrôles** : ZQSD **et** WASD (codes physiques → AZERTY géré
  nativement), flèches, Shift pour courir, déplacement relatif à la caméra,
  accélération/friction, glissement le long des obstacles.

## Lancer

Ouvrir `index.html` dans un navigateur (ou servir le dossier avec
`python3 -m http.server`). Aucune dépendance réseau : `three.min.js`
(r147) est embarqué.

| Touche | Action |
| --- | --- |
| ZQSD / WASD / flèches | se déplacer |
| Shift | courir |
| Souris | caméra (clic pour capturer, Échap pour libérer) |
| Molette | zoom |
| M | couper le son |
