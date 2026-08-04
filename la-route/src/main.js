/**
 * LA ROUTE — Milestone 1 : Fondation.
 * Boot WebGPU (sans repli), boucle de rendu, caméra épaule + ZQSD sur plan
 * provisoire, overlay de performance (F1). Zéro allocation dans la boucle.
 */
import { WebGPUEngine } from '@babylonjs/core/Engines/webgpuEngine.js';
import { Engine } from '@babylonjs/core/Engines/engine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color.js';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera.js';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight.js';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight.js';
import { CascadedShadowGenerator } from '@babylonjs/core/Lights/Shadows/cascadedShadowGenerator.js';
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent.js';
import { createOverlay } from './ui/overlay.js';
import { createPost } from './post.js';
import { buildTerrain } from './terrain/terrain.js';
import { createDeform } from './terrain/deform.js';
import { height, groundHeight, roadQuery, ROAD_HALF, GARAGE } from './terrain/road.js';
import { buildGarage } from './world/garage.js';
import { plantPines } from './vegetation/pines.js';
import { windClock } from './vegetation/wind.js';
import { buildSky } from './world/sky.js';
import { buildVan } from './vehicle/van.js';
import { createDust } from './vehicle/dust.js';
import { buildDriver } from './character/driver.js';
import { createRain } from './world/rain.js';
import { createCampfire } from './world/campfire.js';
import { createDaycycle } from './world/daycycle.js';
import { createHorn } from './world/horn.js';

const canvas = document.getElementById('rc');
const boot = document.getElementById('boot');

const NOGPU_MSGS = {
  insecure: `WebGPU est masqué hors contexte sécurisé.<br>
    Ouvre la démo via <b>http://localhost:5173</b> (<code>npm run dev</code>) —
    pas en <code>file://</code> ni via une adresse IP du réseau.`,
  noapi: `Ce navigateur n'expose pas WebGPU.<br>
    Mets <b>Chrome à jour</b> (dernière version), puis vérifie
    <code>chrome://gpu</code> → section « WebGPU ».`,
  noadapter: `WebGPU est présent mais <b>aucun adaptateur GPU</b> n'est disponible.<br>
    1. Active l'accélération matérielle : <code>chrome://settings/system</code><br>
    2. Mets les pilotes GPU à jour, puis redémarre Chrome<br>
    3. Le détail est dans <code>chrome://gpu</code> (section WebGPU)`,
  error: `L'initialisation WebGPU a échoué (détail dans la console F12).`,
};
function showNoGpu(reason) {
  boot.style.display = 'none';
  document.getElementById('nogpuMsg').innerHTML = NOGPU_MSGS[reason] || NOGPU_MSGS.error;
  document.getElementById('nogpu').style.display = 'flex';
}
document.getElementById('glBtn').addEventListener('click', () => {
  location.search = '?gl';
});
// « ?gl » : chemin WebGL réservé au DÉVELOPPEMENT (captures d'itération en CI
// sans adaptateur WebGPU). La cible livrée reste WebGPU, sans repli.
const DEV_GL = new URLSearchParams(location.search).has('gl');
(async () => {
  if (DEV_GL) return start();
  if (!navigator.gpu) return showNoGpu(window.isSecureContext ? 'noapi' : 'insecure');
  const adapter = await navigator.gpu.requestAdapter().catch(() => null);
  if (!adapter) return showNoGpu('noadapter');
  return start();
})().catch((e) => { console.error(e); showNoGpu('error'); });

