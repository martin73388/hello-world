/**
 * Le van HABITABLE — on entre par la portière latérale coulissante, on marche
 * dans la cellule, et le van peut rouler pendant qu'on est dedans.
 *
 * Ce module ne touche pas van.js : il ACCROCHE l'aménagement au nœud de caisse
 * (vanBody) et fournit la physique en REPÈRE LOCAL. Tant que le marcheur est
 * décrit en local (lx, lz), il est porté par le van sans effort — c'est la
 * conversion monde↔local qui fait tout le travail, pas une resynchronisation
 * par frame. resolve() résout le cercle du marcheur contre les cloisons et le
 * mobilier DANS ce même repère : l'intérieur reste praticable en mouvement.
 *
 * Repère local (main gauche) : +x droite, +y haut, +z avant ; y = 0 au niveau
 * de bodyY, plancher à FLOOR_Y. Aménagement d'un fourgon des années 70 :
 * couchette au fond, kitchenette à droite, table + banquette à gauche.
 */
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { PointLight } from '@babylonjs/core/Lights/pointLight.js';
import { windClock } from '../vegetation/wind.js';
import { BAY_Z0, BAY_Z1 } from './van.js';

/* ---- géométrie de la cellule (tout en local, y = 0 au niveau de bodyY) ----
 * La caisse de van.js : vLower 0,53→1,55 et vUpper 1,545→2,495. Le plancher se
 * pose sur le bas de caisse, le plafond passe SOUS le pavillon. */
const FLOOR_Y = 0.52;                    // plancher (spec : ~0,52 au-dessus de bodyY)
const CEIL_Y = FLOOR_Y + 1.85;           // 2,37 — 1,85 m sous plafond
const HW = 0.95;                         // demi-largeur habitable → 1,90 m
const Z_BACK = -2.45;                    // paroi arrière
const Z_BULK = 1.00;                     // cloison de séparation cabine/cellule
const TH = 0.05;                         // épaisseur du doublage
/**
 * Épaisseur du doublage DE FLANC. La caisse de van.js a DEUX largeurs, pas
 * une — vLower est à |x| = 1,000, mais vUpper, qui couvre tout ce qui est
 * au-dessus de y = 1,545, n'est qu'à 0,980. Le doublage se pose contre la
 * paroi habitable (|x| = 0,95) et ressort donc de TH_F :
 *   à 0,050 il tombait pile sur vLower — lutte de profondeur, les rectangles
 *     de contreplaqué clignotaient sur le flanc ;
 *   à 0,035 il tombait à 0,985, soit 5 mm DEVANT vUpper — il ne clignotait
 *     plus, il gagnait tout le temps, et on voyait de dehors de grands
 *     panneaux de bois à la place de la tôle crème.
 * La contrainte serrante est donc vUpper à 0,980, pas vLower à 1,000. À 0,020
 * la face extérieure tombe à 0,970 : dix millimètres derrière vUpper, trente
 * derrière vLower. La face INTÉRIEURE ne bouge pas (0,950) — volume habitable,
 * colliders et camLimit sont écrits contre HW, ils ne voient pas la
 * différence.
 */
const TH_F = 0.02;
// Le passage fait 0,80 m : un marcheur de 0,32 m de rayon en réclame 0,64, et
// il doit rester du jeu pour ne pas râper la cloison à chaque franchissement.
const PASS_X0 = -0.10, PASS_X1 = 0.70;   // passage vers la cabine
// Les cotes de la baie viennent de van.js, qui perce le trou dans la tôle :
// une seule source, sinon la portière et l'ouverture divergent.
const DOOR_Z0 = BAY_Z0, DOOR_Z1 = BAY_Z1;   // baie coulissante (1,30 m)
const DOOR_TRAVEL = 1.4;                 // course vers l'arrière
const DOOR_DUR = 0.9;                    // ouverture/fermeture (s)
const SEAT = { x: -0.52, z: 1.70 };      // siège conducteur (cf. vSeatL de van.js)

/* ---- textures peintes (LCG déterministe, jamais de scan) ---- */

/** contreplaqué blond verni, patiné par vingt ans de route */
function woodTexture(scene) {
  const tex = new DynamicTexture('viWood', 256, scene, true);
  const g = tex.getContext();
  let s = 1187;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  g.fillStyle = '#c2a172'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 140; i++) {                     // fil du bois, couché
    g.fillStyle = rnd() < 0.5 ? 'rgba(120,86,48,.22)' : 'rgba(228,205,164,.2)';
    g.fillRect(rnd() * 256, rnd() * 256, 40 + rnd() * 160, 1 + rnd() * 2);
  }
  for (let i = 0; i < 3; i++) {                       // nœuds
    const x = rnd() * 256, y = rnd() * 256;
    g.strokeStyle = 'rgba(96,64,34,.45)'; g.lineWidth = 2;
    g.beginPath(); g.arc(x, y, 4 + rnd() * 5, 0, 7); g.stroke();
    g.beginPath(); g.arc(x, y, 9 + rnd() * 6, 0, 7); g.stroke();
  }
  for (let i = 0; i < 22; i++) {                      // vernis mangé aux angles
    g.fillStyle = 'rgba(88,60,32,.14)';
    g.fillRect(rnd() * 256, rnd() * 256, 10 + rnd() * 40, 8 + rnd() * 30);
  }
  tex.update();
  return tex;
}

/** formica crème et ses boomerangs — le plan de travail du fourgon */
function formicaTexture(scene) {
  const tex = new DynamicTexture('viFormica', 256, scene, true);
  const g = tex.getContext();
  let s = 733;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  g.fillStyle = '#e4dcc2'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 380; i++) {                     // moucheture fine du stratifié
    g.fillStyle = rnd() < 0.5 ? 'rgba(150,138,110,.2)' : 'rgba(255,252,240,.3)';
    g.fillRect(rnd() * 256, rnd() * 256, 1 + rnd() * 2, 1 + rnd() * 2);
  }
  for (let i = 0; i < 26; i++) {                      // boomerangs atomiques
    const x = rnd() * 256, y = rnd() * 256, r = 5 + rnd() * 7, a = rnd() * 6.28;
    g.strokeStyle = rnd() < 0.5 ? 'rgba(190,132,42,.5)' : 'rgba(78,132,124,.42)';
    g.lineWidth = 2.4;
    g.beginPath(); g.arc(x, y, r, a, a + 2.1); g.stroke();
  }
  for (let i = 0; i < 9; i++) {                       // ronds de tasse et rayures
    g.strokeStyle = 'rgba(122,96,58,.16)'; g.lineWidth = 1.5;
    g.beginPath(); g.arc(rnd() * 256, rnd() * 256, 6 + rnd() * 7, 0, 7); g.stroke();
  }
  tex.update();
  return tex;
}

