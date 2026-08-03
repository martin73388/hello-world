/**
 * Le conducteur (M4) — mécano en bleu de travail, casquette basse, visage
 * dans l'ombre (le brief : presque rien sur le visage, tout sur le van).
 * Locomotion : balancier de jambes dont l'amplitude et la cadence sont
 * calées sur la vitesse réelle (longueur de foulée = 2·L·sin(A)), donc les
 * pieds se posent au lieu de glisser. Pose assise mains au volant en conduite.
 */
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';

const LEG = 0.84;                      // hanche → sol
const HIP_H = 0.92;

export function buildDriver(scene, shadows) {
  const root = new TransformNode('driver', scene);
  const mat = (r, g, b, name) => {
    const m = new StandardMaterial(name, scene);
    m.diffuseColor = new Color3(r, g, b);
    m.specularColor = new Color3(0.04, 0.04, 0.04);
    return m;
  };
  const suit = mat(0.11, 0.15, 0.3, 'dSuit');          // bleu de travail profond
  const suitD = mat(0.08, 0.11, 0.22, 'dSuitD');       // (le soleil chaud délave)
  const skin = mat(0.68, 0.47, 0.35, 'dSkin');
  const capM = mat(0.32, 0.14, 0.1, 'dCap');
  const boot = mat(0.1, 0.08, 0.07, 'dBoot');

  const meshes = [];
  const box = (name, w, h, d, parent, x, y, z, m) => {
    const b = MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, scene);
    b.position.set(x, y, z); b.material = m; b.parent = parent; meshes.push(b);
    return b;
  };

  const pelvis = new TransformNode('dPelvis', scene);
  pelvis.parent = root; pelvis.position.y = HIP_H;
  box('dHips', 0.36, 0.2, 0.24, pelvis, 0, 0.06, 0, suitD);
  const chest = new TransformNode('dChest', scene);
  chest.parent = pelvis; chest.position.y = 0.18;
  box('dTorso', 0.4, 0.42, 0.25, chest, 0, 0.22, 0, suit);
  box('dBelt', 0.38, 0.05, 0.26, chest, 0, -0.0, 0, boot);
  box('dZip', 0.03, 0.4, 0.012, chest, 0, 0.22, 0.128, suitD);
  // tête : casquette basse, visage sous la visière
  const head = new TransformNode('dHead', scene);
  head.parent = chest; head.position.y = 0.52;
  const skull = MeshBuilder.CreateSphere('dSkull', { diameter: 0.21, segments: 10 }, scene);
  skull.material = skin; skull.parent = head; meshes.push(skull);
  const capTop = MeshBuilder.CreateSphere('dCapTop', { diameter: 0.235, segments: 8, slice: 0.5 }, scene);
  capTop.position.y = 0.025; capTop.material = capM; capTop.parent = head; meshes.push(capTop);
  box('dBrim', 0.2, 0.02, 0.14, head, 0, 0.02, 0.13, capM);

  // membres : pivot en tête de segment (position du maillage décalée)
  const limb = (name, parent, px, py, pz, w, len, m) => {
    const piv = new TransformNode(name, scene);
    piv.parent = parent; piv.position.set(px, py, pz);
    box(name + 'M', w, len, w, piv, 0, -len / 2, 0, m);
    return piv;
  };
  const armL = limb('dArmL', chest, -0.25, 0.4, 0, 0.09, 0.3, suit);
  const armR = limb('dArmR', chest, 0.25, 0.4, 0, 0.09, 0.3, suit);
  const foreL = limb('dForeL', armL, 0, -0.3, 0, 0.075, 0.28, suit);
  const foreR = limb('dForeR', armR, 0, -0.3, 0, 0.075, 0.28, suit);
  box('dHandL', 0.07, 0.08, 0.07, foreL, 0, -0.3, 0, skin);
  box('dHandR', 0.07, 0.08, 0.07, foreR, 0, -0.3, 0, skin);
  const thighL = limb('dThighL', pelvis, -0.11, -0.02, 0, 0.12, 0.42, suit);
  const thighR = limb('dThighR', pelvis, 0.11, -0.02, 0, 0.12, 0.42, suit);
  const shinL = limb('dShinL', thighL, 0, -0.42, 0, 0.1, 0.4, suitD);
  const shinR = limb('dShinR', thighR, 0, -0.42, 0, 0.1, 0.4, suitD);
  box('dFootL', 0.11, 0.07, 0.24, shinL, 0, -0.42, 0.05, boot);
  box('dFootR', 0.11, 0.07, 0.24, shinR, 0, -0.42, 0.05, boot);

  for (const m of meshes) { shadows.addShadowCaster(m); m.receiveShadows = true; }

  let phase = 0, seated = false;
  const S = { armX: 0 };

  function update(dt, speed) {
    if (seated) return;
    const t = performance.now() / 1000;
    if (speed > 0.25) {
      const stride = Math.min(0.85, 0.42 + speed * 0.085);      // foulée réelle
      const A = Math.asin(Math.min(0.92, stride / (2 * LEG)));  // amplitude qui la produit
      phase += (Math.PI * speed / stride) * dt;                 // un pas par demi-période
      const sw = Math.sin(phase);
      thighL.rotation.x = sw * A;
      thighR.rotation.x = -sw * A;
      // genou plié en phase de vol, tendu à l'appui
      shinL.rotation.x = Math.max(0, Math.sin(phase + 1.1)) * (0.5 + speed * 0.07);
      shinR.rotation.x = Math.max(0, Math.sin(phase + Math.PI + 1.1)) * (0.5 + speed * 0.07);
      armL.rotation.x = -sw * A * 0.75;
      armR.rotation.x = sw * A * 0.75;
      foreL.rotation.x = -0.3 - Math.max(0, -sw) * 0.4;
      foreR.rotation.x = -0.3 - Math.max(0, sw) * 0.4;
      pelvis.position.y = HIP_H + Math.abs(Math.cos(phase)) * 0.035 - 0.02;
      chest.rotation.x = 0.05 + speed * 0.014;                  // penché dans l'effort
      chest.rotation.y = sw * 0.06;
    } else {
      // repos : respiration, bras le long du corps
      phase = 0;
      const b = Math.sin(t * 1.7) * 0.015;
      for (const [n, v] of [[thighL, 0], [thighR, 0], [shinL, 0.06], [shinR, 0.06],
        [armL, 0.06], [armR, 0.06]]) n.rotation.x += (v - n.rotation.x) * Math.min(1, 8 * dt);
      foreL.rotation.x += (-0.12 - foreL.rotation.x) * Math.min(1, 8 * dt);
      foreR.rotation.x += (-0.12 - foreR.rotation.x) * Math.min(1, 8 * dt);
      pelvis.position.y = HIP_H + b;
      chest.rotation.x += (0.02 - chest.rotation.x) * Math.min(1, 6 * dt);
      chest.rotation.y *= Math.max(0, 1 - 6 * dt);
    }
  }

  /** assis au volant (parenté dans la caisse du van) ou rendu au monde */
  function setSeated(on, vanBody) {
    seated = on;
    if (on) {
      root.parent = vanBody;
      root.position.set(-0.52, 1.32, 1.72);
      root.rotation.y = 0;
      pelvis.position.y = 0.1;
      thighL.rotation.x = -1.35; thighR.rotation.x = -1.35;
      shinL.rotation.x = 1.35; shinR.rotation.x = 1.35;
      armL.rotation.x = -0.85; armR.rotation.x = -0.85;
      foreL.rotation.x = -0.5; foreR.rotation.x = -0.5;
      chest.rotation.x = 0.06; chest.rotation.y = 0;
    } else {
      root.parent = null;
      pelvis.position.y = HIP_H;
    }
  }

  return { root, update, setSeated };
}
