# L'Atelier de Minuit

Un jeu construit pas à pas. **Prologue : le garage.**

Marcel, mécanicien de nuit, dans son grand atelier à minuit et quart —
avec **L'Hirondelle**, son camping-car. Retrouve **la clé de contact**
égarée, appuie sur **le bouton du mur** pour ouvrir la porte, monte à bord
**sans coupure** (la porte latérale est ouverte), prends le volant et
conduis dans la forêt de nuit, phares allumés.

## Direction artistique

**Rendu réaliste (PBR).** Lumières physiques, réflexions d'environnement,
peinture clearcoat sur le van, chromes, vitres transparentes, sol de béton
ciré, faisceaux de phares dans la nuit. Nuit bleue profonde contre
tungstène ambré.
1 unité = 1 mètre partout (atelier 16 × 14 m — on y fait demi-tour —, porte
de 4,6 × 3,6 m, personnage 1,78 m, camping-car de 6,8 m).

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
  accélération/friction, glissement le long des obstacles — et **contrôles
  tactiles** (stick virtuel, boutons E/courir) sur mobile.
- **Boucle de jeu** : la clé de contact à retrouver (ramassage animé en
  IK), bouton mural qui commande la porte sectionnelle, interrupteur
  (clair de lune), radio lo-fi générative.
- **L'Hirondelle, praticable façon Star Citizen** : coque creuse avec
  intérieur réel (lit double, kitchenette avec radio, placards, cabine),
  on monte à bord par la porte latérale sans écran de chargement, les
  collisions intérieures vivent dans le repère local du van — et au
  volant (E), on conduit vraiment : Z/S/Q/D, moteur audible, phares,
  sortie du garage vers la route forestière.
- **La terre garde la trace** : les roues marquent le sol dehors
  (traces persistantes) et soulèvent la poussière.

## Lancer

Ouvrir `index.html` dans un navigateur (ou servir le dossier avec
`python3 -m http.server`). Aucune dépendance réseau : `three.min.js`
(r147) est embarqué.

| Touche | Action |
| --- | --- |
| ZQSD / WASD / flèches | se déplacer |
| Shift | courir |
| E | interagir · prendre le volant / couper le moteur |
| Souris | caméra (clic pour capturer, Échap pour libérer) |
| Molette | zoom |
| M | couper le son |
