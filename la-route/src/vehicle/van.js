/**
 * Le van (M4) — le hero asset. Face avant plate (esprit Estafette), deux tons
 * patinés, lettrage GARAGE MODERNE à l'arrière, chrome, vitres avec intérieur
 * visible, sapin désodorisant à ressort, galerie + jerrican, bavettes, feux.
 * Suspension par roue : le sol est sondé aux 4 coins, la caisse suit en
 * ressort-amortisseur avec roulis/tangage et transfert de masse ; les roues
 * braquent et tournent au rayon correct (jamais de glissement visuel).
 * Repère local : +z avant, +x droite (main gauche Babylon).
 */
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { SpotLight } from '@babylonjs/core/Lights/spotLight.js';

const WHEEL_R = 0.37, TRACK = 0.85, WHEELBASE = 3.2, CLEAR = 0.42;

/**
 * Les cotes de la BAIE latérale, exportées : la carrosserie perce le trou,
 * l'aménagement y fait coulisser la portière. Deux jeux de constantes auraient
 * fini par diverger d'un centimètre, et un centimètre ici c'est soit un jour
 * dans la tôle, soit une porte qui ne ferme plus.
 */
export const BAY_Z0 = -0.95, BAY_Z1 = 0.35;

/**
 * La LIGNE DE CEINTURE du véhicule, unique. Elle existait déjà en quatre
 * exemplaires — linteau de baie, haut de vitre de portière, custode de
 * cellule — mais les vitres de cabine étaient à côté de la plaque. Sur le
 * flanc gauche, la vitre de portière et celle du conducteur sont à 1,70 m
 * l'une de l'autre : un centimètre de décalage entre elles se voit.
 */
export const BELT_Y0 = 1.86, BELT_Y1 = 2.30;
/** Baie de vitre de CABINE. Elle démarre à 1,25 et non au ras de la baie
 *  coulissante (0,35) pour que le montant du portique reste derrière 90 cm de
 *  tôle pleine : un montant intérieur qu'on voit du dehors à travers sa propre
 *  fenêtre fait décor, pas véhicule. */
export const CABW_Z0 = 1.25, CABW_Z1 = 2.34;
/** Custode de CELLULE : les cotes étaient écrites dans vanInterior alors que
 *  c'est ici qu'on perce la tôle. Même leçon que BAY_Z0. */
export const CUST_Z0 = -0.90, CUST_Z1 = 0.10;
/** Lunette arrière : le doublage de fond a TOUJOURS eu son trou alors que la
 *  tôle derrière était pleine. */
export const LUN_X = 0.65, LUN_Y0 = 1.92, LUN_Y1 = 2.32;
/**
 * La tôle est percée DIX MILLIMÈTRES plus large que le doublage. Sans ce jeu,
 * l'appui de tôle et l'appui de doublage sont coplanaires, de MÊME normale, et
 * se recouvrent sur 10 mm : une bande de pixels qui clignote sur tout le tour
 * de chaque fenêtre. En perçant la tôle plus large, c'est le doublage qu'on
 * voit dans l'embrasure — ce qui est aussi ce qu'on veut lire.
 */
export const SKIN_M = 0.01;
/** Un seul verre pour tout le véhicule : van.js et vanInterior en avaient deux,
 *  à 0,38 et 0,34, et depuis la refonte ils se retrouvent côte à côte sur le
 *  même flanc. */
export const GLASS_A = 0.26;

function paintTexture(scene) {
  const tex = new DynamicTexture('vanPaint', 512, scene, true);
  const g = tex.getContext();
  let seed = 41;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  // Tôle peinte NEUTRE, sans bande de couleur : la livrée deux tons se fait par
  // la teinte du matériau, pas par la texture. Peinte ici, elle se répétait sur
  // chaque caisson — CreateBox plaque l'image entière sur chaque face, si bien
  // qu'en remontant le flanc on lisait rouge, crème, rouge, crème, et que les
  // faces avant et arrière l'étiraient autrement que les flancs. Le van avait
  // l'air d'être deux véhicules superposés.
  g.fillStyle = '#efe9dd'; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 260; i++) {                               // usure, poussière
    const y = rnd() * 512;
    g.fillStyle = 'rgba(96,88,74,.20)';
    g.fillRect(rnd() * 512, y, 2 + rnd() * 9, 1 + rnd() * 3);
  }
  for (const x of [96, 236, 380]) {                             // joints de panneaux
    g.fillStyle = 'rgba(30,18,12,.55)'; g.fillRect(x, 0, 2, 512);
  }
  for (let i = 0; i < 26; i++) {                                // rouille au bas de caisse
    const x = rnd() * 512, y = 440 + rnd() * 66;
    g.fillStyle = 'rgba(74,34,16,.5)';
    g.beginPath(); g.arc(x, y, 2 + rnd() * 6, 0, 7); g.fill();
  }
  tex.update();
  return tex;
}

function rearTexture(scene) {
  const tex = new DynamicTexture('vanRear', { width: 512, height: 256 }, scene, true);
  const g = tex.getContext();
  g.clearRect(0, 0, 512, 256);
  g.font = '700 64px Georgia, serif'; g.textAlign = 'center';
  g.fillStyle = 'rgba(30,16,10,.55)';                           // ombre portée peinte
  g.fillText('GARAGE', 259, 108);
  g.fillText('MODERNE', 259, 188);
  g.fillStyle = 'rgba(238,228,200,.92)';                        // crème signalétique
  g.fillText('GARAGE', 256, 105);
  g.fillText('MODERNE', 256, 185);
  tex.update();
  tex.hasAlpha = true;
  return tex;
}

/**
 * Le combiné, en DEUX toiles jumelles. Une seule, montée en emissiveTexture,
 * ferait luire le fond du cadran autant que les chiffres et le combiné
 * deviendrait une plaque grise : la seconde est un POCHOIR — fond noir pur,
 * seuls les traits sont peints, donc hors des traits rien n'émet. C'est
 * exactement ce que fait un cadran rétro-éclairé.
 *
 * Pourquoi aucune lumière : le pire cas du projet est déjà mesuré à huit
 * lumières actives pour un plafond de six. Une PointLight de tableau de bord
 * n'AJOUTERAIT pas de la lumière, elle en évincerait — et ce sont les phares
 * qui sauteraient.
 *
 * 512 × 192 px pour 0,40 × 0,14 m, soit 0,78 mm par pixel : le lettrage à 20 px
 * fait 15 mm, lu à 65 cm. Sous 12 px la passe rétro (quantification + tramage)
 * transforme les chiffres en bouillie — c'est la borne basse.
 */