/** tissu géométrique 70s : chevrons moutarde / brique / olive, en bandes */
function fabricTexture(scene) {
  const tex = new DynamicTexture('viFabric', 256, scene, true);
  const g = tex.getContext();
  let s = 349;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  g.fillStyle = '#b8862f'; g.fillRect(0, 0, 256, 256);
  const bands = ['#8a4530', '#5d6b34', '#d9c79a', '#8a4530'];
  for (let b = 0; b < 4; b++) {
    const y = b * 64;
    g.fillStyle = bands[b];
    // un chevron par bande : deux triangles répétés tous les 32 px
    for (let x = -32; x < 256; x += 32) {
      g.beginPath();
      g.moveTo(x, y + 44); g.lineTo(x + 16, y + 18); g.lineTo(x + 32, y + 44);
      g.lineTo(x + 32, y + 56); g.lineTo(x + 16, y + 30); g.lineTo(x, y + 56);
      g.closePath(); g.fill();
    }
    g.fillStyle = 'rgba(40,28,16,.3)';
    g.fillRect(0, y + 60, 256, 3);                    // liseré entre bandes
  }
  for (let i = 0; i < 220; i++) {                     // trame et poussière
    g.fillStyle = rnd() < 0.5 ? 'rgba(30,20,10,.13)' : 'rgba(255,245,220,.11)';
    g.fillRect(rnd() * 256, rnd() * 256, 1 + rnd() * 3, 1 + rnd() * 2);
  }
  tex.update();
  return tex;
}

/** le tapis : losanges usés, frangés de crème */
function rugTexture(scene) {
  const tex = new DynamicTexture('viRug', 256, scene, true);
  const g = tex.getContext();
  let s = 911;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  g.fillStyle = '#5a4430'; g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#8f4a2a';
  for (let y = 24; y < 256; y += 56) g.fillRect(0, y, 256, 16);
  g.fillStyle = '#c8b183';
  for (let y = 52; y < 256; y += 56) {                // rangée de losanges
    for (let x = 16; x < 256; x += 48) {
      g.beginPath();
      g.moveTo(x, y - 12); g.lineTo(x + 16, y); g.lineTo(x, y + 12); g.lineTo(x - 16, y);
      g.closePath(); g.fill();
    }
  }
  g.fillStyle = 'rgba(216,200,168,.75)';              // franges aux deux bouts
  for (let x = 0; x < 256; x += 8) { g.fillRect(x, 0, 4, 8); g.fillRect(x, 248, 4, 8); }
  for (let i = 0; i < 200; i++) {                     // usure du passage
    g.fillStyle = rnd() < 0.5 ? 'rgba(24,16,10,.16)' : 'rgba(210,192,158,.12)';
    g.fillRect(rnd() * 256, rnd() * 256, 3 + rnd() * 14, 2 + rnd() * 8);
  }
  tex.update();
  return tex;
}

/** la peau extérieure de la portière : la bicolore de van.js, à l'identique */
function doorSkinTexture(scene) {
  const tex = new DynamicTexture('viDoorSkin', 256, scene, true);
  const g = tex.getContext();
  let s = 617;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  g.fillStyle = '#d9cfb4'; g.fillRect(0, 0, 256, 116);          // crème patinée
  g.fillStyle = '#8a4530'; g.fillRect(0, 116, 256, 140);        // rouge brique
  g.fillStyle = '#c8c2b2'; g.fillRect(0, 113, 256, 6);          // jonc chromé
  for (let i = 0; i < 130; i++) {
    const y = rnd() * 256;
    g.fillStyle = y > 116 ? 'rgba(60,26,16,.25)' : 'rgba(120,110,88,.22)';
    g.fillRect(rnd() * 256, y, 2 + rnd() * 8, 1 + rnd() * 3);
  }
  g.fillStyle = 'rgba(74,34,16,.5)';                            // rouille au bas
  for (let i = 0; i < 14; i++) {
    g.beginPath(); g.arc(rnd() * 256, 220 + rnd() * 34, 1 + rnd() * 5, 0, 7); g.fill();
  }
  tex.update();
  return tex;
}

