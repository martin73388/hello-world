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
M4). Le milestone 1 n'a pas encore de mesure — la scène est un plan.

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
