# Minuit moins douze 🕰️

Un jeu original où **le niveau est une horloge vivante** : les trois aiguilles
(heures, minutes, secondes) sont tes plateformes. Elles tournent chacune à leur
vitesse, et tu incarnes une étincelle qui court dessus et saute de l'une à l'autre.

**Le but :** allumer les douze chiffres romains du cadran avant que minuit ne sonne
(99 secondes).

## Comment jouer

Ouvre simplement `index.html` dans un navigateur — aucun serveur, aucune dépendance.

| Touche | Action |
|---|---|
| ← / → | Courir vers le centre / vers la pointe de l'aiguille |
| Espace ou ↑ | Sauter |
| ↓ | Se laisser tomber de l'aiguille |

Sur mobile : tiers gauche / droit de l'écran pour courir, milieu pour sauter.

## Les subtilités

- **L'effet fronde** : quand tu sautes, tu emportes la vitesse du point de
  l'aiguille où tu te trouves. Sauter depuis la pointe de l'aiguille des
  secondes (la orange, la rapide) te catapulte à travers le cadran.
- L'aiguille des **heures** est lente et sûre, celle des **minutes** est un
  bon compromis, celle des **secondes** est risquée mais puissante.
- Tomber du cadran coûte **6 secondes** sur l'horloge.
- Tous les 3 chiffres allumés, **le mécanisme s'emballe** : les aiguilles accélèrent.
- Ton record (secondes d'avance sur minuit) est sauvegardé.

## Technique

Un seul fichier HTML : canvas 2D, physique à pas fixe (240 Hz), sons entièrement
synthétisés au WebAudio (tic-tac, cloches, gong de minuit). Zéro dépendance.
