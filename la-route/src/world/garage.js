/**
 * Le garage du M7 — la première chose qu'on voit, la thèse de la démo.
 * Bâtiment plâtré sur l'esplanade (GARAGE de road.js), façade vers -z (le
 * départ de la route), porte sectionnelle 8 panneaux qui s'enroule au plafond
 * panneau par panneau. L'intérieur reconstruit L'Atelier : établi massif,
 * mur d'outils, affiche « UN JOUR, LA ROUTE », suspensions tungstène.
 * Tout le statique est gelé ; seule la porte bouge, zéro allocation par frame.
 * Budget lumières : 2 spots + 1 pointLight « doorGlow » au seuil.
 */
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { SpotLight } from '@babylonjs/core/Lights/spotLight.js';
import { PointLight } from '@babylonjs/core/Lights/pointLight.js';
import { GARAGE } from '../terrain/road.js';

const X_HALF = 4.6, TH = 0.3, WALL_H = 3.9;          // emprise, murs
const DOOR_W = 5.2, DOOR_H = 3.5;                    // ouverture
const N_PAN = 8, P_H = 0.44, P_T = 0.07;             // panneaux de porte
const BEND_R = 0.55, ARC = BEND_R * Math.PI / 2;     // virage vers le plafond
const Q_BEND = DOOR_H - P_H / 2;                     // début du virage (rail)
const LIFT = 4.35;                                   // course totale d'un panneau
const DLY = 0.04, SPAN = 1 - (N_PAN - 1) * DLY;      // retard par panneau
const DUR = 3.6;                                     // durée d'ouverture (s)

/* ---- sol béton : taches d'huile, fissures, usure devant la porte ---- */
function concreteTexture(scene) {
  const tex = new DynamicTexture('gConcrete', 512, scene, true);
  const g = tex.getContext();
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  g.fillStyle = '#57544c'; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 260; i++) {                               // moucheture
    g.fillStyle = rnd() < 0.5 ? 'rgba(30,28,24,.14)' : 'rgba(150,144,130,.12)';
    g.fillRect(rnd() * 512, rnd() * 512, 2 + rnd() * 7, 2 + rnd() * 5);
  }
  g.fillStyle = 'rgba(22,20,18,.5)';                            // joints sciés
  g.fillRect(0, 170, 512, 2); g.fillRect(0, 340, 512, 2); g.fillRect(255, 0, 2, 512);
  g.strokeStyle = 'rgba(28,26,22,.45)'; g.lineWidth = 1;        // fissures fines
  for (let i = 0; i < 7; i++) {
    let x = rnd() * 512, y = rnd() * 512;
    g.beginPath(); g.moveTo(x, y);
    for (let s = 0; s < 9; s++) { x += (rnd() - 0.5) * 46; y += (rnd() - 0.5) * 46; g.lineTo(x, y); }
    g.stroke();
  }
  // taches d'huile — côté établi (v=1, haut du canvas) et milieu
  for (const [x, y, r] of [[300, 70, 58], [210, 120, 34], [380, 150, 26], [140, 330, 40], [260, 430, 30]]) {
    const rg = g.createRadialGradient(x, y, 3, x, y, r);
    rg.addColorStop(0, 'rgba(16,13,9,.62)'); rg.addColorStop(0.7, 'rgba(20,16,11,.3)');
    rg.addColorStop(1, 'rgba(20,16,11,0)');
    g.fillStyle = rg; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }
  // bandes de roulage + usure lustrée devant la porte (v=0, bas du canvas)
  g.fillStyle = 'rgba(28,25,21,.15)';
  g.fillRect(196, 140, 26, 372); g.fillRect(292, 140, 26, 372);
  const wg = g.createLinearGradient(0, 512, 0, 380);
  wg.addColorStop(0, 'rgba(196,188,170,.3)'); wg.addColorStop(1, 'rgba(196,188,170,0)');
  g.fillStyle = wg; g.fillRect(96, 380, 320, 132);
  tex.update();
  return tex;
}

