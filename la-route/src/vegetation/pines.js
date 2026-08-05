/**
 * Pins en thin instances : un maillage de feuillage + un de tronc, mêmes
 * matrices. Placement déterministe, la route et ses talus restent libres.
 * Vent hiérarchique + translucidité des aiguilles via WindPlugin (M2b).
 *
 * L'archétype vient des références Valheim (forêt de conifères) : ce n'est
 * PAS un cône, ni une pile de cônes. C'est
 *   1. un fût NU et haut — les deux premiers tiers de l'arbre sont du bois,
 *      c'est ce qui donne la forêt-colonnade et laisse passer les rais ;
 *   2. du feuillage seulement en couronne, fait de BRANCHES INDIVIDUELLES :
 *      des cartes plates rayonnant du tronc et qui retombent, découpées en
 *      aiguilles dans l'alpha.
 * La silhouette est donc irrégulière et AJOURÉE — on voit à travers l'arbre,
 * et c'est ce trou-là qui fait respirer le sous-bois.
 */
import '@babylonjs/core/Meshes/thinInstanceMesh.js';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { height, roadQuery, GARAGE } from '../terrain/road.js';
import { WindPlugin } from './wind.js';
import { addBentCard, cardAcc, accToMesh } from './bentCard.js';
import { Matrix as BMatrix } from '@babylonjs/core/Maths/math.vector.js';

/** une brindille : la tige, puis les aiguilles en chevrons de part et d'autre */
function twig(g, x0, y0, x1, y1, rnd, dark, light) {
  const dx = x1 - x0, dy = y1 - y0;
  const L = Math.hypot(dx, dy) || 1;
  const ux = dx / L, uy = dy / L;
  const px = -uy, py = ux;
  g.strokeStyle = dark; g.lineWidth = 1.3; g.lineCap = 'round';
  g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
  const n = Math.max(5, Math.round(L * 0.85));
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const bx = x0 + dx * t, by = y0 + dy * t;
    // l'aiguille raccourcit vers la pointe et s'incline vers l'avant
    const nl = (2.6 + rnd() * 2.8) * (1 - t * 0.4);
    const sg = i % 2 ? 1 : -1;
    const ax = ux * 0.5 + px * sg * 0.86, ay = uy * 0.5 + py * sg * 0.86;
    g.strokeStyle = t > 0.5 ? light : dark;
    g.lineWidth = 1;
    g.beginPath(); g.moveTo(bx, by); g.lineTo(bx + ax * nl, by + ay * nl); g.stroke();
  }
}

/**
 * Carte de branche : un rachis qui part du bord gauche (l'attache au tronc)
 * vers la droite (la pointe), garni de brindilles qui s'évasent au pied et se
 * resserrent en bout. Le reste est transparent — c'est le vide entre les
 * brindilles qui fait l'arbre ajouré.
 */
function branchTexture(scene, name, seed, dark, light) {
  // PAS de mipmaps : le moyennage de l'alpha rendrait les cartes pleines à
  // distance (des palettes vertes volantes), comme pour l'herbe.
  const W = 128, H = 64;
  const tex = new DynamicTexture(name, { width: W, height: H }, scene, false);
  const g = tex.getContext();
  g.clearRect(0, 0, W, H);
  let s = seed;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const mid = H / 2;
  const tipY = mid + (rnd() - 0.5) * 10;
  // deux générations de brindilles : la première tient la silhouette, la
  // seconde la remplit. Une seule passe donnait une branche squelettique —
  // vu de loin l'arbre disparaissait.
  for (let gen = 0; gen < 2; gen++) {
    const TW = gen ? 14 : 11;
    for (let i = 0; i < TW; i++) {
      const u = 0.04 + ((i + (gen ? 0.5 : 0)) / TW) * 0.9;
      const x0 = 3 + u * (W - 8);
      const y0 = mid + (tipY - mid) * u;
      const sg = i % 2 ? 1 : -1;
      const spread = (1 - u * 0.72) * H * 0.5;     // évasé au pied, fin en bout
      twig(g, x0, y0,
        x0 + (9 + rnd() * 14), y0 + sg * spread * (0.5 + rnd() * 0.5),
        rnd, dark, light);
    }
  }
  twig(g, 2, mid, W - 4, tipY, rnd, dark, light);  // le rachis
  tex.update();
  tex.hasAlpha = true;
  tex.updateSamplingMode(1);                        // nearest : grain 32 bits
  return tex;
}

/* Verticilles : hauteur, rayon, nombre de branches, angle de retombée.
 * Le plus large n'est pas en bas mais un cran au-dessus (un épicéa perd ses
 * branches basses), et la retombée s'accentue vers le sol. */
