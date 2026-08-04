/**
 * La vie ambiante — ce qui bouge dans la forêt sans qu'on le provoque.
 * Chevreuils qui broutent et détalent, vols d'oiseaux très haut, moucherons
 * qui tournoient à hauteur d'homme, pollen dans la lumière rasante, et
 * chauves-souris à la nuit tombée. Tout est en pools pré-alloués, tout
 * apparaît et disparaît en fondu, jamais en pop.
 * (Les oiseaux effarouchés par le klaxon sont dans horn.js ; ici c'est la
 * vie de fond, celle qui tourne en permanence.)
 */
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { ParticleSystem } from '@babylonjs/core/Particles/particleSystem.js';

const N_DEER = 2, N_BIRD = 14, N_BAT = 5;

/** point lumineux doux, pour le pollen et les moucherons */
function moteTexture(scene, name) {
  const tex = new DynamicTexture(name, 32, scene, false);
  const g = tex.getContext();
  const gr = g.createRadialGradient(16, 16, 0.5, 16, 16, 15);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.35, 'rgba(255,255,255,.5)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.beginPath(); g.arc(16, 16, 15, 0, 7); g.fill();
  tex.update(); tex.hasAlpha = true;
  return tex;
}

/** un chevreuil low-poly : corps, cou, tête, quatre pattes, deux oreilles */
function buildDeer(scene, mats, antlers) {
  const root = new TransformNode('deer', scene);
  const box = (n, w, h, d, x, y, z, m, parent) => {
    const b = MeshBuilder.CreateBox(n, { width: w, height: h, depth: d }, scene);
    b.position.set(x, y, z); b.material = m; b.parent = parent || root;
    b.isPickable = false;
    return b;
  };
  box('dBody', 0.34, 0.42, 1.02, 0, 0.78, 0, mats.coat);
  box('dRump', 0.3, 0.3, 0.16, 0, 0.84, -0.55, mats.pale);      // le miroir blanc
  const neck = new TransformNode('dNeck', scene);
  neck.parent = root; neck.position.set(0, 0.92, 0.42);
  neck.rotation.x = -0.55;
  box('dNeckM', 0.19, 0.46, 0.19, 0, 0.2, 0, mats.coat, neck);
  const head = new TransformNode('dHead', scene);
  head.parent = neck; head.position.set(0, 0.44, 0);
  head.rotation.x = 0.55;
  box('dHeadM', 0.16, 0.16, 0.34, 0, 0.03, 0.1, mats.coat, head);
  box('dSnout', 0.1, 0.09, 0.12, 0, -0.01, 0.28, mats.dark, head);
  box('dEarL', 0.04, 0.13, 0.09, -0.09, 0.11, 0.02, mats.pale, head);
  box('dEarR', 0.04, 0.13, 0.09, 0.09, 0.11, 0.02, mats.pale, head);
  if (antlers) {                                                 // le brocard
    box('dAntL', 0.03, 0.26, 0.03, -0.06, 0.22, 0.02, mats.horn, head);
    box('dAntR', 0.03, 0.26, 0.03, 0.06, 0.22, 0.02, mats.horn, head);
  }
  const legs = [];
  for (const [lx, lz] of [[-0.12, 0.36], [0.12, 0.36], [-0.12, -0.36], [0.12, -0.36]]) {
    const piv = new TransformNode('dLeg', scene);
    piv.parent = root; piv.position.set(lx, 0.62, lz);
    box('dLegM', 0.06, 0.62, 0.07, 0, -0.31, 0, mats.coat, piv);
    legs.push(piv);
  }
  root.scaling.setAll(0.001);                                    // apparaît en fondu
  return { root, neck, head, legs };
}

/** un oiseau : deux ailes qui battent, vu de très loin */
function buildBird(scene, mat) {
  const root = new TransformNode('bird', scene);
  const wing = (sx) => {
    const w = MeshBuilder.CreatePlane('bWing', { width: 0.62, height: 0.16 }, scene);
    // charnière à l'emplanture : on décale la géométrie puis on la cuit
    w.position.x = sx * 0.31;
    w.bakeCurrentTransformIntoVertices();
    w.material = mat; w.parent = root; w.isPickable = false;
    return w;
  };
  const wl = wing(-1), wr = wing(1);
  root.scaling.setAll(0.001);
  return { root, wl, wr };
}