/* ---- plâtre fatigué : marbrures, coulures, remontée d'humidité ---- */
function plasterTexture(scene) {
  const tex = new DynamicTexture('gPlaster', 512, scene, true);
  const g = tex.getContext();
  let seed = 23;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  g.fillStyle = '#8a8176'; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 46; i++) {                                // marbrures
    const x = rnd() * 512, y = rnd() * 512, r = 18 + rnd() * 52;
    const rg = g.createRadialGradient(x, y, 2, x, y, r);
    const c = rnd() < 0.5 ? '176,166,148' : '92,84,72';
    rg.addColorStop(0, `rgba(${c},.16)`); rg.addColorStop(1, `rgba(${c},0)`);
    g.fillStyle = rg; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }
  g.fillStyle = 'rgba(78,70,58,.18)';                           // coulures
  for (let i = 0; i < 14; i++) {
    const x = rnd() * 512, y = rnd() * 200;
    g.fillRect(x, y, 1 + rnd() * 2, 40 + rnd() * 120);
  }
  const dg = g.createLinearGradient(0, 396, 0, 512);            // humidité au pied
  dg.addColorStop(0, 'rgba(54,48,40,0)'); dg.addColorStop(1, 'rgba(54,48,40,.4)');
  g.fillStyle = dg; g.fillRect(0, 396, 512, 116);
  g.fillStyle = 'rgba(40,34,28,.3)';                            // éraflures
  for (let i = 0; i < 9; i++) g.fillRect(rnd() * 512, 420 + rnd() * 80, 14 + rnd() * 40, 2);
  tex.update();
  return tex;
}

/* ---- bois massif de l'établi ---- */
function woodTexture(scene) {
  const tex = new DynamicTexture('gWood', 256, scene, true);
  const g = tex.getContext();
  let seed = 31;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  g.fillStyle = '#6b4a2e'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 120; i++) {                               // fil du bois
    g.fillStyle = rnd() < 0.5 ? 'rgba(40,24,12,.25)' : 'rgba(150,108,62,.18)';
    g.fillRect(rnd() * 256, rnd() * 256, 30 + rnd() * 140, 1 + rnd() * 2);
  }
  for (let i = 0; i < 4; i++) {                                 // nœuds
    const x = rnd() * 256, y = rnd() * 256;
    g.strokeStyle = 'rgba(36,20,10,.5)'; g.lineWidth = 2;
    g.beginPath(); g.arc(x, y, 4 + rnd() * 5, 0, 7); g.stroke();
  }
  tex.update();
  return tex;
}

/* ---- mur d'outils : panneau perforé, silhouettes peintes ---- */
function pegboardTexture(scene) {
  const tex = new DynamicTexture('gPegboard', { width: 512, height: 256 }, scene, true);
  const g = tex.getContext();
  let seed = 13;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  g.fillStyle = '#75603f'; g.fillRect(0, 0, 512, 256);
  for (let i = 0; i < 90; i++) {                                // isorel patiné
    g.fillStyle = rnd() < 0.5 ? 'rgba(50,38,22,.12)' : 'rgba(150,128,90,.1)';
    g.fillRect(rnd() * 512, rnd() * 256, 4 + rnd() * 16, 2 + rnd() * 6);
  }
  g.fillStyle = 'rgba(44,32,20,.55)';                           // perforations
  for (let y = 12; y < 256; y += 20) {
    for (let x = 12; x < 512; x += 20) {
      g.beginPath(); g.arc(x, y, 2.2, 0, 7); g.fill();
    }
  }
  // silhouettes d'outils peintes à la crème (le rangement de L'Atelier)
  const tool = (x, y, a, draw) => {
    g.save(); g.translate(x, y); g.rotate(a);
    g.fillStyle = 'rgba(230,218,188,.5)'; draw(); g.restore();
  };
  tool(66, 122, -0.35, () => {                                  // clé plate
    g.fillRect(-5, -50, 10, 100);
    g.beginPath(); g.arc(0, -56, 15, 0, 7); g.arc(0, 56, 15, 0, 7); g.fill();
  });
  tool(150, 122, 0.12, () => {                                  // marteau
    g.fillRect(-4, -22, 8, 92); g.fillRect(-26, -40, 52, 20);
  });
  tool(232, 128, -0.08, () => {                                 // pince
    g.fillRect(-11, -4, 8, 64); g.fillRect(3, -4, 8, 64);
    g.beginPath(); g.arc(0, -16, 13, 0, 7); g.fill();
  });
  tool(306, 116, 0.05, () => {                                  // tournevis
    g.fillRect(-3, -12, 6, 60); g.fillRect(-7, -40, 14, 30);
  });
  tool(348, 122, -0.05, () => {                                 // le petit
    g.fillRect(-2, -8, 4, 44); g.fillRect(-5, -30, 10, 24);
  });
  tool(438, 130, 0.08, () => {                                  // scie égoïne
    g.beginPath(); g.moveTo(-40, -28); g.lineTo(46, -28); g.lineTo(46, 8); g.closePath(); g.fill();
    g.fillRect(-60, -38, 20, 26);
  });
  g.strokeStyle = 'rgba(40,30,18,.5)'; g.lineWidth = 4;         // cadre
  g.strokeRect(2, 2, 508, 252);
  tex.update();
  return tex;
}

