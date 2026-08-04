/**
 * Interaction 3 — le feu de camp. Un seul foyer : toggleAt() l'allume
 * (installation en ~4 s, les braises précèdent les flammes) ou l'étouffe
 * (~3 s de flammes qui retombent, la fumée traîne ~6 s de plus). TOUT est
 * piloté par UN scalaire d'intensité amorti — emitRates, lumière, émissif
 * des bûches — donc jamais de spawn/despawn sec. Les maillages (bûches,
 * cercle de pierres) sont créés une fois puis déplacés au rallumage ; après
 * extinction ils restent dans le monde, carbonisés. Le sol garde la brûlure
 * via deform.addScorch (canal A du buffer d'état).
 */
import { ParticleSystem } from '@babylonjs/core/Particles/particleSystem.js';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color.js';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { PointLight } from '@babylonjs/core/Lights/pointLight.js';
import { windClock } from '../vegetation/wind.js';

// vent dominant du monde (même direction que la poussière et les pins)
const WIND = { x: 0.81, z: 0.59 };

function flameTexture(scene) {
  const tex = new DynamicTexture('cfFlameTex', 128, scene, true);
  const g = tex.getContext();
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  grad.addColorStop(0, 'rgba(255,240,205,.95)');                // cœur chaud
  grad.addColorStop(0.3, 'rgba(255,175,80,.55)');
  grad.addColorStop(1, 'rgba(255,110,20,0)');
  g.fillStyle = grad;
  g.beginPath(); g.arc(64, 64, 62, 0, 7); g.fill();
  tex.update();
  tex.hasAlpha = true;
  return tex;
}