export function createWildlife(scene, refs) {
  const { groundHeight, trunks } = refs;
  const mats = {
    coat: new StandardMaterial('wCoat', scene),
    pale: new StandardMaterial('wPale', scene),
    dark: new StandardMaterial('wDark', scene),
    horn: new StandardMaterial('wHorn', scene),
    bird: new StandardMaterial('wBird', scene),
  };
  mats.coat.diffuseColor = new Color3(0.42, 0.28, 0.16);
  mats.pale.diffuseColor = new Color3(0.78, 0.72, 0.6);
  mats.dark.diffuseColor = new Color3(0.09, 0.07, 0.06);
  mats.horn.diffuseColor = new Color3(0.32, 0.26, 0.16);
  mats.bird.diffuseColor = new Color3(0.07, 0.07, 0.09);
  mats.bird.emissiveColor = new Color3(0.04, 0.04, 0.05);
  for (const k in mats) mats[k].specularColor = new Color3(0.03, 0.03, 0.03);

  let s = 61;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;

  /* ---- chevreuils ---- */
  const deer = [];
  for (let i = 0; i < N_DEER; i++) {
    const d = buildDeer(scene, mats, i === 0);
    deer.push({
      m: d, x: 0, z: 0, yaw: 0, vx: 0, vz: 0, sc: 0,
      // états : 0 broute, 1 relève la tête, 2 marche, 3 fuit
      st: 0, t: 0, phase: rnd() * 6.3, placed: false,
    });
    if (refs.shadows) {
      for (const mesh of d.root.getChildMeshes()) refs.shadows.addShadowCaster(mesh);
    }
  }

  /* ---- oiseaux très haut ---- */
  const birds = [];
  for (let i = 0; i < N_BIRD; i++) {
    const b = buildBird(scene, mats.bird);
    birds.push({ m: b, x: 0, y: 0, z: 0, vx: 0, vz: 0, ph: rnd() * 6.3, sc: 0 });
  }
  let flockDir = rnd() * 6.3, flockT = 0;

  /* ---- chauves-souris ---- */
  const bats = [];
  for (let i = 0; i < N_BAT; i++) {
    const b = buildBird(scene, mats.bird);
    b.root.scaling.setAll(0.001);
    bats.push({ m: b, x: 0, y: 0, z: 0, ph: rnd() * 6.3, sp: 0.7 + rnd() * 0.6, sc: 0 });
  }

  /* ---- pollen et moucherons ---- */
  const moteTex = moteTexture(scene, 'moteTex');
  const pollen = new ParticleSystem('pollen', 110, scene);
  pollen.particleTexture = moteTex;
  pollen.emitter = new Vector3(0, 0, 0);
  pollen.minEmitBox = new Vector3(-15, 0.4, -15);
  pollen.maxEmitBox = new Vector3(15, 7, 15);
  pollen.minLifeTime = 5; pollen.maxLifeTime = 9;
  pollen.minSize = 0.022; pollen.maxSize = 0.055;
  pollen.addColorGradient(0, new Color4(1, 0.96, 0.8, 0));
  pollen.addColorGradient(0.25, new Color4(1, 0.96, 0.8, 0.6));
  pollen.addColorGradient(0.75, new Color4(1, 0.94, 0.76, 0.45));
  pollen.addColorGradient(1, new Color4(1, 0.94, 0.76, 0));
  pollen.minEmitPower = 0.02; pollen.maxEmitPower = 0.14;
  pollen.direction1 = new Vector3(-0.5, -0.1, -0.5);
  pollen.direction2 = new Vector3(0.5, 0.35, 0.5);
  pollen.gravity = new Vector3(0.15, -0.02, 0.11);   // dérive au vent dominant
  pollen.blendMode = ParticleSystem.BLENDMODE_ADD;
  pollen.emitRate = 0;
  pollen.start();

  const gnats = [];
  for (let i = 0; i < 3; i++) {
    const ps = new ParticleSystem('gnats' + i, 26, scene);
    ps.particleTexture = moteTex;
    ps.emitter = new Vector3(0, -100, 0);
    ps.minEmitBox = new Vector3(-0.32, -0.3, -0.32);
    ps.maxEmitBox = new Vector3(0.32, 0.3, 0.32);
    ps.minLifeTime = 1.4; ps.maxLifeTime = 2.2;
    ps.minSize = 0.016; ps.maxSize = 0.03;
    ps.addColorGradient(0, new Color4(0.3, 0.28, 0.2, 0));
    ps.addColorGradient(0.3, new Color4(0.3, 0.28, 0.2, 0.75));
    ps.addColorGradient(1, new Color4(0.28, 0.26, 0.18, 0));
    ps.minEmitPower = 0.25; ps.maxEmitPower = 0.7;
    ps.direction1 = new Vector3(-1, -1, -1);
    ps.direction2 = new Vector3(1, 1, 1);
    ps.blendMode = ParticleSystem.BLENDMODE_STANDARD;
    ps.emitRate = 0;
    ps.start();
    gnats.push({ ps, x: 0, z: 0, y: 0, placed: false });
  }

  let scatterX = 0, scatterZ = 0, scatterT = 1e9;

  /** effarouche la faune proche (klaxon, van qui passe vite) */
  function scatter(x, z) { scatterX = x; scatterZ = z; scatterT = 0; }

  /** repose un chevreuil hors de vue, à 40-60 m */
  function placeDeer(d, px, pz) {
    const a = rnd() * 6.3, r = 40 + rnd() * 20;
    d.x = px + Math.cos(a) * r; d.z = pz + Math.sin(a) * r;
    d.yaw = rnd() * 6.3; d.vx = 0; d.vz = 0; d.st = 0; d.t = 0;
    d.placed = true;
  }

  function update(dt, px, pz, nightFactor) {
    const nf = nightFactor ?? 0;
    scatterT += dt;
    flockT += dt;

    /* --- chevreuils : broutent, relèvent la tête, se déplacent, fuient --- */
    // actifs surtout à l'aube, au crépuscule et la nuit
    const deerWant = 0.35 + 0.65 * Math.min(1, nf * 1.6);
    for (const d of deer) {
      if (!d.placed) placeDeer(d, px, pz);
      const dx = d.x - px, dz = d.z - pz;
      const dist = Math.hypot(dx, dz);
      if (dist > 85) placeDeer(d, px, pz);           // trop loin : on le rapproche

      // effarouchement : le joueur trop près, ou un klaxon récent
      const spooked = dist < 14
        || (scatterT < 0.4 && Math.hypot(d.x - scatterX, d.z - scatterZ) < 30);
      if (spooked && d.st !== 3) { d.st = 3; d.t = 0; }

      d.t += dt;
      if (d.st === 3) {                              // fuite en bondissant
        const fl = Math.max(0.001, dist);
        d.vx += (dx / fl) * 9 * dt; d.vz += (dz / fl) * 9 * dt;
        const sp = Math.hypot(d.vx, d.vz);
        if (sp > 7) { d.vx *= 7 / sp; d.vz *= 7 / sp; }
        if (d.t > 4) { d.st = 0; d.t = 0; }
      } else if (d.st === 0) {                       // broute, tête basse
        d.vx *= Math.max(0, 1 - 4 * dt); d.vz *= Math.max(0, 1 - 4 * dt);
        if (d.t > 3 + rnd() * 4) { d.st = 1; d.t = 0; }
      } else if (d.st === 1) {                       // relève la tête, écoute
        d.vx *= Math.max(0, 1 - 6 * dt); d.vz *= Math.max(0, 1 - 6 * dt);
        if (d.t > 1.6 + rnd() * 2) {
          d.st = 2; d.t = 0; d.yaw = rnd() * 6.3;
        }
      } else {                                       // marche tranquille
        d.vx += Math.sin(d.yaw) * 1.6 * dt; d.vz += Math.cos(d.yaw) * 1.6 * dt;
        const sp = Math.hypot(d.vx, d.vz);
        if (sp > 1.3) { d.vx *= 1.3 / sp; d.vz *= 1.3 / sp; }
        if (d.t > 2 + rnd() * 3) { d.st = 0; d.t = 0; }
      }
      d.x += d.vx * dt; d.z += d.vz * dt;
      const sp = Math.hypot(d.vx, d.vz);
      if (sp > 0.05) d.yaw = Math.atan2(d.vx, d.vz);

      const bound = d.st === 3 ? Math.abs(Math.sin(d.t * 7)) * 0.32 : 0;
      d.m.root.position.set(d.x, groundHeight(d.x, d.z) + bound, d.z);
      d.m.root.rotation.y = d.yaw;
      // le cou plonge pour brouter, se redresse pour écouter
      const want = d.st === 0 ? -0.05 : -0.95;
      d.m.neck.rotation.x += (want - d.m.neck.rotation.x) * Math.min(1, 3 * dt);
      d.m.head.rotation.x = -d.m.neck.rotation.x;
      // pattes : balancier synchronisé sur la vitesse
      d.phase += sp * 3.4 * dt;
      for (let i = 0; i < 4; i++) {
        d.m.legs[i].rotation.x = Math.sin(d.phase + (i % 2 ? Math.PI : 0)) * Math.min(0.7, sp * 0.2);
      }
      // fondu d'échelle : jamais de pop
      const tgt = (dist < 78 ? 1 : 0) * deerWant;
      d.sc += (tgt - d.sc) * Math.min(1, 1.6 * dt);
      d.m.root.scaling.setAll(Math.max(0.001, d.sc));
    }

    /* --- vol d'oiseaux, très haut, de jour --- */
    if (flockT > 26) { flockT = 0; flockDir = rnd() * 6.3; }
    const birdWant = 1 - Math.min(1, nf * 1.5);
    const fdx = Math.sin(flockDir), fdz = Math.cos(flockDir);
    for (let i = 0; i < birds.length; i++) {
      const b = birds[i];
      if (b.sc < 0.01 && birdWant > 0.5) {           // (ré)apparition en amont
        const a = flockDir + Math.PI;
        b.x = px + Math.cos(a) * 150 + (rnd() - 0.5) * 40;
        b.z = pz + Math.sin(a) * 150 + (rnd() - 0.5) * 40;
        b.y = 62 + rnd() * 40;
      }
      b.x += fdx * 8 * dt; b.z += fdz * 8 * dt;
      // formation lâche en V : chaque oiseau tient son rang
      const rank = i - birds.length / 2;
      const tx = px + fdx * 40 - fdz * rank * 3.4 + fdx * Math.abs(rank) * 2.6;
      const tz = pz + fdz * 40 + fdx * rank * 3.4 + fdz * Math.abs(rank) * 2.6;
      b.x += (tx - b.x) * Math.min(1, 0.25 * dt);
      b.z += (tz - b.z) * Math.min(1, 0.25 * dt);
      b.m.root.position.set(b.x, b.y, b.z);
      b.m.root.rotation.y = Math.atan2(fdx, fdz);
      const beat = Math.sin(windPhase(b.ph, 3.1)) * 0.55;
      b.m.wl.rotation.z = beat; b.m.wr.rotation.z = -beat;
      b.ph += dt;
      b.sc += (birdWant - b.sc) * Math.min(1, 0.8 * dt);
      b.m.root.scaling.setAll(Math.max(0.001, b.sc * (1.6 + Math.abs(rank) * 0.05)));
    }

    /* --- chauves-souris : erratiques, à la nuit --- */
    const batWant = Math.min(1, Math.max(0, (nf - 0.6) / 0.25));
    for (const b of bats) {
      b.ph += dt * b.sp;
      // deux sinus incommensurables : une trajectoire qui ne se répète pas
      b.x = px + Math.sin(b.ph * 1.7) * 13 + Math.sin(b.ph * 0.63) * 7;
      b.z = pz + Math.cos(b.ph * 1.3) * 13 + Math.cos(b.ph * 0.41) * 7;
      b.y = groundHeight(b.x, b.z) + 4.5 + Math.sin(b.ph * 2.6) * 1.9;
      b.m.root.position.set(b.x, b.y, b.z);
      b.m.root.rotation.y = b.ph * 1.7;
      const beat = Math.sin(b.ph * 26) * 0.8;        // battement nerveux
      b.m.wl.rotation.z = beat; b.m.wr.rotation.z = -beat;
      b.sc += (batWant - b.sc) * Math.min(1, 1.2 * dt);
      b.m.root.scaling.setAll(Math.max(0.001, b.sc * 0.42));
    }

    /* --- pollen : dense de jour, il matérialise la lumière --- */
    pollen.emitter.set(px, groundHeight(px, pz), pz);
    pollen.emitRate = 22 * (1 - Math.min(1, nf * 1.3));

    /* --- moucherons : nuées ancrées, redéployées quand on s'éloigne --- */
    const gnatWant = 1 - Math.min(1, Math.max(0, (nf - 0.4) / 0.3));
    for (const g of gnats) {
      if (!g.placed || Math.hypot(g.x - px, g.z - pz) > 26) {
        const a = rnd() * 6.3, r = 7 + rnd() * 12;
        g.x = px + Math.cos(a) * r; g.z = pz + Math.sin(a) * r;
        g.y = groundHeight(g.x, g.z) + 1.4 + rnd() * 0.7;
        g.ps.emitter.set(g.x, g.y, g.z);
        g.placed = true;
      }
      g.ps.emitRate = 14 * gnatWant;
    }
  }

  /** petite aide : phase de battement d'aile (plané entre deux séries) */
  function windPhase(p, f) {
    const c = (p * f) % 6.283;
    return c < 4.4 ? c : 4.4;                        // bat, puis plane
  }

  function nightSet() { /* réservé : réglages nocturnes explicites */ }

  return { update, scatter, nightSet };
}