export function buildVanInterior(scene, shadows, vanBody, vanState) {
  const root = new TransformNode('vanInt', scene);
  root.parent = vanBody;                              // TOUT voyage avec la caisse

  /* ---- matériaux ---- */
  const mk = (name, diff, spec, pow) => {
    const m = new StandardMaterial(name, scene);
    if (diff) m.diffuseColor = diff;
    m.specularColor = spec || new Color3(0.05, 0.05, 0.05);
    if (pow) m.specularPower = pow;
    m.maxSimultaneousLights = 6;                      // plafonnier compris
    return m;
  };
  const wood = mk('viWoodM', null, new Color3(0.13, 0.11, 0.08), 28);
  wood.diffuseTexture = woodTexture(scene);
  const formica = mk('viFormicaM', null, new Color3(0.24, 0.24, 0.22), 52);
  formica.diffuseTexture = formicaTexture(scene);
  // une seule toile peinte pour les deux matériaux : seul le culling diffère
  const fabTex = fabricTexture(scene);
  const fabric = mk('viFabricM', null, new Color3(0.03, 0.03, 0.03));
  fabric.diffuseTexture = fabTex;
  const curtainM = mk('viCurtainM', null, new Color3(0.03, 0.03, 0.03));
  curtainM.diffuseTexture = fabTex;
  curtainM.backFaceCulling = false;                   // vus du dehors par la vitre
  const rugM = mk('viRugM', null, new Color3(0.02, 0.02, 0.02));
  rugM.diffuseTexture = rugTexture(scene);
  const skin = mk('viSkinM', null, new Color3(0.3, 0.28, 0.24), 42);
  skin.diffuseTexture = doorSkinTexture(scene);
  const metal = mk('viMetalM', new Color3(0.42, 0.44, 0.46), new Color3(0.7, 0.7, 0.72), 72);
  const dark = mk('viDarkM', new Color3(0.1, 0.1, 0.11));
  const tick = mk('viTickM', new Color3(0.7, 0.66, 0.56));       // coutil du matelas
  const glass = mk('viGlassM', new Color3(0.3, 0.42, 0.46), new Color3(1, 1, 1), 128);
  glass.alpha = 0.34;
  const lensM = mk('viLensM', new Color3(0.5, 0.46, 0.34));
  lensM.emissiveColor = new Color3(0, 0, 0);          // mutée par lampSet
  const books = [
    mk('viBook0M', new Color3(0.42, 0.14, 0.1)),
    mk('viBook1M', new Color3(0.16, 0.24, 0.34)),
    mk('viBook2M', new Color3(0.55, 0.42, 0.16)),
    mk('viBook3M', new Color3(0.2, 0.3, 0.18)),
  ];

  /* ---- fabriques : tout est parenté à root, donc en coordonnées locales ---- */
  const meshes = [];
  const box = (name, w, h, d, x, y, z, mat, parent) => {
    const m = MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, scene);
    m.position.set(x, y, z);
    m.material = mat; m.parent = parent || root; m.isPickable = false;
    meshes.push(m);
    return m;
  };
  const cyl = (name, dia, h, x, y, z, mat, tess, parent) => {
    const m = MeshBuilder.CreateCylinder(name,
      { diameter: dia, height: h, tessellation: tess || 10 }, scene);
    m.position.set(x, y, z);
    m.material = mat; m.parent = parent || root; m.isPickable = false;
    meshes.push(m);
    return m;
  };

  /* ---- doublage : la cellule est une boîte percée d'une seule baie.
   * Les flancs de van.js sont des boîtes pleines : vues du dedans leurs faces
   * sont éliminées (backface culling), d'où ce doublage qui fait les vraies
   * parois — et les trous qui font les vraies fenêtres. ---- */
  const CZ = (Z_BACK + Z_BULK) / 2, CD = Z_BULK - Z_BACK;
  box('viSol', HW * 2, 0.04, CD, 0, FLOOR_Y - 0.02, CZ, wood);
  // La cabine n'a JAMAIS eu de plancher à elle : le seul plan qu'on y voyait
  // était le DESSUS de vLower, à 1,55 — le « sol en trop » à hauteur de hanche
  // que van.js vient de retirer. Depuis, le regard traverse le van et sort sur
  // le terrain, de l'intérieur comme du dehors par le pare-brise. On aboute
  // franchement à viSol en z = 1,00 : normales opposées, aucun plan partagé.
  box('viSolCabine', HW * 2, 0.04, 2.42 - Z_BULK,
    0, FLOOR_Y - 0.02, (Z_BULK + 2.42) / 2, dark);
  box('viPlafond', HW * 2, 0.04, CD, 0, CEIL_Y + 0.02, CZ, formica);
  // flanc gauche : coupé par la baie coulissante, pleine hauteur
  box('viFlancGar', TH_F, CEIL_Y - FLOOR_Y, DOOR_Z0 - Z_BACK,
    -HW - TH_F / 2, (FLOOR_Y + CEIL_Y) / 2, (Z_BACK + DOOR_Z0) / 2, wood);
  box('viFlancGav', TH_F, CEIL_Y - FLOOR_Y, Z_BULK - DOOR_Z1,
    -HW - TH_F / 2, (FLOOR_Y + CEIL_Y) / 2, (DOOR_Z1 + Z_BULK) / 2, wood);
  // flanc droit : évidé autour de la vitre de custode (vWinR2 de van.js)
  const WY0 = 1.86, WY1 = 2.30, WZ0 = -0.90, WZ1 = 0.10;
  box('viFlancDb', TH_F, WY0 - FLOOR_Y, CD, HW + TH_F / 2, (FLOOR_Y + WY0) / 2, CZ, wood);
  box('viFlancDh', TH_F, CEIL_Y - WY1, CD, HW + TH_F / 2, (WY1 + CEIL_Y) / 2, CZ, wood);
  box('viFlancDar', TH_F, WY1 - WY0, WZ0 - Z_BACK,
    HW + TH_F / 2, (WY0 + WY1) / 2, (Z_BACK + WZ0) / 2, wood);
  box('viFlancDav', TH_F, WY1 - WY0, Z_BULK - WZ1,
    HW + TH_F / 2, (WY0 + WY1) / 2, (WZ1 + Z_BULK) / 2, wood);
  // paroi arrière : évidée autour de la lunette (vWinB), on la voit du lit
  const BY0 = 1.92, BY1 = 2.32, BX = 0.65;
  box('viFondb', HW * 2, BY0 - FLOOR_Y, TH, 0, (FLOOR_Y + BY0) / 2, Z_BACK - TH / 2, wood);
  box('viFondh', HW * 2, CEIL_Y - BY1, TH, 0, (BY1 + CEIL_Y) / 2, Z_BACK - TH / 2, wood);
  box('viFondg', HW - BX, BY1 - BY0, TH, -(HW + BX) / 2, (BY0 + BY1) / 2, Z_BACK - TH / 2, wood);
  box('viFondd', HW - BX, BY1 - BY0, TH, (HW + BX) / 2, (BY0 + BY1) / 2, Z_BACK - TH / 2, wood);
  // cloison de séparation : deux joues + un linteau, le passage reste franc
  const PASS_TOP = 2.02;
  box('viCloisonG', PASS_X0 + HW, PASS_TOP - FLOOR_Y, TH,
    (-HW + PASS_X0) / 2, (FLOOR_Y + PASS_TOP) / 2, Z_BULK + TH / 2, wood);
  box('viCloisonD', HW - PASS_X1, PASS_TOP - FLOOR_Y, TH,
    (PASS_X1 + HW) / 2, (FLOOR_Y + PASS_TOP) / 2, Z_BULK + TH / 2, wood);
  box('viLinteau', HW * 2, CEIL_Y - PASS_TOP, TH,
    0, (PASS_TOP + CEIL_Y) / 2, Z_BULK + TH / 2, wood);
  // le doublage épouse la caisse de van.js, déjà projetée dans les cascades :
  // le refaire caster doublerait la silhouette pour zéro pixel d'ombre
  const NO_CAST = meshes.length;

  /* ---- le tapis, posé sur le plancher ---- */
  const rug = MeshBuilder.CreateGround('viTapis', { width: 1.3, height: 1.7 }, scene);
  rug.position.set(-0.22, FLOOR_Y + 0.012, -0.5);
  rug.material = rugM; rug.parent = root; rug.isPickable = false;
  meshes.push(rug);

  /* ---- couchette au fond : caisson, matelas, couverture pliée, oreillers ---- */
  const BED_Z1 = -1.15;
  box('viLitCaisson', HW * 2, 0.48, BED_Z1 - Z_BACK,
    0, FLOOR_Y + 0.24, (Z_BACK + BED_Z1) / 2, wood);
  box('viLitFacade', HW * 2, 0.44, 0.04, 0, FLOOR_Y + 0.22, BED_Z1 + 0.02, wood);
  box('viMatelas', HW * 2 - 0.04, 0.14, BED_Z1 - Z_BACK - 0.04,
    0, FLOOR_Y + 0.55, (Z_BACK + BED_Z1) / 2, tick);
  box('viCouverture', 1.5, 0.13, 0.46, 0, FLOOR_Y + 0.685, BED_Z1 - 0.33, fabric);
  box('viOreiller1', 0.52, 0.13, 0.3, -0.44, FLOOR_Y + 0.685, Z_BACK + 0.24, tick);
  box('viOreiller2', 0.52, 0.13, 0.3, 0.44, FLOOR_Y + 0.685, Z_BACK + 0.24, tick);

  /* ---- kitchenette à droite : caisson, plan formica, évier, deux feux,
   * placards à portes bombées (cylindres écrasés, moitié saillante) ---- */
  const KX0 = 0.45, KZ0 = -1.10, KZ1 = 0.25, WORK = FLOOR_Y + 0.86;
  box('viKitCaisson', HW - KX0, 0.86, KZ1 - KZ0,
    (KX0 + HW) / 2, FLOOR_Y + 0.43, (KZ0 + KZ1) / 2, wood);
  box('viKitPlan', HW - KX0 + 0.04, 0.04, KZ1 - KZ0 + 0.04,
    (KX0 + HW) / 2, WORK + 0.02, (KZ0 + KZ1) / 2, formica);
  box('viKitDosseret', 0.03, 0.16, KZ1 - KZ0, HW - 0.015, WORK + 0.12, (KZ0 + KZ1) / 2, formica);
  for (const dz of [-0.85, -0.32]) {
    // le galbe des portes : un cylindre couché (axe sur z, donc 0,50 m de
    // large) puis écrasé en x — la moitié saillante suffit à lire le bombé
    const d = cyl('viPlacard' + dz, 0.5, 0.5, KX0, FLOOR_Y + 0.33, dz, wood, 10);
    d.rotation.x = Math.PI / 2;                       // la mise à l'échelle précède
    d.scaling.x = 0.22;                               // la rotation : x reste x
    box('viPoignee' + dz, 0.04, 0.03, 0.11, KX0 - 0.06, FLOOR_Y + 0.52, dz, metal);
  }
  box('viTiroir', 0.03, 0.5, 0.28, KX0 + 0.015, FLOOR_Y + 0.3, 0.06, wood);
  box('viTiroirP', 0.04, 0.03, 0.14, KX0 - 0.02, FLOOR_Y + 0.44, 0.06, metal);
  // l'évier : une cuve peu profonde, un col de cygne
  box('viEvier', 0.32, 0.1, 0.34, 0.71, WORK + 0.005, 0.02, metal);
  box('viEvierFond', 0.26, 0.02, 0.28, 0.71, WORK - 0.03, 0.02, dark);
  cyl('viRobinet', 0.026, 0.2, 0.86, WORK + 0.12, 0.02, metal, 8);
  const spout = cyl('viBec', 0.022, 0.14, 0.80, WORK + 0.21, 0.02, metal, 8);
  spout.rotation.z = Math.PI / 2;
  // les deux feux, sur leur plaque émaillée
  box('viRechaud', 0.34, 0.02, 0.34, 0.71, WORK + 0.05, -0.55, dark);
  for (const fz of [-0.45, -0.66]) {
    const ring = MeshBuilder.CreateTorus('viFeu' + fz,
      { diameter: 0.14, thickness: 0.018, tessellation: 12 }, scene);
    ring.position.set(0.71, WORK + 0.07, fz);
    ring.material = metal; ring.parent = root; ring.isPickable = false;
    meshes.push(ring);
  }

  /* ---- l'étagère au-dessus du plan : livres et boîtes ---- */
  // l'étagère s'arrête avant l'arrière du plan : la radio et son antenne
  // occupent ce bout de paillasse, rien ne se traverse
  const SH_Y = FLOOR_Y + 1.15, SH_Z0 = -0.755, SH_Z1 = 0.195;
  const SH_C = (SH_Z0 + SH_Z1) / 2, SH_D = SH_Z1 - SH_Z0;
  box('viEtagere', 0.24, 0.035, SH_D, 0.83, SH_Y, SH_C, wood);
  box('viEtagLisse', 0.02, 0.06, SH_D, 0.715, SH_Y + 0.045, SH_C, wood);
  box('viEtagEq1', 0.2, 0.16, 0.03, 0.85, SH_Y - 0.09, SH_Z0 + 0.05, dark);
  box('viEtagEq2', 0.2, 0.16, 0.03, 0.85, SH_Y - 0.09, SH_Z1 - 0.05, dark);
  {
    let s = 251;
    const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    let bz = SH_Z0 + 0.035;
    for (let i = 0; i < 11 && bz < -0.20; i++) {
      // hauteur bornée à 0,18 : au-delà, les tranches croiseraient le rideau
      const w = 0.028 + rnd() * 0.03, h = 0.13 + rnd() * 0.05;
      const b = box('viLivre' + i, 0.15, h, w, 0.845, SH_Y + 0.018 + h / 2, bz + w / 2,
        books[i & 3]);
      if (i === 4) b.rotation.x = 0.22;               // un volume qui penche
      bz += w + 0.004;
    }
  }
  box('viBoite1', 0.19, 0.12, 0.2, 0.84, SH_Y + 0.078, -0.08, dark);
  box('viBoite2', 0.17, 0.09, 0.12, 0.84, SH_Y + 0.063, 0.11, books[2]);

  /* ---- la petite radio posée sur le plan — clin d'œil à L'Atelier ---- */
  const radio = new TransformNode('viRadio', scene);
  radio.parent = root;
  radio.position.set(0.66, WORK + 0.105, -0.98);
  radio.rotation.y = 0.18;                            // posée de travers, pas alignée
  box('viRadioC', 0.1, 0.13, 0.24, 0, 0, 0, formica, radio);
  box('viRadioGrille', 0.012, 0.09, 0.13, -0.055, 0, -0.05, dark, radio);
  cyl('viRadioBt1', 0.034, 0.016, -0.056, 0.025, 0.075, metal, 8, radio)
    .rotation.z = Math.PI / 2;                        // les boutons regardent la pièce
  cyl('viRadioBt2', 0.034, 0.016, -0.056, -0.03, 0.075, metal, 8, radio)
    .rotation.z = Math.PI / 2;
  const ant = cyl('viRadioAnt', 0.008, 0.22, 0.02, 0.115, -0.1, metal, 6, radio);
  ant.rotation.z = -0.42;

  /* ---- table pliante contre la paroi gauche + banquette. Les deux tiennent
   * dans la même bande x ≤ -0,42 : le couloir vers la cabine reste dégagé
   * de la portière jusqu'au passage, sans chicane. ---- */
  const LX1 = -0.42, TAB_Z1 = 0.43;
  box('viTable', 0.5, 0.04, 0.34, -0.68, FLOOR_Y + 0.7, 0.24, formica);
  box('viTableCharn', 0.05, 0.06, 0.32, -0.92, FLOOR_Y + 0.66, 0.24, metal);
  cyl('viTablePied', 0.035, 0.68, -0.47, FLOOR_Y + 0.34, 0.15, metal, 8);
  box('viBanqCaisson', 0.53, 0.3, 0.55, -0.685, FLOOR_Y + 0.15, 0.71, wood);
  box('viBanqAssise', 0.53, 0.12, 0.55, -0.685, FLOOR_Y + 0.36, 0.71, fabric);
  box('viBanqDossier', 0.53, 0.42, 0.09, -0.685, FLOOR_Y + 0.63, 0.95, fabric);

  /* ---- portière latérale COULISSANTE (côté gauche, -x) ---- */
  const doorNode = new TransformNode('viPorte', scene);
  doorNode.parent = root;
  const DZC = (DOOR_Z0 + DOOR_Z1) / 2, DZD = DOOR_Z1 - DOOR_Z0;
  const DGY0 = 1.86, DGY1 = 2.30;                     // la vitre de la portière
  box('viPortePan', 0.05, DGY0 - 0.55, DZD, -HW - 0.080, (0.55 + DGY0) / 2, DZC, skin, doorNode);
  box('viPorteHt', 0.05, CEIL_Y - DGY1, DZD, -HW - 0.075, (DGY1 + CEIL_Y) / 2, DZC, skin, doorNode);
  box('viPorteMg', 0.05, DGY1 - DGY0, 0.14, -HW - 0.075, (DGY0 + DGY1) / 2, DOOR_Z0 + 0.07, skin, doorNode);
  box('viPorteMd', 0.05, DGY1 - DGY0, 0.14, -HW - 0.075, (DGY0 + DGY1) / 2, DOOR_Z1 - 0.07, skin, doorNode);
  box('viPorteVitre', 0.02, DGY1 - DGY0 - 0.02, DZD - 0.3,
    -HW - 0.075, (DGY0 + DGY1) / 2, DZC, glass, doorNode);
  box('viPorteDoubl', 0.03, DGY0 - 0.55, DZD - 0.04, -HW - 0.015, (0.55 + DGY0) / 2, DZC, wood, doorNode);
  box('viPortePoignee', 0.06, 0.05, 0.18, -HW - 0.13, 1.34, DOOR_Z1 - 0.2, metal, doorNode);
  box('viPorteRail', 0.05, 0.05, DZD + DOOR_TRAVEL + 0.1,
    -HW - 0.09, CEIL_Y + 0.06, DZC - DOOR_TRAVEL / 2, dark);
  box('viPorteSeuil', 0.16, 0.05, DZD, -HW - 0.03, FLOOR_Y - 0.015, DZC, metal);

  /* ---- marchepied sous la portière ----
   * Le plancher est à 0,52 et le sol à 0 : sans relais, on « montait » d'un
   * demi-mètre d'un coup. La marche se pose à 0,27, presque à mi-hauteur, et
   * elle est assez large (0,42 m) et assez épaisse (0,09) pour se lire comme
   * un marchepied et non comme une planche oubliée sous la caisse. Deux
   * équerres la rattachent visiblement au bas de caisse, et un nez chromé
   * accroche la lumière — c'est ce qui la signale au joueur qui approche. */
  /* Le compte, d'abord, parce que c'est lui qui décide de tout : la caisse est
   * portée à CLEAR = 0,42 m au-dessus du sol, et le plancher est 0,52 plus
   * haut — soit 0,94 m à gravir. L'unique marche qui existait était posée à
   * y local 0,315, c'est-à-dire à SOIXANTE-SEIZE centimètres du sol : ce
   * n'était pas une marche, c'était un rebord qu'on ne pouvait pas escalader.
   *
   * On divise donc la montée en trois pas égaux de 31 cm : sol → 0,31 → 0,63
   * → plancher. En repère van (y = 0 à hauteur de caisse), les dessus tombent
   * à -0,11 et +0,21. La marche basse pend sous le bas de caisse, comme un
   * marchepied rapporté ; la haute est en retrait, dans l'axe du seuil. */
  const M1_TOP = 0.31 - 0.42, M2_TOP = 0.63 - 0.42;   // -0,11 et +0,21
  const MT = 0.06;                                    // épaisseur des tôles
  // marche basse, la plus en saillie — c'est celle qu'on voit en approchant
  box('viMarcheBas', 0.36, MT, 1.12, -1.24, M1_TOP - MT / 2, DZC, dark);
  box('viMarcheBasTapis', 0.32, 0.015, 1.06, -1.24, M1_TOP + 0.008, DZC, metal);
  // marche haute, en retrait, au droit du seuil de la baie
  box('viMarcheHt', 0.30, MT, 1.12, -1.15, M2_TOP - MT / 2, DZC, dark);
  box('viMarcheHtTapis', 0.26, 0.015, 1.06, -1.15, M2_TOP + 0.008, DZC, metal);
  // jambages : deux montants qui rattachent visiblement l'escalier au bas de
  // caisse, sinon les deux tôles flottent dans le vide
  for (const mz of [DZC - 0.46, DZC + 0.46]) {
    box('viMarcheJb' + mz, 0.05, M2_TOP - M1_TOP + MT, 0.07,
      -1.32, (M1_TOP + M2_TOP) / 2, mz, dark);
    box('viMarcheEq' + mz, 0.30, 0.05, 0.06, -1.15, M2_TOP + 0.10, mz, dark);
  }

  /* ---- rideaux : tringle + panneau pendu, ils balancent au roulis.
   * Celui de la portière est parenté à doorNode : il coulisse avec elle. ---- */
  const curtains = [];
  const mkCurtain = (name, w, h, x, y, z, ry, axis, parent) => {
    const pivot = new TransformNode(name, scene);
    pivot.parent = parent || root;
    pivot.position.set(x, y, z);
    const p = MeshBuilder.CreatePlane(name + 'P', { width: w, height: h }, scene);
    p.rotation.y = ry;                                // pivot au niveau de la tringle
    p.position.y = -h / 2;
    p.material = curtainM; p.parent = pivot; p.isPickable = false;
    meshes.push(p);
    // la tringle suit la largeur du panneau : sur z aux flancs, sur x au fond
    if (axis === 'z') box(name + 'T', 0.018, 0.018, w + 0.06, 0, 0, 0, metal, pivot);
    else box(name + 'T', w + 0.06, 0.018, 0.018, 0, 0, 0, metal, pivot);
    curtains.push({ pivot, axis, ph: curtains.length * 1.7 });
    return pivot;
  };
  // face avant d'un plan = -z : ry = -π/2 la tourne vers +x (la pièce)
  mkCurtain('viRideauG', 1.0, 0.5, -HW + 0.03, DGY1 - 0.02, DZC, -Math.PI / 2, 'z', doorNode);
  // à droite le rideau s'arrête court : sous lui, les tranches des livres
  mkCurtain('viRideauD', 1.0, 0.36, HW - 0.03, WY1 - 0.02, (WZ0 + WZ1) / 2, Math.PI / 2, 'z');
  mkCurtain('viRideauF', 1.24, 0.46, 0, BY1 - 0.02, Z_BACK + 0.04, Math.PI, 'x');

  /* ---- une tasse émaillée pendue sous l'étagère : elle prend l'inertie ---- */
  const swing = new TransformNode('viTasse', scene);
  swing.parent = root;
  swing.position.set(0.8, SH_Y - 0.02, -0.16);
  box('viCrochet', 0.01, 0.05, 0.01, 0, -0.025, 0, metal, swing);
  cyl('viTasseC', 0.085, 0.09, 0, -0.095, 0, formica, 10, swing);
  box('viTasseAnse', 0.012, 0.05, 0.02, -0.05, -0.095, 0, formica, swing);

  /* ---- plafonnier : UNE PointLight chaude, DÉSACTIVÉE éteinte pour ne pas
   * manger le quota de 6 lumières simultanées ---- */
  box('viPlafEmbase', 0.2, 0.03, 0.2, 0, CEIL_Y - 0.015, -0.35, dark);
  cyl('viPlafVerre', 0.17, 0.06, 0, CEIL_Y - 0.05, -0.35, lensM, 12);
  const lamp = new PointLight('viLampe', new Vector3(0, CEIL_Y - 0.12, -0.35), scene);
  lamp.parent = root;
  lamp.diffuse = new Color3(1, 0.84, 0.6);
  lamp.specular = new Color3(0.4, 0.34, 0.24);
  lamp.range = 4.5;
  lamp.intensity = 0;
  lamp.setEnabled(false);

  for (let i = 0; i < meshes.length; i++) {
    meshes[i].receiveShadows = true;
    if (i >= NO_CAST) shadows.addShadowCaster(meshes[i]);
  }

  /* ---- colliders LOCAUX {x0,x1,z0,z1} : cloisons + mobilier. Le collider
   * marqué door n'est actif que porte close — la baie devient franche. Les
   * SIÈGES ne sont pas des obstacles : on s'y glisse pour prendre le volant. */
  const colliders = [
    { x0: -1.02, x1: -HW, z0: Z_BACK, z1: DOOR_Z0 },              // flanc gauche arrière
    { x0: -1.02, x1: -HW, z0: DOOR_Z1, z1: Z_BULK + TH },         // flanc gauche avant
    { x0: HW, x1: 1.02, z0: Z_BACK, z1: Z_BULK + TH },            // flanc droit
    { x0: -1.02, x1: 1.02, z0: Z_BACK - TH, z1: Z_BACK },         // paroi arrière
    { x0: -1.02, x1: PASS_X0, z0: Z_BULK, z1: Z_BULK + TH },      // cloison, joue gauche
    { x0: PASS_X1, x1: 1.02, z0: Z_BULK, z1: Z_BULK + TH },       // cloison, joue droite
    { x0: -1.10, x1: -HW, z0: DOOR_Z0, z1: DOOR_Z1, door: true }, // la portière close
    { x0: -HW, x1: HW, z0: Z_BACK, z1: BED_Z1 },                  // couchette
    { x0: KX0, x1: HW, z0: KZ0, z1: KZ1 },                        // kitchenette
    { x0: -HW, x1: LX1, z0: 0.05, z1: TAB_Z1 },                   // table pliante
    { x0: -HW, x1: LX1, z0: TAB_Z1, z1: Z_BULK },                 // banquette
    { x0: -1.05, x1: -1.0, z0: Z_BULK, z1: 2.5 },                 // flanc cabine gauche
    { x0: 1.0, x1: 1.05, z0: Z_BULK, z1: 2.5 },                   // flanc cabine droit
    { x0: -1.05, x1: 1.05, z0: 2.42, z1: 2.5 },                   // tablier sous pare-brise
  ];

  /* ---- conversions monde ↔ local (scratchs fournis par l'appelant) ---- */
  function toLocal(wx, wz, out) {
    const c = Math.cos(vanState.yaw), s = Math.sin(vanState.yaw);
    const dx = wx - vanState.x, dz = wz - vanState.z;
    out.x = dx * c - dz * s;
    out.z = dx * s + dz * c;
    return out;
  }
  function toWorld(lx, lz, out) {
    const c = Math.cos(vanState.yaw), s = Math.sin(vanState.yaw);
    out.x = vanState.x + lx * c + lz * s;
    out.z = vanState.z - lx * s + lz * c;
    return out;
  }

  /* ---- état de la portière (aucune allocation par frame) ---- */
  let doorT = 0, doorP = 0, doorE = 0;
  function openDoor() { doorT = 1; }
  function closeDoor() { doorT = 0; }
  /** E actionne la portière : c'est le SEUL rôle de la touche sur le van. */
  function toggleDoor() { doorT = doorT > 0.5 ? 0 : 1; }
  const doorOpen = () => doorE > 0.85;
  /** la baie est-elle assez ouverte pour qu'on s'y engage à pied ? Plus
   * permissif que doorOpen : on doit pouvoir entrer pendant qu'elle coulisse
   * encore, sinon le franchissement se sent « attendu ».
   * Le seuil est le MÊME que celui d'`insideLocal` : à 0,45 ici et 0,5 là-bas,
   * porte entrouverte à 0,47, on embarquait puis débarquait une frame sur deux. */
  const DOOR_PASS = 0.5;
  const doorPassable = () => doorE > DOOR_PASS;

  /**
   * A-t-on FRANCHI la baie ? Volontairement plus strict qu'`insideLocal` : le
   * marcheur doit avoir passé la tôle (lx > -HW - 0,06), pas seulement s'être
   * approché du seuil.
   *
   * L'écart entre les deux seuils est délibéré et c'est lui qui rend le
   * franchissement propre. On devient passager à -1,01, on ne redevient piéton
   * qu'à -1,32 : trente centimètres d'hystérésis. Sans cet écart, un joueur
   * arrêté pile sur le seuil basculerait d'un repère à l'autre à chaque frame,
   * et la caméra battrait entre son cadrage extérieur et intérieur.
   */
  function boarded(lx, lz) {
    // -0,99 et pas -1,01 : STRICTEMENT dans le domaine d'insideLocal, dont le
    // test principal exige lx > -1,00. Deux centimètres de trop et on embarquait
    // sur une position qu'insideLocal jugeait dehors, donc on ressortait aussitôt.
    return lz > Z_BACK + 0.05 && lz < 2.40 && lx > -0.99 && lx < HW;
  }

  /** le volume habitable, cellule + cabine ; porte ouverte, le seuil compte
   * pour « dedans » : on ne rebascule pas dehors en plein franchissement */
  function insideLocal(lx, lz) {
    if (lz < Z_BACK - 0.05 || lz > 2.5) return false;
    if (lx > -1.0 && lx < 1.0) return true;
    return doorE > DOOR_PASS && lx > -1.32 && lx <= -1.0 && lz > DOOR_Z0 && lz < DOOR_Z1;
  }

  /** cercle-AABB en local : c'est ce qui rend l'intérieur praticable en roulant */
  function resolve(lx, lz, r, out) {
    let x = lx, z = lz;
    const skipDoor = doorE > 0.85;
    for (const c of colliders) {
      if (c.door && skipDoor) continue;
      const nx = x < c.x0 ? c.x0 : (x > c.x1 ? c.x1 : x);
      const nz = z < c.z0 ? c.z0 : (z > c.z1 ? c.z1 : z);
      const dx = x - nx, dz = z - nz;
      const d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        if (d2 > 1e-6) {
          const d = Math.sqrt(d2);
          x = nx + (dx / d) * r; z = nz + (dz / d) * r;
        } else {
          // au cœur de la boîte : expulsion par la face la plus proche
          const l = x - c.x0, rr = c.x1 - x, b = z - c.z0, t = c.z1 - z;
          const m = Math.min(l, rr, b, t);
          if (m === l) x = c.x0 - r; else if (m === rr) x = c.x1 + r;
          else if (m === b) z = c.z0 - r; else z = c.z1 + r;
        }
      }
    }
    out.x = x; out.z = z;
    return out;
  }

  /**
   * Le marcheur est-il dans le COULOIR D'ENTRÉE, face à la baie ? C'est la
   * seule zone où la caisse cesse de barrer le passage. Un simple rayon autour
   * du seuil ne suffisait pas : à 2,60 m il couvrait une bonne part du flanc,
   * et on pouvait traverser la tôle à côté de la porte.
   */
  function atDoorway(lx, lz) {
    return lz > DOOR_Z0 - 0.15 && lz < DOOR_Z1 + 0.15 && lx > -2.0 && lx < 0.2;
  }

  /**
   * Hauteur de marche au droit de l'escalier, en repère van — ou null hors de
   * son emprise, auquel cas l'appelant garde le sol du terrain.
   *
   * Sans ça les marches ne seraient que du décor : le marcheur les traverserait
   * au ras du sol puis se téléporterait au plancher en franchissant la baie.
   * C'est cette fonction qui fait qu'on MONTE.
   */
  function stepHeight(lx, lz) {
    if (lz < DOOR_Z0 - 0.06 || lz > DOOR_Z1 + 0.06) return null;
    if (lx > -1.02) return FLOOR_Y;                   // déjà sur le plancher
    if (lx > -1.31) return M2_TOP + 0.02;             // marche haute
    if (lx > -1.45) return M1_TOP + 0.02;             // marche basse
    return null;                                      // au sol, devant le van
  }

  /** le seuil de la portière, en monde — le point où l'on monte et descend */
  function doorWorld(out) {
    toWorld(-1.16, (DOOR_Z0 + DOOR_Z1) / 2, out);
    out.y = vanState.bodyY + 0.33;                    // le marchepied
    return out;
  }

  /**
   * Distance de recul admissible pour la caméra épaule quand on marche DANS le
   * van. Sans cette borne, la caméra reculait de 1,9 m, traversait la paroi et
   * se retrouvait DEHORS : l'écran était rempli par la tôle et le doublage, le
   * mécano invisible derrière — le clamp général ne connaît que les murs du
   * garage, et le rectangle du van est justement désactivé quand on est à bord.
   *
   * Lancer de rayon contre le volume habitable, en repère van : depuis la
   * cible (wx, wy, wz, en monde), le long de l'offset caméra (ox, oy, oz),
   * jusqu'à la première paroi. Aucune allocation.
   */
  const CAM_M = 0.10;                                 // marge aux parois
  function camLimit(wx, wy, wz, ox, oy, oz) {
    const c = Math.cos(vanState.yaw), s = Math.sin(vanState.yaw);
    const dx = wx - vanState.x, dz = wz - vanState.z;
    const lx = dx * c - dz * s, lz = dx * s + dz * c;
    const ly = wy - vanState.bodyY;
    const ldx = ox * c - oz * s, ldz = ox * s + oz * c, ldy = oy;
    // volume habitable : cellule + cabine d'un seul tenant (le passage est
    // dans l'axe, l'approximation ne coince la caméra nulle part)
    const slab = (p, d, lo, hi) =>
      d > 1e-6 ? (hi - p) / d : (d < -1e-6 ? (lo - p) / d : 9);
    let t = slab(lx, ldx, -HW + CAM_M, HW - CAM_M);
    t = Math.min(t, slab(ly, ldy, FLOOR_Y + 0.28, CEIL_Y - CAM_M));
    t = Math.min(t, slab(lz, ldz, Z_BACK + CAM_M, 2.42 - CAM_M));
    // Aucun plancher de recul ici : un `Math.max(0.35, t)` écrasait justement
    // la contrainte qu'on vient de calculer. En visant vers le haut, la caméra
    // repartait sous le plancher et on se retrouvait à regarder la SOUS-FACE du
    // sol, qui barrait l'écran en deux. La borne basse est 0 : si la paroi est
    // à dix centimètres, la caméra reste à dix centimètres.
    return Math.max(0, t);
  }

  /* ---- plafonnier ---- */
  let lampLit = false, lampI = 0, lampEnabled = false;
  function lampSet(on) { lampLit = on; }

  /* ---- animation : porte, rideaux, objets suspendus ---- */
  const sw = { x: 0, vx: 0, z: 0, vz: 0 };            // ressort de la tasse
  let prevYaw = vanState.yaw;
  function update(dt) {
    /* portière coulissante : ~0,9 s, départ et arrivée amortis */
    if (doorP !== doorT) {
      doorP = doorT > doorP
        ? Math.min(doorT, doorP + dt / DOOR_DUR)
        : Math.max(doorT, doorP - dt / DOOR_DUR);
      doorE = doorP * doorP * (3 - 2 * doorP);
      doorNode.position.z = -DOOR_TRAVEL * doorE;
    }

    /* accélération latérale déduite du taux de lacet — pas besoin d'aller
     * chercher la direction dans van.js : le cap et la vitesse suffisent */
    const dyaw = ((vanState.yaw - prevYaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    prevYaw = vanState.yaw;
    const lat = (dyaw / Math.max(dt, 1e-3)) * vanState.speed;

    /* rideaux : le roulis les décolle de la paroi, le vent les fait respirer */
    const roll = vanState.roll, pitch = vanState.pitch;
    for (let i = 0; i < curtains.length; i++) {
      const c = curtains[i];
      const breathe = Math.sin(windClock.t * 1.6 + c.ph) * 0.018
        + Math.sin(windClock.t * 3.7 + c.ph * 2.1) * 0.008;
      if (c.axis === 'z') {
        c.pivot.rotation.z = Math.max(-0.5, Math.min(0.5, roll * 1.5 + lat * 0.02 + breathe));
      } else {
        c.pivot.rotation.x = Math.max(-0.5, Math.min(0.5, -pitch * 1.5 + breathe));
      }
    }

    /* la tasse pendue : ressort-amortisseur, comme le sapin de van.js */
    sw.vx += (-sw.x * 30 - sw.vx * 2.9 + roll * 11 + lat * 0.14) * dt;
    sw.vz += (-sw.z * 30 - sw.vz * 2.9 - pitch * 11) * dt;
    sw.x += sw.vx * dt; sw.z += sw.vz * dt;
    swing.rotation.z = Math.max(-0.7, Math.min(0.7, sw.x));
    swing.rotation.x = Math.max(-0.7, Math.min(0.7, sw.z));

    /* plafonnier : fondu court, éteint il est DÉSACTIVÉ (quota de 6) */
    lampI += ((lampLit ? 1 : 0) - lampI) * Math.min(1, 6 * dt);
    if (!lampLit && lampI < 0.004) lampI = 0;
    const on = lampI > 0.004;
    if (on !== lampEnabled) { lampEnabled = on; lamp.setEnabled(on); }
    lamp.intensity = lampI * 9;
    lensM.emissiveColor.copyFromFloats(lampI * 0.95, lampI * 0.82, lampI * 0.58);
  }

  update(0);                                          // pose fermée et éteinte

  return {
    toLocal, toWorld, resolve, floorY: FLOOR_Y, doorWorld, insideLocal, boarded, atDoorway, stepHeight, camLimit,
    seatLocal: SEAT, update, lampSet, lampOn: () => lampLit,
    openDoor, closeDoor, toggleDoor, doorOpen, doorPassable, doorFrac: () => doorE,
    colliders, root, node: doorNode,
  };
}