const WHORLS = [
  { y: 3.9, r: 1.70, n: 6, droop: 0.56 },
  { y: 4.8, r: 1.98, n: 6, droop: 0.50 },
  { y: 5.7, r: 1.92, n: 6, droop: 0.45 },
  { y: 6.6, r: 1.74, n: 5, droop: 0.40 },
  { y: 7.5, r: 1.52, n: 5, droop: 0.34 },
  { y: 8.4, r: 1.26, n: 4, droop: 0.28 },
  { y: 9.2, r: 1.00, n: 4, droop: 0.21 },
  { y: 9.9, r: 0.76, n: 4, droop: 0.15 },
  { y: 10.6, r: 0.54, n: 3, droop: 0.08 },
  { y: 11.2, r: 0.38, n: 3, droop: 0.02 },
];
const TRUNK_H = 11.6;      // le fût dépasse le dernier verticille : la flèche

export function plantPines(scene, shadows) {
  let ps = 3;
  const prnd = () => (ps = (ps * 16807) % 2147483647) / 2147483647;

  /* Chaque branche est maintenant une carte COURBÉE (bentCard) : elle part
   * du tronc à l'horizontale, RETOMBE le long de sa longueur (le droop est
   * dans la géométrie, plus seulement une rotation d'attache), et porte une
   * légère cuvette vers le ciel — c'est elle qui accroche le highlight en
   * bande quand le soleil rase. Toujours deux cartes par branche, roulées
   * de part et d'autre, pour tenir la vue par la tranche. */
  const acc = cardAcc();
  for (let w = 0; w < WHORLS.length; w++) {
    const L = WHORLS[w];
    const base = w * 1.399;                          // verticilles décalés
    for (let k = 0; k < L.n; k++) {
      const len = L.r * (1.2 + prnd() * 0.42);
      const wid = L.r * (0.5 + prnd() * 0.24);
      const a = base + (k / L.n) * Math.PI * 2 + (prnd() - 0.5) * 0.5;
      const droop = L.droop + (prnd() - 0.5) * 0.16;
      const y = L.y + (prnd() - 0.5) * 0.28;
      for (let f = 0; f < 2; f++) {
        const roll = (f ? 1 : -1) * (0.3 + prnd() * 0.16);
        // bentCard pousse vers +Z, À PLAT, normale +Y — pas de couchage à
        // faire. RotationZ roule autour de l'axe de la branche, RotationX
        // incline légèrement l'attache (le gros de la retombée est dans
        // bend), RotationY oriente : +Z part vers (cos a, -sin a).
        const m = BMatrix.RotationZ(roll)
          .multiply(BMatrix.RotationX(0.28 * droop))
          .multiply(BMatrix.RotationY(a + Math.PI / 2))
          .multiply(BMatrix.Translation(Math.cos(a) * 0.06, y, -Math.sin(a) * 0.06));
        addBentCard(acc, m, {
          len, hw: wid * 0.5,
          bend: 1.35 * droop + 0.18,                 // la retombée, DANS la carte
          sag: 0.05, twist: (prnd() - 0.5) * 0.24,
          cup: 0.3, relax: 0.55, roll: 0.1,
          ripple: 0.05, tilt: (prnd() - 0.5) * 0.12,
          asym: 0.05, nick: 0, phase: prnd() * 6.28,
          steps: 3, nu: 3, uvSwap: true,
        });
      }
    }
  }
  const foliage = accToMesh(scene, 'pineFoliage', acc);
  const fmat = new StandardMaterial('pineMat', scene);
  fmat.diffuseColor = new Color3(0.72, 0.8, 0.7);
  fmat.specularColor = new Color3(0.02, 0.03, 0.02);
  fmat.backFaceCulling = false;                      // la carte se voit des deux bords
  fmat.diffuseTexture = branchTexture(scene, 'pineBranchTex', 47, '#1b3011', '#48691f');
  fmat.useAlphaFromDiffuseTexture = true;
  // découpe franche : aucun tri de transparence sur 1 900 arbres
  fmat.needAlphaTesting = () => true;
  fmat.needAlphaBlending = () => false;
  // la cime est haute : le vent doit être DOUX ici, l'amplitude du plugin
  // croît en y² et un arbre de 12 m battrait la campagne
  new WindPlugin(fmat, { strength: 0.2, transl: 0.6 });
  foliage.material = fmat;

  // le fût : nu sur les deux premiers tiers, c'est lui qui fait la colonnade
  const trunk = MeshBuilder.CreateCylinder('pineTrunk', {
    diameterTop: 0.17, diameterBottom: 0.56, height: TRUNK_H, tessellation: 7,
  }, scene);
  trunk.position.y = TRUNK_H / 2;
  trunk.bakeCurrentTransformIntoVertices();
  const tmat = new StandardMaterial('trunkMat', scene);
  tmat.diffuseColor = new Color3(0.28, 0.19, 0.12);
  tmat.specularColor = new Color3(0.02, 0.02, 0.02);
  new WindPlugin(tmat, { strength: 0.05 });          // le bois plie à peine
  trunk.material = tmat;

  // placement
  let seed = 17;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const mats = [];
  const trunks = [];                                 // {x, z, r} pour les collisions
  const q = new Quaternion(), sc = new Vector3(), tr = new Vector3();
  for (let i = 0; i < 9000 && mats.length < 1900; i++) {
    const x = (rnd() - 0.5) * 330 - 8;
    const z = 40 - rnd() * 320;
    const rq = roadQuery(x, z);
    if (rq.dist < 8.0) continue;                     // la route respire — et les
    // couronnes (jusqu'à ~3 m de rayon) ne surplombent jamais la chaussée
    if (Math.abs(x - GARAGE.x) < GARAGE.hw + 5 && z > GARAGE.z0 - 8 && z < GARAGE.z1 + 5) continue;
    const s = 0.62 + rnd() * 0.55;                   // ~7 à 14 m : on lève la tête
    const y = height(x, z) - 0.08;
    // stand() (PORTAGE 1.3) : l'arbre se conforme UN PEU à la pente (15 %)
    // — un pin pousse vers le ciel, mais un pin de talus n'est pas
    // parfaitement vertical non plus
    const dhx = height(x + 0.5, z) - height(x - 0.5, z);
    const dhz = height(x, z + 0.5) - height(x, z - 0.5);
    const conform = 0.15;
    Quaternion.RotationYawPitchRollToRef(rnd() * Math.PI * 2,
      Math.atan(dhz) * conform + (rnd() - 0.5) * 0.05,
      -Math.atan(dhx) * conform + (rnd() - 0.5) * 0.05, q);
    // bulk() : échelle non uniforme par axe — deux voisins de même variante
    // n'ont plus le même rapport hauteur/largeur
    sc.set(s * (0.9 + rnd() * 0.2), s * (0.88 + rnd() * 0.34), s * (0.9 + rnd() * 0.2));
    tr.set(x, y, z);
    const m = Matrix.Compose(sc, q, tr);
    mats.push(m);
    trunks.push({ x, z, r: 0.26 * s + 0.1 });
  }
  const buf = new Float32Array(mats.length * 16);
  for (let i = 0; i < mats.length; i++) mats[i].copyToArray(buf, i * 16);
  foliage.thinInstanceSetBuffer('matrix', buf, 16, true);
  trunk.thinInstanceSetBuffer('matrix', buf, 16, true);
  // teinte par instance (PORTAGE 1.2) : valeur ±20 %, chroma presque neutre,
  // et ~1/9 des arbres vire au roux (sénescence) — c'est la fin du mur vert
  // uniforme. Le tronc partage le buffer : un arbre mourant chauffe entier.
  let cs = 977;
  const crnd = () => (cs = (cs * 16807) % 2147483647) / 2147483647;
  const bufC = new Float32Array(mats.length * 4);
  for (let i = 0; i < mats.length; i++) {
    const v = 0.74 + crnd() * 0.42;
    let r = v * (1 + (crnd() - 0.5) * 0.08), g = v, b = v * (1 + (crnd() - 0.5) * 0.08);
    const age = crnd();
    if (age > 0.89) {                                // le roux : aiguilles mortes
      const t2 = (age - 0.89) * 6;
      r = r * (1 - t2) + 1.0 * t2; g = g * (1 - t2) + 0.62 * t2; b = b * (1 - t2) + 0.3 * t2;
    }
    bufC[i * 4] = r; bufC[i * 4 + 1] = g; bufC[i * 4 + 2] = b; bufC[i * 4 + 3] = 1;
  }
  foliage.thinInstanceSetBuffer('color', bufC, 4, true);
  // le tronc a SON buffer, presque neutre : partager celui du feuillage
  // peignait des fûts carotte — l'écorce d'un arbre mourant brunit à
  // peine, ce sont les aiguilles qui roussissent
  const bufT = new Float32Array(mats.length * 4);
  for (let i = 0; i < mats.length; i++) {
    const v = 0.82 + (bufC[i * 4 + 1] - 0.74) * 0.35;  // suit la valeur du feuillage, amorti
    bufT[i * 4] = v; bufT[i * 4 + 1] = v; bufT[i * 4 + 2] = v * 0.98; bufT[i * 4 + 3] = 1;
  }
  trunk.thinInstanceSetBuffer('color', bufT, 4, true);
  foliage.receiveShadows = true;
  shadows.addShadowCaster(foliage);
  shadows.addShadowCaster(trunk);
  return { count: mats.length, trunks };
}