function comboTexture(scene, glow) {
  const tex = new DynamicTexture(glow ? 'vComboG' : 'vCombo',
    { width: 512, height: 192 }, scene, true);
  const g = tex.getContext();
  let s = 6151;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  g.fillStyle = glow ? '#000000' : '#1a1c1f'; g.fillRect(0, 0, 512, 192);
  if (!glow) {                                        // grain de bakélite
    for (let i = 0; i < 300; i++) {
      g.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,.045)' : 'rgba(0,0,0,.24)';
      g.fillRect(rnd() * 512, rnd() * 192, 1 + rnd() * 2, 1 + rnd() * 2);
    }
  }
  g.strokeStyle = glow ? '#7fe0b4' : '#cfc7b2'; g.lineWidth = 2;
  const dial = (cx, cy, r, n) => {
    g.beginPath(); g.arc(cx, cy, r, 0, 7); g.stroke();
    for (let i = 0; i <= n; i++) {
      const a = 2.618 + (i / n) * 4.189;              // 240° de balayage
      const l = i % 2 ? r * 0.1 : r * 0.2;
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      g.lineTo(cx + Math.cos(a) * (r - l), cy + Math.sin(a) * (r - l));
      g.stroke();
    }
  };
  dial(150, 96, 74, 12); dial(346, 60, 34, 6); dial(346, 132, 34, 6);
  g.fillStyle = glow ? '#7fe0b4' : '#e6ddc6';
  g.font = '700 20px Georgia, serif'; g.textAlign = 'center';
  for (let i = 0; i <= 4; i++) {                      // 0 à 60, plein cadran
    const a = 2.618 + (i / 4) * 4.189;
    g.fillText(String(i * 15), 150 + Math.cos(a) * 50, 96 + Math.sin(a) * 50 + 7);
  }
  g.font = '700 13px system-ui'; g.fillStyle = glow ? '#e8a33c' : '#b9ae95';
  g.fillText('km/h', 150, 156); g.fillText('TEMP', 346, 22); g.fillText('ESS', 346, 176);
  if (!glow) {                                        // le reflet est PEINT
    g.strokeStyle = 'rgba(255,255,255,.12)'; g.lineWidth = 9;
    g.beginPath(); g.moveTo(40, 190); g.lineTo(190, 2); g.stroke();
  }
  tex.update();
  return tex;
}