/* ---- l'affiche fondatrice : une route qui serpente vers un soleil bas ---- */
function posterTexture(scene) {
  const tex = new DynamicTexture('gPoster', { width: 384, height: 512 }, scene, true);
  const g = tex.getContext();
  g.fillStyle = '#ded0b0'; g.fillRect(0, 0, 384, 512);          // papier
  // ciel du soir (la palette du dôme, en peinture)
  const sky = g.createLinearGradient(0, 16, 0, 300);
  sky.addColorStop(0, '#16203a'); sky.addColorStop(0.45, '#2a3348');
  sky.addColorStop(0.8, '#c8865a'); sky.addColorStop(1, '#e8a25c');
  g.fillStyle = sky; g.fillRect(16, 16, 352, 284);
  const halo = g.createRadialGradient(192, 296, 6, 192, 296, 90);
  halo.addColorStop(0, 'rgba(255,220,164,.9)'); halo.addColorStop(1, 'rgba(255,220,164,0)');
  g.fillStyle = halo; g.fillRect(102, 206, 180, 94);
  g.fillStyle = '#ffdca4';                                      // le soleil bas
  g.beginPath(); g.arc(192, 296, 40, Math.PI, 0); g.fill();
  g.fillStyle = '#222a3c';                                      // crêtes
  g.beginPath(); g.moveTo(16, 300); g.lineTo(78, 252); g.lineTo(140, 300); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(240, 300); g.lineTo(316, 240); g.lineTo(368, 300); g.closePath(); g.fill();
  const gr = g.createLinearGradient(0, 300, 0, 456);            // plaine du soir
  gr.addColorStop(0, '#4a3640'); gr.addColorStop(1, '#26202c');
  g.fillStyle = gr; g.fillRect(16, 300, 352, 156);
  // la route serpente jusqu'au soleil
  g.fillStyle = '#2e2a30';
  let px1 = 0, px2 = 0, py = 0;
  for (let i = 0; i <= 36; i++) {
    const t = i / 36;
    const w = 2 + 92 * Math.pow(1 - t, 1.8);
    const cx = 192 + Math.sin(t * 5.2) * 56 * (1 - t);
    const cy = 456 - t * 160;
    if (i > 0) {
      g.beginPath(); g.moveTo(px1, py); g.lineTo(px2, py);
      g.lineTo(cx + w, cy); g.lineTo(cx - w, cy); g.closePath(); g.fill();
    }
    px1 = cx - w; px2 = cx + w; py = cy;
  }
  g.fillStyle = 'rgba(238,228,200,.75)';                        // l'axe peint
  for (let i = 1; i < 36; i += 3) {
    const t = i / 36;
    const cx = 192 + Math.sin(t * 5.2) * 56 * (1 - t);
    g.fillRect(cx - 1.5 * (1 - t), 456 - t * 160, 3 * (1 - t) + 0.6, 9 * (1 - t) + 1);
  }
  g.fillStyle = '#141a22';                                      // pins en amorce
  g.beginPath(); g.moveTo(16, 456); g.lineTo(50, 356); g.lineTo(88, 456); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(316, 456); g.lineTo(346, 372); g.lineTo(368, 456); g.closePath(); g.fill();
  // le titre, peint comme le lettrage du van
  g.textAlign = 'center';
  g.font = '700 44px Georgia, serif';
  g.fillStyle = 'rgba(30,16,10,.6)'; g.fillText('UN JOUR,', 195, 87);
  g.fillStyle = '#f0e4c4'; g.fillText('UN JOUR,', 192, 84);
  g.font = '700 58px Georgia, serif';
  g.fillStyle = 'rgba(30,16,10,.6)'; g.fillText('LA ROUTE', 195, 151);
  g.fillStyle = '#f0e4c4'; g.fillText('LA ROUTE', 192, 148);
  g.font = 'italic 20px Georgia, serif';
  g.fillStyle = '#6a5638'; g.fillText('— garage moderne —', 192, 490);
  g.fillStyle = 'rgba(120,100,70,.22)'; g.fillRect(16, 258, 352, 3); // pli
  g.fillStyle = 'rgba(235,230,210,.6)';                         // scotch jauni
  g.fillRect(6, 8, 52, 18); g.fillRect(326, 8, 52, 18);
  tex.update();
  return tex;
}