async function start() {
  let engine;
  if (DEV_GL) {
    engine = new Engine(canvas, true);
  } else {
    engine = new WebGPUEngine(canvas, { antialias: true });
    await engine.initAsync();
  }

  const scene = new Scene(engine);
  scene.skipPointerMovePicking = true;               // M8 : aucun picking par survol
  scene.clearColor = new Color4(0.05, 0.07, 0.115, 1);
  scene.fogMode = Scene.FOGMODE_EXP2;
  scene.fogDensity = 0.0105;
  scene.fogColor = new Color3(0.16, 0.17, 0.22);

  // Soleil bas et chaud (heure dorée), ambiance bleutée en contre
  const sun = new DirectionalLight('sun', new Vector3(-0.62, -0.3, -0.75), scene);
  sun.diffuse = new Color3(1.0, 0.66, 0.36);
  sun.intensity = 2.3;
  const amb = new HemisphericLight('amb', new Vector3(0, 1, 0), scene);
  amb.diffuse = new Color3(0.3, 0.4, 0.6);
  amb.groundColor = new Color3(0.17, 0.15, 0.14);
  amb.intensity = 0.72;
  const shadows = new CascadedShadowGenerator(2048, sun);
  shadows.numCascades = 2;
  shadows.shadowMaxZ = 220;
  shadows.lambda = 0.92;
  shadows.stabilizeCascades = true;
  shadows.usePercentageCloserFiltering = true;
  shadows.bias = 0.004;
  shadows.normalBias = 0.03;
  shadows.setDarkness(0.32);

  // Le monde du M2 : terrain sculpté par la route, forêt, ciel
  const sky = buildSky(scene);
  // M3 : buffer d'état de déformation (2048² ≈ 4 cm/texel sur 80 m ; réduit
  // sur le chemin dev WebGL logiciel)
  const deform = createDeform(engine, { res: DEV_GL ? 768 : 2048 });
  const terrain = buildTerrain(scene, shadows, deform.state);
  const pines = plantPines(scene, shadows);
  console.log('pins plantés :', pines.count);

  // M4 : le mécano articulé remplace la capsule, le van attend sur la route
  const garage = buildGarage(scene, shadows);        // M7 : la thèse de la démo
  // sol de MARCHE unifié : dehors le terrain (+ ruban), dedans la dalle béton
  const groundAll = (x, z) => {
    const g = groundHeight(x, z);
    return garage.isInterior(x, z) ? Math.max(g, GARAGE.y + 0.07) : g;
  };
  const driver = buildDriver(scene, shadows);
  const van = buildVan(scene, shadows, groundAll);
  const dust = createDust(scene);                    // M5 : le sillage
  // M6 : les cinq interactions — toutes lisent/écrivent l'état du monde
  const rain = createRain(scene, deform);
  const fire = createCampfire(scene, deform, groundHeight);
  const day = createDaycycle(scene, { sun, amb, sky });
  const horn = createHorn(scene, pines.trunks, groundHeight);

  // obstacles (troncs + rochers) : hachage spatial 4 m pour les collisions
  const OBS = new Map();
  const okey = (cx, cz) => cx * 8192 + cz;
  for (const o of [...pines.trunks, ...terrain.rocks]) {
    const span = Math.ceil((o.r + 1.4) / 4);
    const cx = Math.round(o.x / 4), cz = Math.round(o.z / 4);
    for (let a = -span; a <= span; a++) {
      for (let b = -span; b <= span; b++) {
        const k = okey(cx + a, cz + b);
        if (!OBS.has(k)) OBS.set(k, []);
        OBS.get(k).push(o);
      }
    }
  }
  const pushOut = (x, z, r) => {
    const cell = OBS.get(okey(Math.round(x / 4), Math.round(z / 4)));
    if (!cell) return null;
    for (const o of cell) {
      const dx = x - o.x, dz = z - o.z, rr = r + o.r;
      const d2 = dx * dx + dz * dz;
      if (d2 < rr * rr && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        return { x: o.x + (dx / d) * rr, z: o.z + (dz / d) * rr };
      }
    }
    return null;
  };
  const vanBlocked = (nx, nz) => {
    const c = Math.cos(van.st.yaw), s = Math.sin(van.st.yaw);
    for (const off of [1.6, -1.6]) {
      const ax = nx + s * off, az = nz + c * off;
      if (pushOut(ax, az, 1.02)) return true;
      for (const r of garage.colliders) {
        if (r.door && !garage.doorBlocked()) continue;
        if (ax > r.x0 - 1.02 && ax < r.x1 + 1.02 && az > r.z0 - 1.02 && az < r.z1 + 1.02) return true;
      }
    }
    return false;
  };

  // occlusion caméra : la caméra ne traverse ni troncs, ni van, ni murs.
  // camRects : AABB dynamiques {x0,x1,z0,z1,y1,active} (van, garage M7)
  const camRects = [];
  const vanRect = { x0: 0, x1: 0, z0: 0, z1: 0, y1: 0, active: true };
  camRects.push(vanRect);
  for (const c of garage.colliders) {
    const r = { x0: c.x0, x1: c.x1, z0: c.z0, z1: c.z1, y1: GARAGE.y + 3.9, active: true };
    if (c.door) { r.doorRect = true; }
    camRects.push(r);
  }

  // résolution cercle-AABB : le mécano ne traverse ni murs ni établi
  const rectOut = { x: 0, z: 0 };                    // scratch, zéro alloc
  const resolveRects = (px, pz, r) => {
    let x = px, z = pz;
    for (const c of garage.colliders) {
      if (c.door && !garage.doorBlocked()) continue;
      const nx = Math.max(c.x0, Math.min(c.x1, x));
      const nz = Math.max(c.z0, Math.min(c.z1, z));
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
    rectOut.x = x; rectOut.z = z;
    return rectOut;
  };
  const camClamp = (tx, ty, tz, dx, dyy, dz, want) => {
    const steps = Math.ceil(want / 0.55);
    for (let i = 1; i <= steps; i++) {
      const t = (i / steps) * want;
      const x = tx + dx * t, y = ty + dyy * t, z = tz + dz * t;
      let hit = false;
      const cell = OBS.get(okey(Math.round(x / 4), Math.round(z / 4)));
      if (cell) {
        for (const o of cell) {
          const rr = o.r + 0.22;
          const ddx = x - o.x, ddz = z - o.z;
          if (ddx * ddx + ddz * ddz < rr * rr) { hit = true; break; }
        }
      }
      if (!hit) {
        for (const r of camRects) {
          if (r.active === false) continue;
          if (x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1 && y < r.y1) { hit = true; break; }
        }
      }
      if (hit) return Math.max(0.85, t - 0.35);
    }
    return want;
  };

  const camera = new FreeCamera('cam', new Vector3(0, 2.2, -4), scene);
  camera.minZ = 0.05; camera.maxZ = 800;
  camera.fov = 0.95;
  const post = createPost(scene, camera);            // M7 : chaîne de post

  /* ---- état & scratch (aucune allocation dans la boucle) ---- */
  // M7 : la démo s'ouvre DANS le garage sombre, face à la porte fermée —
  // caméra au fond du bâtiment, regard vers le sud (la porte, puis la route)
  const state = {
    px: -1.6, pz: 37.5, py: GARAGE.y, vx: 0, vz: 0, yaw: Math.PI,
    camYaw: 0, camPitch: 0.14, dist: 4.2, distTarget: 4.2,
    tx: -1.6, ty: GARAGE.y + 1.55, tz: 37.5,
    locked: false, drive: false, distOcc: 4.2,
  };
  let walkDist = 4.2, wheelAcc = 0;
  let shake = 0, prevVanSpeed = 0, prevBodyY = 0;    // secousses caméra

  // aide contextuelle (E) — DOM léger, mis à jour hors alloc
  const hint = document.createElement('div');
  hint.style.cssText = 'position:fixed;left:50%;bottom:9%;transform:translateX(-50%);'
    + 'color:#e8dfc8;font:500 15px system-ui;background:rgba(10,12,16,.55);'
    + 'padding:8px 14px;border-radius:8px;display:none;letter-spacing:.4px;z-index:5';
  document.body.appendChild(hint);
  let hintShown = false, hintText = '';
  const setHint = (text) => {
    if (text !== hintText) { hintText = text; hint.textContent = text; }
    if (!!text !== hintShown) { hintShown = !!text; hint.style.display = text ? 'block' : 'none'; }
  };

  // porte conducteur (côté gauche de la cabine) — scratch réutilisé
  const doorOut = { x: 0, z: 0 };
  const doorWorld = () => {
    const c = Math.cos(van.st.yaw), s = Math.sin(van.st.yaw);
    doorOut.x = van.st.x - 1.35 * c + 1.6 * s;
    doorOut.z = van.st.z + 1.35 * s + 1.6 * c;
    return doorOut;
  };
  // touches 1-5 : la grammaire commune — tout s'installe et se retire en fondu
  addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (e.code === 'Digit1') van.setLights(!van.lightsOn());
    else if (e.code === 'Digit2') rain.toggle();
    else if (e.code === 'Digit3' && !state.drive) {
      // le feu s'installe là où le mécano regarde, jamais sur la chaussée
      const fx = state.px + Math.sin(state.yaw) * 2.0;
      const fz = state.pz + Math.cos(state.yaw) * 2.0;
      if (roadQuery(fx, fz).dist > ROAD_HALF + 0.4) fire.toggleAt(fx, fz);
    } else if (e.code === 'Digit4') day.toggle();
    else if (e.code === 'Digit5') {
      horn.blast(state.drive ? van.st.x : state.px, state.drive ? van.st.z : state.pz);
    }
  });
  addEventListener('keydown', (e) => {
    if (e.code !== 'KeyE') return;
    if (state.drive) {
      if (Math.abs(van.st.speed) > 1.6) return;        // pas en marche
      state.drive = false;
      driver.setSeated(false);
      const d = doorWorld();
      state.px = d.x; state.pz = d.z; state.vx = 0; state.vz = 0;
      state.py = groundAll(d.x, d.z);
      state.yaw = van.st.yaw;
      state.distTarget = walkDist;
    } else {
      // priorité au bouton de la porte du garage, puis à la portière du van
      const b = garage.buttonWorld;
      if (Math.hypot(state.px - b.x, state.pz - b.z) < 2.0) {
        garage.toggleDoor();
        return;
      }
      const d = doorWorld();
      if (Math.hypot(state.px - d.x, state.pz - d.z) < 2.3) {
        state.drive = true;
        driver.setSeated(true, van.body);
        walkDist = state.distTarget;
        state.distTarget = 8.4;
        // pof d'échappement au démarrage
        const c = Math.cos(van.st.yaw), s = Math.sin(van.st.yaw);
        dust.puff(van.st.x - 0.6 * c - 2.5 * s, van.st.bodyY - 0.3, van.st.z + 0.6 * s - 2.5 * c);
      }
    }
  });
  const keys = Object.create(null);
  const TMP = new Vector3();

  addEventListener('keydown', (e) => { if (!e.repeat) keys[e.code] = true; });
  addEventListener('keyup', (e) => { keys[e.code] = false; });
  addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
  canvas.addEventListener('click', () => { if (!state.locked) canvas.requestPointerLock?.(); });
  document.addEventListener('pointerlockchange', () => { state.locked = document.pointerLockElement === canvas; });
  addEventListener('mousemove', (e) => {
    if (!state.locked) return;
    // repère main gauche : yaw croissant = tourner à droite (l'inverse de Three)
    state.camYaw += e.movementX * 0.0022;
    state.camPitch = Math.min(1.25, Math.max(-0.4, state.camPitch + e.movementY * 0.0022));
  });
  addEventListener('wheel', (e) => {
    state.distTarget = Math.min(9, Math.max(1.6, state.distTarget + Math.sign(e.deltaY) * 0.5));
  }, { passive: true });

  // 6 lumières simultanées par matériau (défaut 4) : soleil + hémisphérique
  // + phares/feu/garage — sinon les lumières d'interaction sont ignorées
  for (const m of scene.materials) m.maxSimultaneousLights = 6;

  const overlay = createOverlay(engine, scene, { sun, fog: scene, post });

  const WALK = 2.2, RUN = 6.5, ACCEL = 26, DAMP = 10;
  let last = performance.now();
  let stepAcc = 0, footSide = 1;                     // cadence des empreintes

  /* Warm-up (M8) : sous l'écran de chargement, on force la compilation de
   * chaque pipeline — un tour de particules, phares et feu allumés (au loin,
   * hors du buffer de déformation), un regard vers le garage — pour que le
   * premier usage réel ne produise aucun à-coup. */
  let warmFrames = 0, bootGone = false;
  const warmup = () => {
    warmFrames++;
    if (warmFrames === 2) {
      for (const ps of scene.particleSystems) ps.manualEmitCount = 2;
      van.setLights(true);
      fire.toggleAt(600, 600);                       // hors monde, hors buffer
      rain.toggle();
    }
    if (warmFrames === 4) { state.camYaw = Math.PI; } // compile la vue garage
    if (warmFrames === 7) {
      state.camYaw = 0;
      van.setLights(false);
      fire.toggleAt(600, 600);                       // extinction
      rain.toggle();
      // retour au mode automatique : manualEmitCount ≥ 0 désactive emitRate
      for (const ps of scene.particleSystems) ps.manualEmitCount = -1;
    }
    if (warmFrames >= 10) {
      bootGone = true;
      boot.classList.add('gone');
    }
  };

  engine.runRenderLoop(() => {
    const now = performance.now();
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    windClock.t = now / 1000;

    // entrées
    let ix = 0, iz = 0;
    if (keys.KeyW || keys.ArrowUp) iz += 1;
    if (keys.KeyS || keys.ArrowDown) iz -= 1;
    if (keys.KeyA || keys.ArrowLeft) ix -= 1;
    if (keys.KeyD || keys.ArrowRight) ix += 1;

    let focX, focY, focZ, fvx, fvz, speed;
    if (state.drive) {
      /* ---- conduite ---- */
      // l'esplanade du garage est compactée comme la chaussée
      const nearPad = Math.abs(van.st.x - GARAGE.x) < GARAGE.hw + 3
        && van.st.z > GARAGE.z0 - 7 && van.st.z < GARAGE.z1 + 3;
      const offroad = !nearPad && roadQuery(van.st.x, van.st.z).dist > ROAD_HALF + 0.5;
      van.update(dt, { throttle: iz, steer: ix, offroad, mist: rain.ease() }, vanBlocked);
      // les pneus creusent hors chaussée — sillons continus (pas de 0,24 m)
      wheelAcc += Math.abs(van.st.speed) * dt;
      if (wheelAcc > 0.24 && Math.abs(van.st.speed) > 0.4) {
        wheelAcc = 0;
        for (const w of van.wheels) {
          const p = van.wheelWorld(w);
          if (roadQuery(p.x, p.z).dist > ROAD_HALF + 0.15 && !garage.isInterior(p.x, p.z)) {
            deform.addSplat(p.x, p.z, 0.19,
              Math.min(0.04, 0.012 + Math.abs(van.st.speed) * 0.003));
          }
        }
      }
      deform.update(dt, van.st.x, van.st.z);
      terrain.patchTick(van.st.x, van.st.z);
      // le sillage : panaches aux roues arrière, densité liée à la vitesse
      speed = Math.abs(van.st.speed);
      const bkx = -Math.sin(van.st.yaw), bkz = -Math.cos(van.st.yaw);
      const kick = speed > 1.4 ? Math.min(1, speed / 9) : 0;
      for (let i = 0; i < 2; i++) {
        const w = van.wheels[2 + i];
        const p = van.wheelWorld(w);
        const ps = dust.plumes[i];
        ps.emitter.set(p.x, w.y + 0.24, p.z);
        ps.emitRate = 85 * kick * (offroad ? 1 : 0.6); // la chaussée poudroie aussi
        ps.direction1.set(bkx * 0.7 - 0.5, 0.2, bkz * 0.7 - 0.5);
        ps.direction2.set(bkx * 1.9 + 0.5, 0.9, bkz * 1.9 + 0.5);
      }
      // secousses : gros freinage, grosses bosses — discret et vite amorti
      shake *= Math.exp(-5 * dt);
      const decel = (prevVanSpeed - speed) / Math.max(dt, 1e-3);
      const bumpV = Math.abs(van.st.bodyY - prevBodyY) / Math.max(dt, 1e-3);
      shake = Math.max(shake, Math.min(0.05,
        Math.max(0, decel - 5) * 0.004 + Math.max(0, bumpV - 0.9) * 0.03));
      prevVanSpeed = speed; prevBodyY = van.st.bodyY;
      // caméra chase : suit le cap du van avec du retard
      const wantYaw = van.st.yaw + Math.PI;
      const dy = ((wantYaw - state.camYaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      state.camYaw += dy * Math.min(1, (1.1 + speed * 0.22) * dt);
      state.camPitch = Math.max(0.1, state.camPitch);
      focX = van.st.x; focZ = van.st.z; focY = van.st.bodyY + 1.1;
      fvx = van.st.vx; fvz = van.st.vz;              // le regard suit la glisse
      setHint(speed <= 1.6 ? 'E — descendre' : '');
    } else {
      /* ---- à pied ---- */
      const il = Math.hypot(ix, iz);
      const max = (keys.ShiftLeft || keys.ShiftRight) ? RUN : WALK;
      if (il > 0) {
        ix /= il; iz /= il;
        const cy = state.camYaw;
        // avant caméra = -(sin cy, cos cy) ; droite écran (main gauche) = (-cos cy, sin cy)
        const dx = -Math.sin(cy) * iz - Math.cos(cy) * ix;
        const dz = -Math.cos(cy) * iz + Math.sin(cy) * ix;
        state.vx += dx * ACCEL * dt;
        state.vz += dz * ACCEL * dt;
        const sp = Math.hypot(state.vx, state.vz);
        if (sp > max) { state.vx *= max / sp; state.vz *= max / sp; }
        state.yaw += ((Math.atan2(state.vx, state.vz) - state.yaw + Math.PI * 3) % (Math.PI * 2) - Math.PI)
          * Math.min(1, 12 * dt);
      } else {
        const f = Math.max(0, 1 - DAMP * dt);
        state.vx *= f; state.vz *= f;
      }
      state.px += state.vx * dt;
      state.pz += state.vz * dt;
      const po = pushOut(state.px, state.pz, 0.32);
      if (po) { state.px = po.x; state.pz = po.z; }
      const pr = resolveRects(state.px, state.pz, 0.32);
      state.px = pr.x; state.pz = pr.z;
      // empreintes de pas : un splat par foulée, alterné gauche/droite
      const spd = Math.hypot(state.vx, state.vz);
      if (spd > 0.4) {
        stepAcc += spd * dt;
        const stride = spd > 3.5 ? 1.05 : 0.62;
        if (stepAcc > stride) {
          stepAcc = 0; footSide = -footSide;
          // ni le gravier compacté de la chaussée, ni le béton du garage
          if (roadQuery(state.px, state.pz).dist > ROAD_HALF + 0.2
            && !garage.isInterior(state.px, state.pz)) {
            const fx = state.vx / spd, fz = state.vz / spd;
            deform.addSplat(
              state.px - fz * footSide * 0.15, state.pz + fx * footSide * 0.15,
              0.13, spd > 3.5 ? 0.045 : 0.03);
          }
        }
      }
      deform.update(dt, state.px, state.pz);
      terrain.patchTick(state.px, state.pz);
      van.update(dt, { throttle: 0, steer: 0, offroad: false, mist: rain.ease() }, vanBlocked);
      dust.plumes[0].emitRate = 0; dust.plumes[1].emitRate = 0;
      const gy = groundAll(state.px, state.pz);
      state.py += (gy - state.py) * Math.min(1, 14 * dt);
      driver.root.position.set(state.px, state.py, state.pz);
      driver.root.rotation.y = state.yaw;
      driver.update(dt, spd);
      speed = spd;
      focX = state.px; focZ = state.pz; focY = state.py + 1.55;
      fvx = state.vx; fvz = state.vz;
      const d = doorWorld();
      const b = garage.buttonWorld;
      const dBtn = Math.hypot(state.px - b.x, state.pz - b.z);
      if (dBtn < 2.0) {
        setHint(garage.doorFrac() > 0.5 ? 'E — fermer la porte' : 'E — ouvrir la porte');
      } else {
        setHint(Math.hypot(state.px - d.x, state.pz - d.z) < 2.3 ? 'E — monter à bord' : '');
      }
    }

    // interactions : la cellule de pluie et les lucioles suivent le focus
    const focAx = state.drive ? van.st.x : state.px;
    const focAz = state.drive ? van.st.z : state.pz;
    garage.update(dt);
    for (const r of camRects) { if (r.doorRect) r.active = garage.doorBlocked(); }
    // la révélation : dans le garage porte fermée l'œil est adapté au sombre ;
    // la porte s'ouvre, le jour inonde, l'exposition redescend en ~1,2 s
    const inside = garage.isInterior(focAx, focAz);
    post.setExposure(1 + 0.3 * (inside ? 1 - garage.doorFrac() : 0));
    // à l'intérieur, la cellule de pluie reste dehors, devant la façade
    rain.update(dt, focAx, inside ? GARAGE.z0 - 14 : focAz);
    fire.update(dt);
    day.update(dt, focAx, focAz);
    horn.update(dt, focAx, focAz);
    post.update(dt);
    const rd = rain.ease();
    if (rd > 0.001) {
      // l'averse mange la lumière — appliqué APRÈS day.update (valeurs absolues)
      sun.intensity *= 1 - 0.45 * rd;
      amb.intensity *= 1 - 0.2 * rd;
      scene.fogDensity += 0.005 * rd;
    }

    // caméra épaule : cible amortie, distance aisée, FOV qui s'élargit à la vitesse
    const lead = Math.min(0.5, speed * 0.08);
    const k = 1 - Math.exp(-7 * dt);
    state.tx += (focX + fvx * lead - state.tx) * k;
    state.ty += (focY - state.ty) * k;
    state.tz += (focZ + fvz * lead - state.tz) * k;
    state.dist += (state.distTarget - state.dist) * (1 - Math.exp(-8 * dt));
    const cp = Math.cos(state.camPitch), sp2 = Math.sin(state.camPitch);
    const shoulder = 0.4;
    // occlusion : rectangle du van tenu à jour (ignoré quand on conduit)
    {
      const ac = Math.abs(Math.cos(van.st.yaw)), as = Math.abs(Math.sin(van.st.yaw));
      const hx = ac * 1.05 + as * 2.7, hz = as * 1.05 + ac * 2.7;
      vanRect.x0 = van.st.x - hx; vanRect.x1 = van.st.x + hx;
      vanRect.z0 = van.st.z - hz; vanRect.z1 = van.st.z + hz;
      vanRect.y1 = van.st.bodyY + 1.7;
      vanRect.active = !state.drive;
    }
    const odx = (Math.sin(state.camYaw) * cp * state.dist + Math.cos(state.camYaw) * shoulder) / state.dist;
    const ody = sp2;
    const odz = (Math.cos(state.camYaw) * cp * state.dist - Math.sin(state.camYaw) * shoulder) / state.dist;
    const allowed = camClamp(state.tx, state.ty, state.tz, odx, ody, odz, state.dist);
    // rapproche vite quand un obstacle surgit, réélargit en douceur
    state.distOcc += (allowed - state.distOcc) * Math.min(1, (allowed < state.distOcc ? 22 : 4.5) * dt);
    const dEff = Math.min(state.dist, state.distOcc);
    camera.position.x = state.tx + odx * dEff;
    camera.position.y = Math.max(
      height(camera.position.x, camera.position.z) + 0.4,
      state.ty + ody * dEff);
    camera.position.z = state.tz + odz * dEff;
    if (shake > 0.001) {
      camera.position.y += Math.sin(now * 0.061) * shake;
      camera.position.x += Math.sin(now * 0.047 + 1.3) * shake * 0.6;
    }
    TMP.set(state.tx, state.ty, state.tz);
    camera.setTarget(TMP);
    camera.fov = 0.95 + Math.min(0.18, speed * 0.022);

    overlay.tick(now);
    if (!bootGone && scene.isReady()) warmup();
    scene.render();
  });

  addEventListener('resize', () => engine.resize());

  // poignées de développement (cadrage des captures d'itération)
  window.__laroute = { state, scene, engine, deform, van, driver, rain, fire, day, horn, garage, post };
}