export function buildVan(scene, shadows, ground) {
  const root = new TransformNode('vanRoot', scene);
  const body = new TransformNode('vanBody', scene);
  body.parent = root;

  /* ---- matériaux ---- */
  // Une seule tôle, deux teintes : la livrée d'un camping-car se lit en bandes
  // horizontales franches, et c'est la TEINTE du matériau qui les porte. La
  // texture reste neutre et partagée, donc le grain et les joints de panneaux
  // sont continus d'un caisson à l'autre.
  const paintTex = paintTexture(scene);
  const mkPaint = (name, r, g, b) => {
    const m = new StandardMaterial(name, scene);
    m.diffuseTexture = paintTex;
    m.diffuseColor = new Color3(r, g, b);
    m.specularColor = new Color3(0.32, 0.3, 0.26);              // vernis fatigué
    m.specularPower = 42;
    return m;
  };
  const paintLo = mkPaint('vanPaintLo', 0.54, 0.27, 0.19);      // rouge brique
  const paintHi = mkPaint('vanPaintHi', 0.85, 0.81, 0.71);      // crème patinée
  const chrome = new StandardMaterial('vanChrome', scene);
  chrome.diffuseColor = new Color3(0.38, 0.4, 0.44);
  chrome.specularColor = new Color3(0.95, 0.95, 0.98);
  chrome.specularPower = 96;
  const dark = new StandardMaterial('vanDark', scene);
  dark.diffuseColor = new Color3(0.09, 0.09, 0.1);
  dark.specularColor = new Color3(0.05, 0.05, 0.05);
  const glass = new StandardMaterial('vanGlass', scene);
  glass.diffuseColor = new Color3(0.3, 0.42, 0.46);
  glass.specularColor = new Color3(1, 1, 1);
  glass.specularPower = 128;
  /* À 0,38 la teinte propre de la vitre pesait 38 % sur une scène déjà sombre
   * le soir, et le pare-brise se lisait comme une dalle — supportable tant
   * qu'il n'y avait rien derrière. À 0,26 il en passe 74 %, le point où la
   * cabine reste lisible du dehors sans que la vitre cesse d'être une vitre.
   * L'émissif n'est pas une lueur : c'est le PLANCHER de reflet de ciel,
   * invisible de jour, mais il empêche le verre de tomber à zéro quand aucune
   * lumière ne l'atteint. backFaceCulling reste VRAI : chaque vitre est une
   * BOÎTE, elle présente toujours une face — le désactiver mélangerait ses deux
   * faces et Babylon ne trie pas les faces à l'intérieur d'un maillage. */
  glass.alpha = GLASS_A;
  glass.emissiveColor = new Color3(0.03, 0.04, 0.05);
  const inn = new StandardMaterial('vanInn', scene);
  inn.diffuseColor = new Color3(0.3, 0.24, 0.18);
  inn.specularColor = new Color3(0.03, 0.03, 0.03);
  const lampOn = new StandardMaterial('vanLamp', scene);
  lampOn.emissiveColor = new Color3(0.9, 0.82, 0.55);
  lampOn.diffuseColor = new Color3(0.4, 0.36, 0.2);
  const tail = new StandardMaterial('vanTail', scene);
  tail.emissiveColor = new Color3(0.45, 0.06, 0.04);
  tail.diffuseColor = new Color3(0.3, 0.05, 0.04);

  const meshes = [];
  const box = (name, w, h, d, x, y, z, mat) => {
    const m = MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, scene);
    m.position.set(x, y, z); m.material = mat; m.parent = body; meshes.push(m);
    return m;
  };

  /* ---- caisse ---- */
  // La caisse est faite de trois caissons empilés, et la peinture est une
  // livrée DEUX TONS : crème en haut, jonc chromé, rouge brique en bas. Or
  // CreateBox plaque la texture entière sur CHAQUE face — chaque caisson
  // recevait donc son propre exemplaire de la livrée. En remontant le flanc on
  // lisait rouge, crème, rouge, crème : la ligne de séparation apparaissait
  // deux fois, aux mauvais endroits, et les faces avant et arrière l'étiraient
  // autrement que les flancs. Le van avait l'air d'être deux véhicules
  // superposés.
  //
  // La livrée vient donc de la TEINTE des matériaux (paintLo / paintHi), pas de
  // la texture, qui ne porte plus que la tôle. Le grain et les joints de
  // panneaux restent continus d'un caisson à l'autre puisqu'elle est partagée,
  // et le jonc chromé matérialise la ligne de séparation à la bonne hauteur.
  const vLower = box('vLower', 2.0, 1.02, 5.2, 0, 1.04, 0, paintLo);
  const vUpper = box('vUpper', 1.96, 0.95, 5.2, 0, 2.02, 0, paintHi);
  /* Le pavillon passe de 1,84 × 5,02 à 1,98 × 5,18. Ce n'est pas esthétique :
   * les panneaux de flanc sont arasés à 2,485 et aboutés à ±2,580, et sans
   * débord il resterait une rainure de dix millimètres sur toute la longueur.
   * À ±0,990 il coiffe tout — une gouttière, ce qu'un fourgon a. INTERDIT de le
   * porter à 1,96 : ses flancs tomberaient PILE sur ceux de vUpper. */
  box('vRoof', 1.98, 0.1, 5.18, 0, 2.54, 0, paintHi);

  /**
   * Les caissons de caisse sont des boîtes PLEINES, et la cellule habitable les
   * traverse : elle va de 0,52 à 2,37, quand vLower occupe 0,53→1,55 et vUpper
   * 1,545→2,495. Vues de l'intérieur, la plupart de leurs faces sont éliminées
   * au dos — mais pas toutes. Debout dans le van, l'œil est à 2,1 m, donc
   * AU-DESSUS du dessus de vLower : cette face-là est vue de face et barre le
   * salon d'un plancher fantôme à hauteur de hanche. Symétriquement, le dessous
   * de vUpper pose un faux plafond au même endroit. Le joueur les a vus tout de
   * suite : « il y a un sol en trop dans le van, il coupe la zone en 2 ».
   *
   * On retire donc ces deux faces. Elles ne manquent nulle part ailleurs : le
   * dessus de vLower est couvert par vUpper, le dessous de vUpper par vLower, et
   * le jonc chromé habille la jonction vue du dehors.
   *
   * On sélectionne par la NORMALE plutôt que par un indice de face : l'ordre des
   * faces d'un CreateBox est une convention interne, et parier sur une
   * convention a déjà coûté cher sur ce véhicule.
   */
  const dropFace = (m, nx, ny, nz) => {
    const nrm = m.getVerticesData('normal');
    const idx = m.getIndices();
    const keep = [];
    for (let i = 0; i < idx.length; i += 3) {
      const a = idx[i] * 3;
      if (nrm[a] * nx + nrm[a + 1] * ny + nrm[a + 2] * nz < 0.9) {
        keep.push(idx[i], idx[i + 1], idx[i + 2]);
      }
    }
    m.setIndices(keep);
  };
  dropFace(vLower, 0, 1, 0);            // le plancher fantôme à 1,55
  dropFace(vUpper, 0, -1, 0);           // le plafond fantôme au même plan

  /* ---- LA BAIE : une vraie ouverture dans le flanc gauche ----
   * La portière coulissait déjà, mais derrière elle il n'y avait RIEN à
   * traverser : la caisse est une boîte pleine, et on ouvrait la porte sur de
   * la tôle. Il faut donc percer le flanc.
   *
   * On retire la face -x des deux caissons, puis on remonte le flanc autour du
   * trou. Les deux caissons n'ayant pas la même largeur (1,00 en bas, 0,98 en
   * haut), chaque panneau est posé au plan de SON caisson : le décrochement
   * reste celui de la carrosserie d'origine.
   *
   * La baie va du plancher (0,53) au linteau (2,30), soit 1,77 m de haut sur
   * 1,30 m de large — les cotes de la portière, qui la couvre exactement quand
   * elle est fermée. */
  const BZ0 = BAY_Z0, BZ1 = BAY_Z1, BTOP = 2.30, LT = 0.02;
  dropFace(vLower, -1, 0, 0);
  dropFace(vUpper, -1, 0, 0);
  /* Les cinq vitres du van étaient des autocollants : collées sur des faces de
   * caisson jamais percées. Le doublage, lui, est évidé depuis toujours autour
   * de la ceinture — on regardait par un trou du contreplaqué pour tomber sur
   * la tôle. La baie coulissante est la seule ouverture réelle du véhicule ; on
   * applique aux trois autres faces la recette qu'elle a écrite. */
  dropFace(vUpper, 1, 0, 0);            // flanc droit : deux vitres aveugles
  dropFace(vUpper, 0, 0, 1);            // le nez
  dropFace(vUpper, 0, 0, -1);           // la lunette
  // bas de caisse, de part et d'autre de la baie
  box('vFlkLoR', LT, 1.02, BZ0 + 2.6, -1.0 + LT / 2, 1.04, (-2.6 + BZ0) / 2, paintLo);
  box('vFlkLoF', LT, 1.02, 2.6 - BZ1, -1.0 + LT / 2, 1.04, (BZ1 + 2.6) / 2, paintLo);
  // haut de caisse, idem, plus le linteau au-dessus de l'ouverture
  /* Les panneaux hauts butaient sur ±2,600 et 2,495 — les plans d'about et de
   * dessus des caissons — avec la MÊME normale : trois bagarres de pixels le
   * long des arêtes, déjà présentes, et percer le flanc droit les aurait
   * dupliquées. Les faces avant et arrière de vUpper étant déposées, on peut
   * roder de 20 mm : les panneaux de nez et de cul referment le coin, et le
   * pavillon élargi coiffe l'arase. On ne touche PAS aux panneaux bas : leur
   * face avant est coplanaire avec celle de vLower, qui existe toujours, et les
   * rogner ouvrirait un tunnel puisque la face -x de vLower, elle, est déposée. */
  const HZ = 2.58, HTOP = 2.485;                          // about et arase
  const SY0 = BELT_Y0 - SKIN_M, SY1 = BELT_Y1 + SKIN_M;   // 1,850 / 2,310
  const SZ0 = CABW_Z0 - SKIN_M, SZ1 = CABW_Z1 + SKIN_M;   // 1,240 / 2,350
  const HX = -0.98 + LT / 2, RX = 0.98 - LT / 2;          // ∓0,970
  const SBH = SY0 - 1.545, STH = HTOP - SY1, SWH = SY1 - SY0;
  const SBY = (1.545 + SY0) / 2, STY = (SY1 + HTOP) / 2, SWY = (SY0 + SY1) / 2;
  // flanc gauche arrière + linteau de baie
  box('vFlkHiR', LT, HTOP - 1.545, HZ + BZ0, HX, (1.545 + HTOP) / 2, (-HZ + BZ0) / 2, paintHi);
  box('vFlkHiT', LT, HTOP - BTOP, BZ1 - BZ0, HX, (BTOP + HTOP) / 2, (BZ0 + BZ1) / 2, paintHi);
  // flanc gauche avant : recoupé en quatre pour ouvrir la vitre du conducteur
  box('vFlkHiFb', LT, SBH, HZ - BZ1, HX, SBY, (BZ1 + HZ) / 2, paintHi);
  box('vFlkHiFh', LT, STH, HZ - BZ1, HX, STY, (BZ1 + HZ) / 2, paintHi);
  box('vFlkHiFr', LT, SWH, SZ0 - BZ1, HX, SWY, (BZ1 + SZ0) / 2, paintHi);
  box('vFlkHiFa', LT, SWH, HZ - SZ1, HX, SWY, (SZ1 + HZ) / 2, paintHi);
  // flanc droit : deux trous d'un coup, la custode de cellule et la vitre de
  // cabine. Derrière la custode, le doublage a SON trou depuis toujours — il
  // donnait sur de la tôle.
  box('vFlkRb', LT, SBH, HZ * 2, RX, SBY, 0, paintHi);
  box('vFlkRh', LT, STH, HZ * 2, RX, STY, 0, paintHi);
  box('vFlkRr', LT, SWH, (CUST_Z0 - SKIN_M) + HZ, RX, SWY, (-HZ + CUST_Z0 - SKIN_M) / 2, paintHi);
  box('vFlkRm', LT, SWH, SZ0 - (CUST_Z1 + SKIN_M), RX, SWY, (CUST_Z1 + SKIN_M + SZ0) / 2, paintHi);
  box('vFlkRa', LT, SWH, HZ - SZ1, RX, SWY, (SZ1 + HZ) / 2, paintHi);
  /* Le nez et le cul. Les panneaux démarrent à 1,545 comme vUpper, ce qui remet
   * cinq millimètres de tôle sur le plan 2,600 déjà occupé par la face avant de
   * vLower, même normale. On l'assume : le jonc vTrimF couvre exactement cette
   * couture. Démarrer plus haut aurait supprimé la coplanarité mais ouvert un
   * trou d'épingle au coin, que rien ne bouche. */
  const NZ = 2.59, CZ2 = -2.59, WSX = 0.85;
  box('vNezB', 1.96, SY0 - 1.545, LT, 0, (1.545 + SY0) / 2, NZ, paintHi);
  box('vNezH', 1.96, 2.495 - SY1, LT, 0, (SY1 + 2.495) / 2, NZ, paintHi);
  box('vNezG', 0.98 - WSX, SWH, LT, -(0.98 + WSX) / 2, SWY, NZ, paintHi);
  box('vNezD', 0.98 - WSX, SWH, LT, (0.98 + WSX) / 2, SWY, NZ, paintHi);
  const LX = LUN_X + SKIN_M, LY0 = LUN_Y0 - SKIN_M, LY1 = LUN_Y1 + SKIN_M;
  box('vCulB', 1.96, LY0 - 1.545, LT, 0, (1.545 + LY0) / 2, CZ2, paintHi);
  box('vCulH', 1.96, 2.495 - LY1, LT, 0, (LY1 + 2.495) / 2, CZ2, paintHi);
  box('vCulG', 0.98 - LX, LY1 - LY0, LT, -(0.98 + LX) / 2, (LY0 + LY1) / 2, CZ2, paintHi);
  box('vCulD', 0.98 - LX, LY1 - LY0, LT, (0.98 + LX) / 2, (LY0 + LY1) / 2, CZ2, paintHi);
  // montants et seuil : la baie a un encadrement, sinon la tranche de la tôle
  // se lit comme une découpe au cutter
  box('vBaieMr', 0.05, BTOP - 0.53, 0.05, -1.01, (0.53 + BTOP) / 2, BZ0 + 0.025, chrome);
  box('vBaieMf', 0.05, BTOP - 0.53, 0.05, -1.01, (0.53 + BTOP) / 2, BZ1 - 0.025, chrome);
  box('vBaieSeuil', 0.06, 0.05, BZ1 - BZ0, -1.01, 0.555, (BZ0 + BZ1) / 2, chrome);
  /* ---- jonc chromé à la jonction des deux teintes ----
   * Il n'est pas décoratif : les deux caissons ont la même profondeur et le
   * même centre en z, donc leurs faces avant et arrière sont rigoureusement
   * coplanaires et se disputent le pixel. Le jonc couvre la couture.
   *
   * Mais un jonc est une BAGUETTE POSÉE SUR LA PEAU, pas une dalle. En le
   * faisant d'une seule boîte de 2,04 × 5,24, je l'avais fait traverser tout
   * l'habitacle à hauteur de poitrine : de l'intérieur, et à travers la baie
   * ouverte, une barre chromée barrait la pièce. On le pose donc en quatre
   * segments, un par face, chacun juste en saillie de SON plan — et celui du
   * flanc gauche s'interrompt à la baie, sinon il traverserait l'ouverture.
   */
  const TY = 1.55, TH2 = 0.07;
  // flanc gauche, de part et d'autre de la baie
  box('vTrimLR', 0.04, TH2, BZ0 + 2.6, -1.01, TY, (-2.6 + BZ0) / 2, chrome);
  box('vTrimLF', 0.04, TH2, 2.6 - BZ1, -1.01, TY, (BZ1 + 2.6) / 2, chrome);
  // flanc droit, d'un seul tenant
  box('vTrimR', 0.04, TH2, 5.2, 1.01, TY, 0, chrome);
  // faces avant et arrière : c'est là que la couture des deux caissons est nue
  box('vTrimF', 2.02, TH2, 0.04, 0, TY, 2.615, chrome);
  box('vTrimB', 2.02, TH2, 0.04, 0, TY, -2.615, chrome);
  box('vBumpF', 2.06, 0.17, 0.14, 0, 0.62, 2.66, chrome);
  box('vBumpR', 2.06, 0.17, 0.14, 0, 0.62, -2.66, chrome);
  /* LE PARE-BRISE. Il était posé sur la tôle pleine, incliné autour de son
   * centre : bord bas quatre à cinq centimètres EN SAILLIE de la peau, bord
   * haut ENTERRÉ derrière elle, le plan du vitrage croisant la tôle à 2,270. Du
   * dehors on n'en voyait que la moitié basse, en relief sur de la peinture.
   * Il vit maintenant dans l'embrasure du pare-feu : ses quatre arêtes sont
   * enterrées dans le doublage, aucune tranche visible, et une surface tournée
   * de 0,1 rad ne peut plus être coplanaire avec quoi que ce soit d'aligné. */
  const ws = box('vWs', 1.74, 0.50, 0.014, 0, 2.08, 2.545, glass);
  ws.rotation.x = -0.1;
  // Les vitres latérales gardent leur plan d'origine, deux millimètres en
  // saillie de la peau : c'est le montage de la maison. Elles recouvrent
  // l'ouverture de tôle de 20 mm sur les quatre côtés — sans ce recouvrement un
  // rasant de quinze degrés découvre la tranche et le ciel passe par la fente.
  const GY = (BELT_Y0 + BELT_Y1) / 2, GH = SY1 - SY0 + 0.04;
  box('vWinL', 0.02, GH, SZ1 - SZ0 + 0.04, -0.992, GY, (SZ0 + SZ1) / 2, glass);
  box('vWinR', 0.02, GH, SZ1 - SZ0 + 0.04, 0.992, GY, (SZ0 + SZ1) / 2, glass);
  // Pas de custode à gauche : l'emplacement est occupé par la BAIE
  // COULISSANTE. La vitre qui s'y trouvait appartenait à la caisse et non à la
  // portière — donc elle ne coulissait pas avec elle : portière fermée elle
  // doublait la vitre de portière (deux plans alpha à 13 mm, le flanc gauche
  // sortait plus sombre que le droit), et portière ouverte elle restait
  // suspendue en travers de l'ouverture, un mètre de verre en plein passage.
  // La portière a sa propre vitre, viPorteVitre.
  box('vWinR2', 0.02, GH, CUST_Z1 - CUST_Z0 + 0.06, 0.992, GY, (CUST_Z0 + CUST_Z1) / 2, glass);
  box('vWinB', LX * 2 + 0.04, LY1 - LY0 + 0.04, 0.018, 0, (LY0 + LY1) / 2, -2.61, glass);
  /* L'encadrement chromé du pare-brise, même geste que l'encadrement de la
   * baie : sans lui, la tranche d'une tôle de 20 mm se lit comme un coup de
   * cutter. Traverses sur toute la longueur et montants qui les CHEVAUCHENT :
   * deux baguettes de même section qui s'aboutent à l'angle partagent leurs
   * faces sur un carré de 30 mm, même normale — quatre coins de bagarre par
   * fenêtre. En les faisant s'interpénétrer, plus aucune face commune. */
  box('vWsRailB', 1.76, 0.03, 0.03, 0, SY0, 2.605, chrome);
  box('vWsRailH', 1.76, 0.03, 0.03, 0, SY1, 2.605, chrome);
  box('vWsMtG', 0.03, SY1 - SY0 + 0.04, 0.03, -WSX, SWY, 2.605, chrome);
  box('vWsMtD', 0.03, SY1 - SY0 + 0.04, 0.03, WSX, SWY, 2.605, chrome);
  // lettrage arrière
  // face avant d'un plan Babylon = -z : à l'arrière, elle regarde déjà dehors
  const rp = MeshBuilder.CreatePlane('vSign', { width: 1.5, height: 0.75 }, scene);
  rp.position.set(0, 1.45, -2.625);
  const rm = new StandardMaterial('vSignM', scene);
  rm.diffuseTexture = rearTexture(scene);
  rm.diffuseTexture.hasAlpha = true; rm.useAlphaFromDiffuseTexture = true;
  rm.specularColor = new Color3(0, 0, 0);
  rp.material = rm; rp.parent = body; meshes.push(rp);
  // phares, feux, rétros, bavettes
  box('vHlL', 0.26, 0.26, 0.06, -0.62, 1.42, 2.62, lampOn);
  box('vHlR', 0.26, 0.26, 0.06, 0.62, 1.42, 2.62, lampOn);
  box('vTlL', 0.14, 0.3, 0.05, -0.85, 1.5, -2.62, tail);
  box('vTlR', 0.14, 0.3, 0.05, 0.85, 1.5, -2.62, tail);
  box('vMirL', 0.05, 0.2, 0.14, -1.1, 2.06, 2.35, chrome);
  box('vMirR', 0.05, 0.2, 0.14, 1.1, 2.06, 2.35, chrome);
  box('vFlapFL', 0.26, 0.3, 0.03, -TRACK, 0.42, WHEELBASE / 2 - 0.48, dark);
  box('vFlapFR', 0.26, 0.3, 0.03, TRACK, 0.42, WHEELBASE / 2 - 0.48, dark);
  box('vFlapRL', 0.26, 0.3, 0.03, -TRACK, 0.42, -WHEELBASE / 2 - 0.48, dark);
  box('vFlapRR', 0.26, 0.3, 0.03, TRACK, 0.42, -WHEELBASE / 2 - 0.48, dark);
  // galerie + jerrican sanglé
  for (const [x, z] of [[-0.75, 1.9], [0.75, 1.9], [-0.75, -1.9], [0.75, -1.9]]) {
    box('vRl' + x + z, 0.06, 0.12, 0.06, x, 2.64, z, dark);
  }
  box('vRailL', 0.06, 0.06, 4.0, -0.75, 2.72, 0, chrome);
  box('vRailR', 0.06, 0.06, 4.0, 0.75, 2.72, 0, chrome);
  box('vCross1', 1.56, 0.05, 0.06, 0, 2.72, 1.1, chrome);
  box('vCross2', 1.56, 0.05, 0.06, 0, 2.72, -1.1, chrome);
  // jerrican COUCHÉ sur la galerie : debout, son sommet (3,63 m au sol)
  // ne passait pas l'ouverture de la porte du garage (3,5 m)
  const jc = box('vJerry', 0.42, 0.2, 0.46, 0.3, 2.85, -1.1, new StandardMaterial('vJerryM', scene));
  jc.material.diffuseColor = new Color3(0.18, 0.26, 0.16);
  jc.material.specularColor = new Color3(0.08, 0.08, 0.08);
  box('vStrap', 0.44, 0.03, 0.5, 0.3, 2.96, -1.1, dark);
  /* ---- intérieur visible ---- */
  /* Le tablier était une dalle unique de 1,8 × 0,15 × 0,5 qui flottait — rien
   * dessous, rien derrière — et qui allait jusqu'à z 2,53, c'est-à-dire au
   * milieu du pare-feu qu'on vient de poser. Un tableau de bord de fourgon,
   * c'est deux pièces : une PLANCHE horizontale sur laquelle traîne ce qu'on y
   * pose, une JOUE verticale qui porte les commandes. Les deux s'enterrent de
   * 40 mm dans le pare-feu : jamais de face coplanaire avec 2,420. La planche
   * s'arrête à 2,25 et non 2,03 parce que le bas de jante du volant descend à
   * 1,6045 en z 2,216 — à 2,03 la dalle le traversait. */
  box('vDashPlan', 1.88, 0.06, 0.21, 0, 1.66, 2.355, dark);
  box('vDashJoue', 1.88, 0.34, 0.06, 0, 1.48, 2.43, dark);
  box('vSeatL', 0.55, 0.14, 0.55, -0.52, 1.32, 1.7, inn);
  box('vSeatLb', 0.55, 0.6, 0.13, -0.52, 1.66, 1.44, inn);
  box('vSeatR', 0.55, 0.14, 0.55, 0.52, 1.32, 1.7, inn);
  box('vSeatRb', 0.55, 0.6, 0.13, 0.52, 1.66, 1.44, inn);
  /* L'assise est à 1,250 pour un plancher de cabine à 0,520 : les sièges
   * planaient à 73 cm. Personne ne pouvait le voir tant que la cabine n'avait
   * pas de sol. On ne PEUT pas les descendre — la baie de pare-brise commence à
   * 1,860 et l'œil du conducteur tombe à 2,120 : il regarde par le milieu du
   * pare-brise. Un poste avancé s'assoit haut, sur une embase. */
  box('vSeatSocL', 0.60, 0.75, 0.60, -0.52, 0.88, 1.70, dark);
  box('vSeatSocR', 0.60, 0.75, 0.60, 0.52, 0.88, 1.70, dark);
  /* Le capot moteur. Sa cote n'est pas choisie, elle est LUE sur le mécano :
   * cuisse à -1,35 rad puis tibia à 0 posent la semelle à 0,853. Le dessus du
   * capot est donc à 0,850, trois millimètres sous ses talons. C'est aussi la
   * raison pour laquelle il n'y avait pas de pédales : à 33 cm au-dessus du
   * plancher, elles n'auraient rien eu à toucher. */
  box('vCapot', 1.88, 0.35, 0.56, 0, 0.675, 2.18, dark);
  const pedals = [];
  for (const [nm, px, pw] of [['E', -0.68, 0.08], ['F', -0.52, 0.08], ['A', -0.36, 0.06]]) {
    const piv = new TransformNode('vPed' + nm, scene);
    piv.parent = body; piv.position.set(px, 0.85, 2.13); piv.rotation.x = -0.40;
    const p = MeshBuilder.CreateBox('vPed' + nm + 'M',
      { width: pw, height: 0.13, depth: 0.018 }, scene);
    p.position.y = 0.065; p.material = dark; p.parent = piv; meshes.push(p);
    pedals.push(piv);
  }
  // vBed et vKitch ont été RETIRÉS : c'étaient les silhouettes que van.js
  // posait à l'époque où la cellule n'était qu'un décor vu par les vitres.
  // Depuis que vanInterior.js meuble pour de vrai, elles traversaient le
  // mobilier — le témoin de couchette dépassait de 23 cm au-dessus du matelas,
  // celui de kitchenette de 42 cm au-dessus du plan de travail, à travers
  // l'évier, l'étagère et les tranches des livres. Tout ça dans l'axe de la
  // baie coulissante, donc vu en permanence. La cabine, elle, garde ses
  // sièges et son tablier : vanInterior ne modélise rien en avant de la
  // cloison.
  /* C'était un tore nu : pas de moyeu, pas de branches, et surtout il ne
   * tournait pas quand on braquait. Un volant fixe pendant qu'on prend un
   * virage est le seul défaut qu'un joueur voit en une seconde. Deux nœuds
   * emboîtés : vVolPiv porte l'inclinaison de colonne — inchangée, elle est
   * calée sur la pose des mains du mécano — et vVolTurn ne reçoit QUE
   * rotation.y. Rapport 9,0 pour un braquage borné à ±0,52 rad : une tour et
   * demie de butée à butée, ce qui se lit franchement sans ressembler à une
   * borne d'arcade. Trois branches et pas quatre : c'est la marque de l'époque. */
  const volPiv = new TransformNode('vVolPiv', scene);
  volPiv.parent = body;
  volPiv.position.set(-0.52, 1.78, 2.12);
  volPiv.rotation.x = Math.PI / 2 - 0.5;
  const volTurn = new TransformNode('vVolTurn', scene);
  volTurn.parent = volPiv;
  const rim = MeshBuilder.CreateTorus('vWheelT', { diameter: 0.4, thickness: 0.045, tessellation: 18 }, scene);
  rim.material = dark; rim.parent = volTurn; meshes.push(rim);
  const hubM = MeshBuilder.CreateCylinder('vWheelH', { diameter: 0.1, height: 0.05, tessellation: 12 }, scene);
  hubM.position.y = -0.02; hubM.material = dark; hubM.parent = volTurn; meshes.push(hubM);
  for (let i = 0; i < 3; i++) {
    const a = i * 2.0944 + 1.5708;
    const sp = box('vWheelS' + i, 0.2, 0.012, 0.026,
      Math.cos(a) * 0.1, 0, Math.sin(a) * 0.1, dark);
    sp.parent = volTurn; sp.rotation.y = -a;
  }

  /* Le combiné, calé sur la ligne de vue. Œil du conducteur assis à y 2,120,
   * cadran à 1,760 en z 2,280 : le rayon passe 31 mm SOUS le sommet de jante,
   * donc on lit les cadrans PAR l'ouverture du volant. C'est ce cadrage-là, et
   * lui seul, qui donne envie d'aller s'asseoir. Le boîtier est enterré de
   * 10 mm dans la planche et son sommet reste sous la ligne de ceinture : vu du
   * dehors il ne mange pas le pare-brise. */
  const combM = new StandardMaterial('vComboM', scene);
  combM.diffuseTexture = comboTexture(scene, false);
  combM.emissiveTexture = comboTexture(scene, true);
  combM.specularColor = new Color3(0.1, 0.1, 0.12);
  combM.emissiveColor = new Color3(0, 0, 0);
  box('vCombBoit', 0.42, 0.16, 0.10, -0.52, 1.76, 2.33, dark);
  const comb = MeshBuilder.CreatePlane('vCombFace', { width: 0.4, height: 0.14 }, scene);
  comb.position.set(-0.52, 1.76, 2.2785);             // face avant d'un plan = -z
  comb.material = combM; comb.parent = body; meshes.push(comb);
  /* Trois aiguilles, trois affectations de rotation.z par frame. Le compteur est
   * calé sur la borne RÉELLE de la vitesse (12,5 m/s) et le cadran gradué
   * jusqu'à 60 : l'aiguille tape les trois quarts quand le van tape sa butée,
   * ce qui est la vérité du véhicule. La température monte par un passe-bas —
   * une vingtaine de secondes de route pour arriver à mi-cadran — et c'est le
   * seul cadran qui bouge quand on ne fait rien. */
  const aigM = new StandardMaterial('vAigM', scene);
  aigM.diffuseColor = new Color3(0.78, 0.16, 0.12);
  aigM.emissiveColor = new Color3(0, 0, 0);
  const needle = (nm, len, cx, cy) => {
    const piv = new TransformNode(nm, scene);
    piv.parent = body; piv.position.set(-0.52 + cx, 1.76 + cy, 2.276);
    const n = MeshBuilder.CreateBox(nm + 'M',
      { width: 0.004, height: len, depth: 0.003 }, scene);
    n.position.y = len / 2; n.material = aigM; n.parent = piv; meshes.push(n);
    return piv;
  };
  const aigVit = needle('vAigVit', 0.056, -0.0328, 0);
  const aigTmp = needle('vAigTmp', 0.026, 0.1031, 0.0263);
  const aigEss = needle('vAigEss', 0.026, 0.1031, -0.0263);
  let tempE = 0, accP = 0, frP = 0;
  /* ---- phares : vraies SpotLights + cônes de brume (interaction 1) ---- */
  const beams = [];
  const coneMat = new StandardMaterial('vBeamM', scene);
  coneMat.emissiveColor = new Color3(0.9, 0.8, 0.55);
  coneMat.diffuseColor = new Color3(0, 0, 0);
  coneMat.alpha = 0;
  coneMat.backFaceCulling = false;
  coneMat.disableLighting = true;
  coneMat.alphaMode = 1;                              // additif : le faisceau s'ajoute
  for (const lx of [-0.62, 0.62]) {
    const spot = new SpotLight('vSpot' + lx, new Vector3(lx, 1.42, 2.7),
      new Vector3(lx * 0.04, -0.17, 1), 1.0, 8, scene);
    spot.diffuse = new Color3(1, 0.85, 0.6);
    spot.specular = new Color3(0.6, 0.55, 0.4);
    spot.range = 32;
    spot.intensity = 0;
    spot.setEnabled(false);
    spot.parent = body;
    const cone = MeshBuilder.CreateCylinder('vBeam' + lx,
      { diameterTop: 3.2, diameterBottom: 0.2, height: 9, tessellation: 14, cap: 0 }, scene);
    cone.rotation.x = Math.PI / 2 - 0.05;                       // +y local → +z avant
    cone.position.set(lx, 1.1, 2.6 + 4.4);
    cone.material = coneMat;
    cone.parent = body;
    cone.isPickable = false;
    beams.push(spot);
  }
  let litFrac = 0, litOn = false;

  /* ---- sapin désodorisant à ressort ---- */
  const fresh = new TransformNode('vFresh', scene);
  fresh.parent = body; fresh.position.set(0.28, 2.36, 2.5);
  const cord = MeshBuilder.CreateCylinder('vCord', { diameter: 0.008, height: 0.1 }, scene);
  cord.position.y = -0.05; cord.material = dark; cord.parent = fresh;
  const pine = MeshBuilder.CreateDisc('vPine', { radius: 0.055, tessellation: 3 }, scene);
  pine.position.y = -0.15; pine.rotation.z = Math.PI;           // pointe en haut
  const pm = new StandardMaterial('vPineM', scene);
  pm.diffuseColor = new Color3(0.2, 0.5, 0.24);
  pm.emissiveColor = new Color3(0.05, 0.12, 0.06);
  pm.backFaceCulling = false;
  pine.material = pm; pine.parent = fresh;

  /* ---- roues ---- */
  const wheels = [];
  const corners = [
    [-TRACK, WHEELBASE / 2, true], [TRACK, WHEELBASE / 2, true],
    [-TRACK, -WHEELBASE / 2, false], [TRACK, -WHEELBASE / 2, false],
  ];
  for (const [wx, wz, steer] of corners) {
    const hub = new TransformNode('vWheelHub', scene);
    hub.parent = root; hub.position.set(wx, WHEEL_R, wz);
    const spin = new TransformNode('vWheelSpin', scene);
    spin.parent = hub;
    const tire = MeshBuilder.CreateCylinder('vTire', { diameter: WHEEL_R * 2, height: 0.26, tessellation: 18 }, scene);
    tire.rotation.z = Math.PI / 2; tire.material = dark; tire.parent = spin;
    const cap = MeshBuilder.CreateCylinder('vCap', { diameter: 0.3, height: 0.28, tessellation: 12 }, scene);
    cap.rotation.z = Math.PI / 2; cap.material = chrome; cap.parent = spin;
    meshes.push(tire, cap);
    wheels.push({ hub, spin, wx, wz, steer, y: 0 });
  }

  /* La carte d'ombre ne connaît que la profondeur : un matériau en alpha
   * blending y est écrit PLEIN. Les six vitres projetaient donc des dalles
   * noires opaques — un pare-brise posant plein soleil une barre d'ombre
   * franche sur le tablier et les sièges, exactement là où la lumière devrait
   * entrer. La réception reste vraie : c'est l'ombre des troncs qui balaie le
   * pare-brise quand on roule. Le test porte sur le MATÉRIAU et non sur une
   * liste de noms — toute vitre ajoutée plus tard sera exclue d'office. */
  for (const m of meshes) {
    if (m.material !== glass) shadows.addShadowCaster(m);
    m.receiveShadows = true;
  }

  /* ---- dynamique ---- */
  const st = {
    x: 1.2, z: 36.6, yaw: Math.PI, speed: 0, steerA: 0,  // garé dans le garage
    vx: 0, vz: 0, odo: 0,                              // vélocité réelle, odomètre
    bodyY: 0, pitch: 0, roll: 0, fresh: { x: 0, z: 0, vx: 0, vz: 0 },
    lastAcc: 0,
  };

  // scratch réutilisé (consommer le résultat avant l'appel suivant)
  const wheelOut = { x: 0, z: 0 };
  function wheelWorld(w) {
    const c = Math.cos(st.yaw), s = Math.sin(st.yaw);
    wheelOut.x = st.x + w.wx * c + w.wz * s;
    wheelOut.z = st.z - w.wx * s + w.wz * c;
    return wheelOut;
  }

  function update(dt, input, blocked) {
    /* conduite : couple, freinage, traînée — lourd et analogique */
    const off = input.offroad ? 0.55 : 0;
    const drag = 0.45 + Math.abs(st.speed) * (0.32 + off) + st.speed * st.speed * 0.012;
    let acc = 0;
    if (input.throttle > 0) acc = st.speed >= 0 ? 4.6 * (1 - Math.abs(st.speed) / 13) : 8.5;
    else if (input.throttle < 0) acc = st.speed > 0.3 ? -8.5 : -2.4;
    acc *= Math.abs(input.throttle);
    st.speed += (acc - Math.sign(st.speed) * drag) * dt;
    if (Math.abs(st.speed) < 0.04 && input.throttle === 0) st.speed = 0;
    st.speed = Math.max(-3.2, Math.min(12.5, st.speed));
    // direction : pleine à l'arrêt, resserrée à vitesse
    const maxSteer = 0.52 / (1 + Math.abs(st.speed) * 0.16);
    st.steerA += (input.steer * maxSteer - st.steerA) * Math.min(1, 8 * dt);
    st.yaw += st.steerA * (st.speed / WHEELBASE) * dt * 1.35;
    // adhérence finie : la vélocité réelle rejoint l'axe du van avec du
    // retard — douce glisse dans l'épingle, plus marquée sur la terre
    const grip = input.offroad ? 2.6 : 6.5;
    const gk = Math.min(1, grip * dt);
    st.vx += (Math.sin(st.yaw) * st.speed - st.vx) * gk;
    st.vz += (Math.cos(st.yaw) * st.speed - st.vz) * gk;
    const nx = st.x + st.vx * dt;
    const nz = st.z + st.vz * dt;
    if (blocked && blocked(nx, nz)) { st.speed *= -0.2; st.vx *= -0.2; st.vz *= -0.2; }
    else { st.x = nx; st.z = nz; }
    st.odo += Math.abs(st.speed) * dt;

    /* suspension : sol sondé sous chaque roue (+ tôle ondulée sur le gravier
     * de la chaussée : broutement haute fréquence indexé sur l'odomètre) */
    const washA = (!input.offroad && Math.abs(st.speed) > 3)
      ? 0.017 * Math.min(1, Math.abs(st.speed) / 7) : 0;
    let gsum = 0;
    for (const w of wheels) {
      const p = wheelWorld(w);
      const gy = ground(p.x, p.z)
        + washA * Math.sin(st.odo * 8.6 + w.wx * 3.7 + w.wz * 1.9);
      w.y += (gy - w.y) * Math.min(1, 16 * dt);                 // détente visible
      gsum += w.y;
    }
    const gMean = gsum / 4;
    const gF = (wheels[0].y + wheels[1].y) / 2, gR = (wheels[2].y + wheels[3].y) / 2;
    const gL = (wheels[0].y + wheels[2].y) / 2, gRt = (wheels[1].y + wheels[3].y) / 2;
    const accNow = (acc - st.lastAcc) * 0.5 + acc * 0.5;
    st.lastAcc = acc;
    const pitchT = -Math.atan2(gF - gR, WHEELBASE) - accNow * 0.0075;
    const rollT = Math.atan2(gRt - gL, TRACK * 2) - st.steerA * st.speed * 0.012;
    st.pitch += (pitchT - st.pitch) * Math.min(1, 6 * dt);
    st.roll += (rollT - st.roll) * Math.min(1, 6 * dt);
    const prevBodyY = st.bodyY;
    st.bodyY += (gMean + CLEAR - st.bodyY) * Math.min(1, 7 * dt);

    root.position.set(st.x, 0, st.z);
    root.rotation.y = st.yaw;
    body.position.y = st.bodyY;
    body.rotation.x = st.pitch;
    body.rotation.z = st.roll;
    for (const w of wheels) {
      w.hub.position.y = w.y + WHEEL_R;
      w.hub.rotation.y = w.steer ? st.steerA : 0;
      w.spin.rotation.x += (st.speed / WHEEL_R) * dt;
    }
    /* le sapin encaisse les bosses et les à-coups */
    const bump = (st.bodyY - prevBodyY) / Math.max(dt, 1e-3);
    const f = st.fresh;
    f.vx += (-f.x * 34 - f.vx * 3.2 + st.pitch * 6 - bump * 1.6) * dt;
    f.vz += (-f.z * 34 - f.vz * 3.2 + st.roll * 8 + st.steerA * st.speed * 0.24) * dt;
    f.x += f.vx * dt; f.z += f.vz * dt;
    fresh.rotation.x = Math.max(-0.9, Math.min(0.9, f.x));
    fresh.rotation.z = Math.max(-0.9, Math.min(0.9, f.z));

    /* phares : montée/descente en fondu, cônes gonflés par la brume/pluie.
     * Les spots éteints sont DÉSACTIVÉS : ils ne comptent plus dans le
     * quota de lumières simultanées des matériaux. */
    /* Poste de conduite. Le débord de lueur sur la jante et la planche se fait
     * en donnant quelques pour cent d'émissif jade aux matériaux qui n'existent
     * QUE dans la cabine : c'est la seule façon d'obtenir un halo sans une
     * lumière, et ça coûte deux copyFromFloats. Le facteur retient le maximum
     * des phares et d'une fraction de la nuit — les instruments s'allument avec
     * les feux, c'est le même rhéostat que sur une voiture de 1970, mais ils
     * gardent la nuit un fond de veilleuse qui suffit à les trouver. */
    const gl = Math.max(litFrac, (input.night || 0) * 0.4);
    combM.emissiveColor.copyFromFloats(gl, gl, gl);
    aigM.emissiveColor.copyFromFloats(gl * 0.55, gl * 0.12, gl * 0.09);
    volTurn.rotation.y = -st.steerA * 9.0;
    aigVit.rotation.z = 2.094 - Math.min(1, Math.abs(st.speed) / 16.67) * 4.189;
    tempE += (Math.min(1, Math.abs(st.speed) / 6) - tempE) * 0.25 * dt;
    aigTmp.rotation.z = 0.6 - tempE * 1.2;
    aigEss.rotation.z = 0.6 - (1 - (st.odo % 1200) / 1200) * 1.2;
    /* L'accélérateur qui descend quand on appuie, vu DEPUIS LE SALON par le
     * portique ouvert, est la scène qui répond mot pour mot à « le vaisseau
     * qu'on visite et qu'on peut piloter ». Deux interpolations par frame. */
    accP += (Math.max(0, input.throttle) - accP) * Math.min(1, 14 * dt);
    frP += (Math.max(0, -input.throttle) - frP) * Math.min(1, 14 * dt);
    pedals[2].rotation.x = -0.40 - accP * 0.24;
    pedals[1].rotation.x = -0.40 - frP * 0.26;
    litFrac += ((litOn ? 1 : 0) - litFrac) * Math.min(1, 2.6 * dt);
    const beamsOn = litFrac > 0.01;
    for (const s of beams) {
      if (s.isEnabled() !== beamsOn) s.setEnabled(beamsOn);
      s.intensity = litFrac * 34;   // assez pour la route, pas pour blanchir la forêt
    }
    coneMat.alpha = litFrac * (0.045 + (input.mist || 0) * 0.075);
    lampOn.emissiveColor.set(0.35 + 0.65 * litFrac * 1.4, 0.3 + 0.55 * litFrac * 1.3, 0.2 + 0.4 * litFrac);
  }

  function setLights(on) { litOn = on; }
  /** coupure sèche (warm-up) : pas de fondu résiduel à la levée du boot */
  function snapLightsOff() {
    litOn = false; litFrac = 0;
    for (const s of beams) { s.intensity = 0; s.setEnabled(false); }
    coneMat.alpha = 0;
    lampOn.emissiveColor.set(0.35, 0.3, 0.2);
  }

  // amorce : la suspension se pose avant la première frame visible
  for (let i = 0; i < 30; i++) update(0.1, { throttle: 0, steer: 0, offroad: false }, null);

  return { root, body, st, wheels, wheelWorld, update, setLights, snapLightsOff, lightsOn: () => litOn };
}