/* ---- enseigne de façade ---- */
function signTexture(scene) {
  const tex = new DynamicTexture('gSign', { width: 512, height: 64 }, scene, true);
  const g = tex.getContext();
  let seed = 53;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  g.fillStyle = '#42352a'; g.fillRect(0, 0, 512, 64);
  for (let i = 0; i < 40; i++) {
    g.fillStyle = rnd() < 0.5 ? 'rgba(24,16,10,.3)' : 'rgba(120,96,66,.2)';
    g.fillRect(rnd() * 512, rnd() * 64, 10 + rnd() * 50, 1 + rnd() * 2);
  }
  g.strokeStyle = 'rgba(222,208,178,.7)'; g.lineWidth = 2;
  g.strokeRect(5, 5, 502, 54);
  g.textAlign = 'center'; g.font = '700 40px Georgia, serif';
  g.fillStyle = 'rgba(16,10,6,.6)'; g.fillText('GARAGE MODERNE', 258, 46);
  g.fillStyle = '#e8ddc0'; g.fillText('GARAGE MODERNE', 256, 44);
  tex.update();
  return tex;
}

/* ---- panneau de porte : tôle nervurée crème, patinée ---- */
function panelTexture(scene) {
  const tex = new DynamicTexture('gPanel', { width: 512, height: 64 }, scene, true);
  const g = tex.getContext();
  let seed = 67;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  g.fillStyle = '#cfc7ae'; g.fillRect(0, 0, 512, 64);
  for (let i = 0; i < 80; i++) {                                // salissures
    g.fillStyle = rnd() < 0.5 ? 'rgba(110,100,80,.16)' : 'rgba(235,230,214,.14)';
    g.fillRect(rnd() * 512, rnd() * 64, 2 + rnd() * 6, 6 + rnd() * 30);
  }
  g.fillStyle = 'rgba(40,32,24,.55)';                           // nervures
  g.fillRect(0, 2, 512, 2); g.fillRect(0, 60, 512, 2);
  g.fillStyle = 'rgba(255,250,235,.28)'; g.fillRect(0, 29, 512, 2);
  g.fillStyle = 'rgba(60,50,38,.3)'; g.fillRect(0, 33, 512, 2);
  g.fillStyle = 'rgba(74,34,16,.45)';                           // rouille au bas
  for (let i = 0; i < 12; i++) {
    g.beginPath(); g.arc(rnd() * 512, 50 + rnd() * 12, 1 + rnd() * 3, 0, 7); g.fill();
  }
  tex.update();
  return tex;
}