function smokeTexture(scene) {
  const tex = new DynamicTexture('cfSmokeTex', 128, scene, true);
  const g = tex.getContext();
  const grad = g.createRadialGradient(64, 64, 6, 64, 64, 62);
  grad.addColorStop(0, 'rgba(255,255,255,.7)');
  grad.addColorStop(0.45, 'rgba(255,255,255,.26)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.beginPath(); g.arc(64, 64, 62, 0, 7); g.fill();
  tex.update();
  tex.hasAlpha = true;
  return tex;
}

export function createCampfire(scene, deform, groundHeight) {
  /* ---- maillages : créés une fois, déplacés à chaque rallumage ---- */
  const root = new TransformNode('cfRoot', scene);
  root.setEnabled(false);                             // rien tant qu'aucun feu

  const logMat = new StandardMaterial('cfLogM', scene);
  logMat.diffuseColor = new Color3(0.09, 0.07, 0.055);          // bois carbonisé
  logMat.specularColor = new Color3(0.02, 0.02, 0.02);
  logMat.emissiveColor = new Color3(0, 0, 0);         // mutée chaque frame (braise)
  for (let i = 0; i < 4; i++) {
    const a = i * (Math.PI / 2) + 0.4;
    const log = MeshBuilder.CreateCylinder('cfLog' + i,
      { height: 0.95, diameter: 0.13, tessellation: 7 }, scene);
    log.material = logMat;
    log.parent = root;
    log.isPickable = false;
    log.position.set(Math.sin(a) * 0.16, 0.15 + (i % 2) * 0.05, Math.cos(a) * 0.16);
    log.rotation.y = a;
    log.rotation.x = 1.22 + (i % 2) * 0.12;           // presque couchées, entrecroisées
  }

  const stoneMat = new StandardMaterial('cfStoneM', scene);
  stoneMat.diffuseColor = new Color3(0.33, 0.31, 0.29);
  stoneMat.specularColor = new Color3(0.04, 0.04, 0.04);
  const stones = [];                                  // {mesh, lx, lz} — recalées au sol
  for (let i = 0; i < 6; i++) {
    const a = i * (Math.PI / 3) + 0.26;
    const st = MeshBuilder.CreateSphere('cfStone' + i,
      { diameter: 0.22 + (i % 3) * 0.04, segments: 6 }, scene);
    st.material = stoneMat;
    st.parent = root;
    st.isPickable = false;
    const lx = Math.sin(a) * 0.75, lz = Math.cos(a) * 0.75;
    st.position.set(lx, 0.04, lz);
    st.scaling.y = 0.55;                              // galets écrasés
    st.rotation.y = a * 1.7;
    stones.push({ mesh: st, lx, lz });
  }

  /* ---- particules : démarrées une fois, emitRate = f(intensité) ---- */
  const flameTex = flameTexture(scene);

  const flames = new ParticleSystem('cfFlames', 160, scene);
  flames.particleTexture = flameTex;
  flames.emitter = new Vector3(0, -100, 0);
  flames.minEmitBox = new Vector3(-0.19, 0, -0.19);
  flames.maxEmitBox = new Vector3(0.19, 0.1, 0.19);
  flames.minLifeTime = 0.4; flames.maxLifeTime = 0.7;
  flames.addSizeGradient(0, 0.32);
  flames.addSizeGradient(1, 0.06);                    // la langue s'effile en montant
  flames.addColorGradient(0, new Color4(1, 0.42, 0.08, 0));
  flames.addColorGradient(0.18, new Color4(1, 0.5, 0.1, 0.9));
  flames.addColorGradient(0.55, new Color4(1, 0.82, 0.28, 0.6));
  flames.addColorGradient(1, new Color4(0.7, 0.5, 0.15, 0));
  flames.minEmitPower = 0.9; flames.maxEmitPower = 1.6;
  flames.direction1 = new Vector3(-0.12, 1.2, -0.12);
  flames.direction2 = new Vector3(0.12, 2.0, 0.12);
  flames.gravity = new Vector3(0, 1.4, 0);            // tirage : la flamme accélère
  flames.blendMode = ParticleSystem.BLENDMODE_ADD;
  flames.emitRate = 0;
  flames.start();

  const embers = new ParticleSystem('cfEmbers', 90, scene);
  embers.particleTexture = flameTex;
  embers.emitter = new Vector3(0, -100, 0);
  embers.minEmitBox = new Vector3(-0.14, 0, -0.14);
  embers.maxEmitBox = new Vector3(0.14, 0.15, 0.14);
  embers.minLifeTime = 1.6; embers.maxLifeTime = 2.5;
  embers.minSize = 0.03; embers.maxSize = 0.055;      // points minuscules
  embers.addColorGradient(0, new Color4(1, 0.55, 0.15, 0));
  embers.addColorGradient(0.1, new Color4(1, 0.6, 0.2, 1));
  embers.addColorGradient(0.6, new Color4(1, 0.35, 0.08, 0.8));
  embers.addColorGradient(1, new Color4(0.4, 0.08, 0.02, 0));
  embers.minEmitPower = 0.4; embers.maxEmitPower = 1.1;
  embers.direction1 = new Vector3(-0.25, 1, -0.25);
  embers.direction2 = new Vector3(0.25, 1.8, 0.25);
  embers.gravity = new Vector3(WIND.x * 0.3, 0.55, WIND.z * 0.3);  // montent au vent
  embers.blendMode = ParticleSystem.BLENDMODE_ADD;
  embers.emitRate = 0;
  embers.start();

  const smoke = new ParticleSystem('cfSmoke', 120, scene);
  smoke.particleTexture = smokeTexture(scene);
  smoke.emitter = new Vector3(0, -100, 0);
  smoke.minEmitBox = new Vector3(-0.15, 0, -0.15);
  smoke.maxEmitBox = new Vector3(0.15, 0.2, 0.15);
  smoke.minLifeTime = 3.6; smoke.maxLifeTime = 5.4;
  smoke.addSizeGradient(0, 0.4);
  smoke.addSizeGradient(1, 2.2);                      // la volute gonfle en mourant
  smoke.addColorGradient(0, new Color4(0.22, 0.22, 0.24, 0));
  smoke.addColorGradient(0.15, new Color4(0.22, 0.22, 0.24, 0.24));
  smoke.addColorGradient(0.6, new Color4(0.27, 0.27, 0.29, 0.14));
  smoke.addColorGradient(1, new Color4(0.3, 0.3, 0.32, 0));
  smoke.minEmitPower = 0.25; smoke.maxEmitPower = 0.6;
  smoke.direction1 = new Vector3(-0.15, 0.8, -0.15);
  smoke.direction2 = new Vector3(0.15, 1.2, 0.15);
  smoke.gravity = new Vector3(WIND.x * 0.4, 0.42, WIND.z * 0.4);   // dérive au vent
  smoke.minAngularSpeed = -0.4; smoke.maxAngularSpeed = 0.4;
  smoke.blendMode = ParticleSystem.BLENDMODE_STANDARD;
  smoke.emitRate = 0;
  smoke.start();

  /* ---- lumière chaude, vacillante ---- */
  const light = new PointLight('cfLight', new Vector3(0, 0.6, 0), scene);
  light.parent = root;
  light.diffuse = new Color3(1, 0.55, 0.25);
  light.specular = new Color3(1, 0.6, 0.3);
  light.range = 9;
  light.intensity = 0;
  light.setEnabled(false);
  let lightOn = false;

  /* ---- état (aucune allocation dans update) ---- */
  let lit = false;                                    // le feu est-il commandé allumé
  let fireI = 0;                                      // intensité amortie du feu
  let smokeI = 0;                                     // la fumée traîne derrière
  let burnT = 0;                                      // temps de combustion (brûlure)
  let fx = 0, fz = 0;                                 // position monde du foyer

  function toggleAt(x, z) {
    if (lit) { lit = false; return; }                 // l'agonie commence, rien d'autre
    if (fireI > 0.1) return;                          // laisser mourir avant de rallumer
    fx = x; fz = z;
    const gy = groundHeight(x, z);
    root.position.set(x, gy, z);
    root.setEnabled(true);
    // chaque pierre recalée sur le sol local (le terrain n'est pas plan)
    for (const s of stones) {
      s.mesh.position.y = groundHeight(x + s.lx, z + s.lz) - gy + 0.05;
    }
    flames.emitter.set(x, gy + 0.16, z);
    embers.emitter.set(x, gy + 0.24, z);
    smoke.emitter.set(x, gy + 0.5, z);
    // le sol piétiné autour du foyer, une fois à l'installation
    for (let i = 0; i < 3; i++) {
      deform.addSplat(x + (Math.random() * 0.8 - 0.4),
        z + (Math.random() * 0.8 - 0.4), 0.35, 0.015);
    }
    burnT = 0;
    lit = true;
  }

  function update(dt) {
    // intensité amortie : ~3 constantes de temps pour le fondu complet
    // (montée 4 s, descente 3 s ; la fumée retombe en ~9 s : 3 + 6 de traîne)
    const target = lit ? 1 : 0;
    fireI += (target - fireI) * (1 - Math.exp(-dt * (lit ? 0.75 : 1.0)));
    smokeI += (target - smokeI) * (1 - Math.exp(-dt * (lit ? 0.75 : 0.33)));
    if (!lit && fireI < 0.003) fireI = 0;             // extinction complète, propre
    if (!lit && smokeI < 0.003) smokeI = 0;

    // brûlure du sol : forte les 5 premières secondes, entretien léger ensuite
    if (lit) {
      burnT += dt;
      deform.addScorch(fx, fz, 0.95, (burnT < 5 ? 0.5 : 0.04) * dt);
    }

    // les braises précèdent les flammes (√I démarre plus tôt que I²) :
    // à l'allumage on voit le foyer rougir avant que les flammes prennent
    flames.emitRate = 70 * fireI * fireI;
    embers.emitRate = 14 * Math.sqrt(fireI);
    smoke.emitRate = 9 * smokeI;

    // vacillement : deux sinus non harmoniques sur l'horloge du vent, ±3.5
    const flick = Math.sin(windClock.t * 11.7) * 2.2 + Math.sin(windClock.t * 7.31) * 1.3;
    light.intensity = fireI * (11 + flick);
    const on = fireI > 0.004;
    if (on !== lightOn) { lightOn = on; light.setEnabled(on); }

    // braises dans les bûches : l'émissif respire avec la flamme, puis s'éteint
    const glow = fireI * (0.8 + 0.055 * flick);
    logMat.emissiveColor.copyFromFloats(0.92 * glow, 0.32 * glow, 0.06 * glow);
  }

  return { toggleAt, update, burning: () => lit };
}
