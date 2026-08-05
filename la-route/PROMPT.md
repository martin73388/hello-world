# Le brief — passe « densité »

Ce document est le brief de la passe en cours. Il est écrit d'après
`jungle-trail` (une marche en jungle photoréaliste en Three.js, zéro asset
externe, tout procédural), dont deux captures servent de référence de
densité et de lumière. Il n'est PAS une demande de faire une jungle :
LA ROUTE reste une forêt tempérée, et sa direction artistique reste
assumément 32 bits. Ce qu'on va chercher chez la référence, c'est la
DENSITÉ, la PROFONDEUR et la LUMIÈRE — pas le photoréalisme.

## Le brief

> Amène l'environnement de LA ROUTE au niveau de densité et de lumière de
> la référence. Sur ses captures, aucun mètre carré n'est vide : le sol est
> couvert de feuilles mortes individuelles, le sous-bois est plein jusqu'à
> hauteur de hanche, l'étage moyen ferme les côtés, et la canopée surplombe
> le cadre par le haut. La lumière traverse tout ça en rais larges et pose
> des taches de soleil mouvantes sur le sentier. Chez nous, on voit encore
> le sol nu entre les touffes, le cadre n'est fermé ni par le haut ni par
> les côtés, et les rais sont rares.
>
> Contraintes qui ne changent pas : tout est procédural, aucun asset
> externe, LCG déterministe, zéro allocation par frame, et la cible reste
> 90 fps sur un MacBook M4 en WebGPU.
>
> Ordre imposé, un système à la fois :
>
> 1. La primitive de feuille — passer de la carte plate à la carte courbée
> 2. La densité — le sol, le sous-bois, l'étage moyen, le surplomb
> 3. Les textures — bake GPU avec normales dérivées, au lieu du canvas 2D
> 4. La lumière — transmittance de canopée analytique, rais volumétriques
> 5. L'étalonnage — séparation des canaux dans les verts
>
> Pour chaque système : construire, puis capturer, puis faire critiquer par
> un agent qui ne voit QUE l'image rendue, jamais le code, et qui n'est
> jamais celui qui a construit. Itérer tant que le critique n'a pas signé.

## Ce que la référence a appris avant même qu'on code

Le README de `jungle-trail` documente ses propres impasses. Trois valent
d'être reprises telles quelles :

- **La canopée n'a pas à être dans la shadow map.** Cent mille cartes de
  feuilles dans un depth buffer se résolvent mal et coûtent cher. Un terme
  de transmittance analytique est à la fois moins cher et mieux tenu.
- **Le tone mapping arrive en DERNIER, et une seule fois.** Tout ce qui
  ajoute ou déplace de la lumière — brume en in-scattering, éblouissement,
  flou de mise au point, obturateur — est de la radiance et doit se faire
  en HDR linéaire, avant la courbe.
- **Un étalonnage ne fabrique pas de la séparation de canaux que le rendu
  ne lui a pas donnée.** Leur problème ouvert, celui qu'ils nomment « la
  plus grosse chose qui reste dans le projet », c'est que tout au-delà de
  huit mètres lit comme un mur kaki plat : le vert ne devance le rouge que
  de 1,7 valeurs de code dans la canopée ensoleillée, là où des images
  réelles auraient plusieurs fois ça. Ils concluent qu'il faut attaquer
  dans les matériaux de végétation et de lumière AVANT le grade.

Sur ce dernier point, LA ROUTE part avec une avance : la translucidité à
contre-jour existe déjà et elle fonctionne. C'est justement ce qui manque
à la référence pour porter la profondeur par le silhouettage plutôt que
par le brouillard.

## Le goal de la passe

> Une capture de LA ROUTE prise à hauteur d'œil sur la route, en plein
> jour, ne montre plus de sol nu entre les touffes ; le cadre est fermé par
> un surplomb de feuillage en haut et par de la végétation d'étage moyen
> sur les côtés ; le sol porte des feuilles mortes individuelles ; des
> taches de soleil dessinent la route ; et trois plans restent distincts —
> vérifié sur mes propres captures, avant/après, aux mêmes cadrages que le
> mode F9.

Ce goal est vérifiable ici, sur le rendu logiciel : il ne porte que sur la
densité, l'occupation du cadre et le silhouettage — pas sur la couleur ni
sur le bloom, qui demandent la machine cible.