export function buildGarage(scene, shadows) {
  const Y = GARAGE.y, Z0 = GARAGE.z0, Z1 = GARAGE.z1 - 0.5;
  const ZC = (Z0 + Z1) / 2;
  const root = new TransformNode('garage', scene);
  root.position.y = Y;                               // le sol du bâtiment

  /* ---- matériaux (6 lumières simultanées : soleil + ambiance + 2 spots
   * + doorGlow — le plafond StandardMaterial est à 4 par défaut) ---- */
  const mat = (name, diff, spec, pow) => {
    const m = new StandardMaterial(name, scene);
    if (diff) m.diffuseColor = diff;
    m.specularColor = spec || new Color3(0.04, 0.04, 0.04);
    if (pow) m.specularPower = pow;
    m.maxSimultaneousLights = 6;
    return m;
  };
  const concrete = mat('gConcreteM', null, new Color3(0.07, 0.07, 0.07), 24);
  concrete.diffuseTexture = concreteTexture(scene);
  const plaster = mat('gPlasterM');
  plaster.diffuseTexture = plasterTexture(scene);
  const wood = mat('gWoodM', null, new Color3(0.06, 0.05, 0.04), 24);
  wood.diffuseTexture = woodTexture(scene);
  const roofM = mat('gRoofM', new Color3(0.22, 0.21, 0.2));
  const dark = mat('gDarkM', new Color3(0.1, 0.1, 0.11));
  const metal = mat('gMetalM', new Color3(0.3, 0.31, 0.33), new Color3(0.5, 0.5, 0.52), 64);
  const doorM = mat('gDoorM', null, new Color3(0.18, 0.17, 0.15), 32);
  doorM.diffuseTexture = panelTexture(scene);
  const olive = mat('gOliveM', new Color3(0.24, 0.3, 0.18));
  const brique = mat('gBriqueM', new Color3(0.5, 0.24, 0.16));
  const rag = mat('gRagM', new Color3(0.62, 0.55, 0.42));
  const tire = mat('gTireM', new Color3(0.09, 0.09, 0.1));
  const shadeM = mat('gShadeM', new Color3(0.4, 0.55, 0.48), new Color3(0.4, 0.42, 0.4), 48);
  shadeM.backFaceCulling = false;
  shadeM.emissiveColor = new Color3(0.09, 0.07, 0.04);
  const bulbM = mat('gBulbM', new Color3(0.4, 0.34, 0.22));
  bulbM.emissiveColor = new Color3(1, 0.78, 0.45);
  const btnM = mat('gBtnM', new Color3(0.6, 0.12, 0.08));
  btnM.emissiveColor = new Color3(0.22, 0.03, 0.02);
  const ledM = mat('gLedM', new Color3(0.1, 0.08, 0.08));
  ledM.emissiveColor = new Color3(0.85, 0.12, 0.08);            // rouge : fermée
  const signM = mat('gSignM');
  signM.diffuseTexture = signTexture(scene);
  signM.emissiveColor = new Color3(0.16, 0.13, 0.09);           // lisible au soir
  const paperM = mat('gPaperM');
  paperM.diffuseTexture = posterTexture(scene);
  paperM.emissiveColor = new Color3(0.06, 0.05, 0.04);
  const pegM = mat('gPegM');
  pegM.diffuseTexture = pegboardTexture(scene);

  /* ---- coquille : façade percée, fond, flancs, toit ---- */
  const statics = [];
  const box = (name, w, h, d, x, y, z, m) => {
    const b = MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, scene);
    b.position.set(x, y, z); b.material = m; b.parent = root;
    statics.push(b);
    return b;
  };
  const cyl = (name, dia, h, x, y, z, m) => {
    const c = MeshBuilder.CreateCylinder(name, { diameter: dia, height: h, tessellation: 14 }, scene);
    c.position.set(x, y, z); c.material = m; c.parent = root;
    statics.push(c);
    return c;
  };
  const casters = [];
  const wall = (name, w, h, d, x, y, z, m) => {
    const b = box(name, w, h, d, x, y, z, m);
    casters.push(b);
    return b;
  };
  const zF = Z0 + TH / 2;
  wall('gPilierG', 1.85, WALL_H, TH, -3.525, WALL_H / 2, zF, plaster);
  wall('gPilierD', 1.85, WALL_H, TH, 3.525, WALL_H / 2, zF, plaster);
  wall('gLinteau', DOOR_W + 0.3, WALL_H - DOOR_H, TH, 0, (WALL_H + DOOR_H) / 2, zF, plaster);
  wall('gFond', 8.9, WALL_H, TH, 0, WALL_H / 2, Z1 - TH / 2, plaster);
  wall('gFlancG', TH, WALL_H, Z1 - Z0, -X_HALF + TH / 2, WALL_H / 2, ZC, plaster);
  wall('gFlancD', TH, WALL_H, Z1 - Z0, X_HALF - TH / 2, WALL_H / 2, ZC, plaster);
  wall('gToit', X_HALF * 2 + 0.6, 0.16, Z1 - Z0 + 0.6, 0, WALL_H + 0.08, ZC, roofM);

  // dalle 7 cm au-dessus du terrain : le patch de déformation (soulevé de
  // 1,5 cm, zOffset -2) ne peut jamais percer le béton
  const floor = MeshBuilder.CreateGround('gSol', { width: X_HALF * 2, height: Z1 - Z0 }, scene);
  floor.position.set(0, 0.07, ZC);
  floor.material = concrete; floor.parent = root;
  statics.push(floor);

  // enseigne sur le linteau (face avant d'un plan = -z : déjà vers la route)
  const sign = MeshBuilder.CreatePlane('gEnseigne', { width: 3.2, height: 0.4 }, scene);
  sign.position.set(0, 3.7, Z0 - 0.04);
  sign.material = signM; sign.parent = root;
  statics.push(sign);

  /* ---- porte sectionnelle : rails + 8 panneaux ---- */
  box('gRailG', 0.08, 3.55, 0.1, -2.66, 1.795, Z0 + 0.41, dark);
  box('gRailD', 0.08, 3.55, 0.1, 2.66, 1.795, Z0 + 0.41, dark);
  box('gRailPlafG', 0.08, 0.06, 4.2, -2.66, Q_BEND + BEND_R - 0.06, Z0 + 2.7, dark);
  box('gRailPlafD', 0.08, 0.06, 4.2, 2.66, Q_BEND + BEND_R - 0.06, Z0 + 2.7, dark);

  const doorRoot = new TransformNode('gPorte', scene);
  doorRoot.parent = root;
  doorRoot.position.set(0, 0.02, Z0 + 0.36);         // en retrait dans l'ouverture
  const panels = [];
  for (let i = 0; i < N_PAN; i++) {
    const m = MeshBuilder.CreateBox('gPanneau' + i, { width: DOOR_W, height: P_H, depth: P_T }, scene);
    m.material = doorM; m.parent = doorRoot;
    casters.push(m);
    // base : position sur le rail à la fermeture ; dly : le panneau du haut part
    // le premier — les écarts ne font que s'ouvrir, jamais se chevaucher
    panels.push({ mesh: m, base: P_H / 2 + i * P_H, dly: (N_PAN - 1 - i) * DLY });
  }

  /* ---- bouton sur le pilier intérieur droit, à 1,25 m ---- */
  const BTN_X = 2.95, BTN_Z = Z0 + TH + 0.065;
  box('gBtnBoite', 0.2, 0.3, 0.06, BTN_X, 1.25, Z0 + TH + 0.03, metal);
  const btn = cyl('gBtn', 0.09, 0.06, BTN_X, 1.19, BTN_Z, btnM);
  btn.rotation.x = Math.PI / 2;                      // l'axe vers la pièce
  box('gLed', 0.05, 0.035, 0.02, BTN_X, 1.34, Z0 + TH + 0.062, ledM);

  /* ---- L'Atelier, reconstruit ---- */
  // l'établi massif contre le mur du fond
  const bx = -0.6, bz = Z1 - 0.78;
  casters.push(box('gEtabli', 2.9, 0.1, 0.85, bx, 0.98, bz, wood));
  for (const [lx, lz] of [[-1.34, -0.34], [1.34, -0.34], [-1.34, 0.34], [1.34, 0.34]]) {
    casters.push(box('gPied' + lx + lz, 0.11, 0.93, 0.11, bx + lx, 0.465, bz + lz, wood));
  }
  box('gEtagBas', 2.7, 0.05, 0.68, bx, 0.32, bz, wood);
  // l'étau au bout du plateau
  box('gEtauBase', 0.16, 0.1, 0.16, bx + 1.15, 1.08, bz - 0.12, metal);
  box('gEtauMors1', 0.2, 0.12, 0.07, bx + 1.15, 1.19, bz - 0.2, metal);
  box('gEtauMors2', 0.2, 0.12, 0.07, bx + 1.15, 1.19, bz - 0.05, metal);
  const man = cyl('gEtauManche', 0.02, 0.26, bx + 1.15, 1.27, bz - 0.24, metal);
  man.rotation.z = Math.PI / 2;
  // bidons, chiffon
  cyl('gBidonE1', 0.17, 0.3, bx - 1.1, 1.18, bz + 0.08, olive);
  cyl('gBidonE2', 0.12, 0.22, bx - 0.82, 1.14, bz - 0.14, brique);
  box('gChiffon', 0.34, 0.03, 0.24, bx - 0.3, 1.045, bz - 0.2, rag);
  // le mur d'outils au-dessus de l'établi
  const tools = MeshBuilder.CreatePlane('gOutils', { width: 2.6, height: 1.3 }, scene);
  tools.position.set(bx, 2.4, Z1 - TH - 0.01);
  tools.material = pegM; tools.parent = root;
  statics.push(tools);
  // l'affiche fondatrice sur le flanc gauche
  const aff = MeshBuilder.CreatePlane('gAffiche', { width: 0.92, height: 1.24 }, scene);
  aff.position.set(-X_HALF + TH + 0.01, 2.05, 36.2);
  aff.rotation.y = -Math.PI / 2;                     // face vers +x, la pièce
  aff.material = paperM; aff.parent = root;
  statics.push(aff);
  // pile de trois pneus dans le coin
  for (let i = 0; i < 3; i++) {
    const t = MeshBuilder.CreateTorus('gPneu' + i, { diameter: 0.78, thickness: 0.26, tessellation: 16 }, scene);
    t.position.set(-3.62 + (i % 2) * 0.07, 0.14 + i * 0.27, 40.3 + (i % 2) * 0.06);
    t.rotation.y = i * 0.9;
    t.material = tire; t.parent = root;
    statics.push(t); casters.push(t);
  }
  // l'étagère du flanc droit et ses bidons
  casters.push(box('gEtagere', 1.7, 0.05, 0.34, 4.11, 1.72, 38.6, wood));
  box('gEquerre1', 0.05, 0.24, 0.28, 4.18, 1.56, 37.95, dark);
  box('gEquerre2', 0.05, 0.24, 0.28, 4.18, 1.56, 39.25, dark);
  cyl('gBidonR1', 0.16, 0.26, 4.1, 1.875, 38.1, olive);
  cyl('gBidonR2', 0.13, 0.2, 4.12, 1.845, 38.55, brique);
  box('gCaisse', 0.18, 0.14, 0.12, 4.1, 1.815, 39.0, dark);

  /* ---- lumière : 2 suspensions tungstène + le jour qui entre ---- */
  for (const lz of [37.0, 40.0]) {
    cyl('gCordon' + lz, 0.02, 0.58, 0, 3.61, lz, dark);
    const shade = MeshBuilder.CreateCylinder('gAbat' + lz,
      { diameterTop: 0.13, diameterBottom: 0.52, height: 0.24, tessellation: 18, cap: 0 }, scene);
    shade.position.set(0, 3.2, lz);
    shade.material = shadeM; shade.parent = root;
    statics.push(shade);
    const bulb = MeshBuilder.CreateSphere('gAmpoule' + lz, { diameter: 0.1, segments: 8 }, scene);
    bulb.position.set(0, 3.1, lz);
    bulb.material = bulbM; bulb.parent = root;
    statics.push(bulb);
    const spot = new SpotLight('gSpot' + lz, new Vector3(0, 3.02, lz), new Vector3(0, -1, 0), 2.2, 2, scene);
    spot.diffuse = new Color3(1, 0.62, 0.3);
    spot.specular = new Color3(0.35, 0.25, 0.15);
    spot.range = 12;
    spot.intensity = 13;
    spot.parent = root;
  }
  const glow = new PointLight('doorGlow', new Vector3(0, 1.5, Z0 + 1.1), scene);
  glow.diffuse = new Color3(1, 0.72, 0.45);
  glow.specular = new Color3(0.2, 0.15, 0.1);
  glow.range = 9;
  glow.intensity = 0;                                // = doorFrac × 8
  glow.parent = root;

  /* ---- ombres et gel du statique ---- */
  for (const m of casters) { shadows.addShadowCaster(m); m.receiveShadows = true; }
  for (const m of statics) m.receiveShadows = true;
  root.freezeWorldMatrix();
  doorRoot.freezeWorldMatrix();                      // les panneaux bougent, pas lui
  for (const m of statics) m.freezeWorldMatrix();

  /* ---- animation de la porte (aucune allocation par frame) ---- */
  let target = 0, p = 0, ef = 0, lastEf = -1;
  function toggleDoor() { target = target > 0.5 ? 0 : 1; }
  function update(dt) {
    if (p !== target) {
      p = target > p ? Math.min(target, p + dt / DUR) : Math.max(target, p - dt / DUR);
    }
    ef = p * p * (3 - 2 * p);                        // easing global doux
    if (ef === lastEf) return;                       // porte au repos : rien à faire
    lastEf = ef;
    for (let i = 0; i < N_PAN; i++) {
      const pn = panels[i];
      let u = (p - pn.dly) / SPAN;
      u = u < 0 ? 0 : u > 1 ? 1 : u;
      const e = u * u * (3 - 2 * u);                 // départ/arrivée amortis
      const q = pn.base + LIFT * e;                  // abscisse sur le rail
      const m = pn.mesh;
      if (q <= Q_BEND) {                             // montée verticale
        m.position.y = q; m.position.z = 0; m.rotation.x = 0;
      } else if (q <= Q_BEND + ARC) {                // le virage : bascule
        const a = (q - Q_BEND) / BEND_R;
        m.rotation.x = a;
        m.position.y = Q_BEND + Math.sin(a) * BEND_R;
        m.position.z = (1 - Math.cos(a)) * BEND_R;
      } else {                                       // à plat sous le plafond
        m.rotation.x = Math.PI / 2;
        m.position.y = Q_BEND + BEND_R;
        m.position.z = BEND_R + (q - Q_BEND - ARC);
      }
    }
    glow.intensity = ef * 8;                         // le jour entre avec la porte
    const gOn = ef > 0.02;                           // éteinte, elle libère le quota
    if (glow.isEnabled() !== gOn) glow.setEnabled(gOn);
    ledM.emissiveColor.set(0.85 - 0.7 * ef, 0.12 + 0.68 * ef, 0.08 + 0.2 * ef);
  }
  update(0);                                         // pose fermée avant la 1re frame

  /* ---- colliders : murs en segments (l'ouverture reste franche) ; la porte
   * est le DERNIER AABB, marqué door — actif seulement si doorBlocked() ---- */
  const colliders = [
    { x0: -X_HALF, x1: -2.6, z0: Z0, z1: Z0 + TH },  // façade gauche
    { x0: 2.6, x1: X_HALF, z0: Z0, z1: Z0 + TH },    // façade droite
    { x0: -X_HALF, x1: X_HALF, z0: Z1 - TH, z1: Z1 },// fond
    { x0: -X_HALF, x1: -X_HALF + TH, z0: Z0, z1: Z1 },// flanc gauche
    { x0: X_HALF - TH, x1: X_HALF, z0: Z0, z1: Z1 }, // flanc droit
    { x0: -2.05, x1: 0.85, z0: 40.25, z1: Z1 - TH }, // établi
    { x0: -4.3, x1: -3.15, z0: 39.85, z1: 40.85 },   // pile de pneus
    { x0: -2.6, x1: 2.6, z0: Z0, z1: Z0 + 0.45, door: true },
  ];
  const isInterior = (x, z) => x > -X_HALF && x < X_HALF && z > Z0 && z < Z1;

  return {
    doorFrac: () => ef,
    toggleDoor,
    buttonWorld: { x: BTN_X, z: BTN_Z },
    colliders,
    doorBlocked: () => ef < 0.75,
    isInterior,
    update,
  };
}
