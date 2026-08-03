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
import { buildTerrain } from './terrain/terrain.js';
import { createDeform } from './terrain/deform.js';
import { height, groundHeight, roadQuery, ROAD_HALF } from './terrain/road.js';
import { plantPines } from './vegetation/pines.js';
import { windClock } from './vegetation/wind.js';
import { buildSky } from './world/sky.js';
import { buildVan } from './vehicle/van.js';
import { createDust } from './vehicle/dust.js';
import { buildDriver } from './character/driver.js';

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
  buildSky(scene);
  // M3 : buffer d'état de déformation (2048² ≈ 4 cm/texel sur 80 m ; réduit
  // sur le chemin dev WebGL logiciel)
  const deform = createDeform(engine, { res: DEV_GL ? 768 : 2048 });
  const terrain = buildTerrain(scene, shadows, deform.state);
  const pines = plantPines(scene, shadows);
  console.log('pins plantés :', pines.count);

  // M4 : le mécano articulé remplace la capsule, le van attend sur la route
  const driver = buildDriver(scene, shadows);
  const van = buildVan(scene, shadows, groundHeight);
  const dust = createDust(scene);                    // M5 : le sillage

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
      if (pushOut(nx + s * off, nz + c * off, 1.02)) return true;
    }
    return false;
  };

  const camera = new FreeCamera('cam', new Vector3(0, 2.2, -4), scene);
  camera.minZ = 0.05; camera.maxZ = 800;
  camera.fov = 0.95;

  /* ---- état & scratch (aucune allocation dans la boucle) ---- */
  // camYaw 0 : caméra au nord du joueur, regard vers le SUD — la route
  // descend, le van attend à 10 m (dos au voyage depuis M1, corrigé au M4)
  const state = {
    px: 0, pz: 20, py: groundHeight(0, 20), vx: 0, vz: 0, yaw: Math.PI,
    camYaw: 0, camPitch: 0.22, dist: 4.2, distTarget: 4.2,
    tx: 0, ty: groundHeight(0, 20) + 1.55, tz: 20,
    locked: false, drive: false,
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

  // porte conducteur (côté gauche de la cabine)
  const doorWorld = () => {
    const c = Math.cos(van.st.yaw), s = Math.sin(van.st.yaw);
    return { x: van.st.x - 1.35 * c + 1.6 * s, z: van.st.z + 1.35 * s + 1.6 * c };
  };
  addEventListener('keydown', (e) => {
    if (e.code !== 'KeyE') return;
    if (state.drive) {
      if (Math.abs(van.st.speed) > 1.6) return;        // pas en marche
      state.drive = false;
      driver.setSeated(false);
      const d = doorWorld();
      state.px = d.x; state.pz = d.z; state.vx = 0; state.vz = 0;
      state.py = groundHeight(d.x, d.z);
      state.yaw = van.st.yaw;
      state.distTarget = walkDist;
    } else {
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

  const overlay = createOverlay(engine, scene, { sun, fog: scene });

  const WALK = 2.2, RUN = 6.5, ACCEL = 26, DAMP = 10;
  let last = performance.now();
  let stepAcc = 0, footSide = 1;                     // cadence des empreintes

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
      const offroad = roadQuery(van.st.x, van.st.z).dist > ROAD_HALF + 0.5;
      van.update(dt, { throttle: iz, steer: ix, offroad }, vanBlocked);
      // les pneus creusent hors chaussée — sillons continus (pas de 0,24 m)
      wheelAcc += Math.abs(van.st.speed) * dt;
      if (wheelAcc > 0.24 && Math.abs(van.st.speed) > 0.4) {
        wheelAcc = 0;
        for (const w of van.wheels) {
          const p = van.wheelWorld(w);
          if (roadQuery(p.x, p.z).dist > ROAD_HALF + 0.15) {
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
      // empreintes de pas : un splat par foulée, alterné gauche/droite
      const spd = Math.hypot(state.vx, state.vz);
      if (spd > 0.4) {
        stepAcc += spd * dt;
        const stride = spd > 3.5 ? 1.05 : 0.62;
        if (stepAcc > stride) {
          stepAcc = 0; footSide = -footSide;
          // le gravier compacté de la chaussée ne prend pas l'empreinte
          if (roadQuery(state.px, state.pz).dist > ROAD_HALF + 0.2) {
            const fx = state.vx / spd, fz = state.vz / spd;
            deform.addSplat(
              state.px - fz * footSide * 0.15, state.pz + fx * footSide * 0.15,
              0.13, spd > 3.5 ? 0.045 : 0.03);
          }
        }
      }
      deform.update(dt, state.px, state.pz);
      terrain.patchTick(state.px, state.pz);
      van.update(dt, { throttle: 0, steer: 0, offroad: false }, vanBlocked);
      dust.plumes[0].emitRate = 0; dust.plumes[1].emitRate = 0;
      const gy = groundHeight(state.px, state.pz);
      state.py += (gy - state.py) * Math.min(1, 14 * dt);
      driver.root.position.set(state.px, state.py, state.pz);
      driver.root.rotation.y = state.yaw;
      driver.update(dt, spd);
      speed = spd;
      focX = state.px; focZ = state.pz; focY = state.py + 1.55;
      fvx = state.vx; fvz = state.vz;
      const d = doorWorld();
      setHint(Math.hypot(state.px - d.x, state.pz - d.z) < 2.3 ? 'E — monter à bord' : '');
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
    camera.position.x = state.tx + Math.sin(state.camYaw) * cp * state.dist + Math.cos(state.camYaw) * shoulder;
    camera.position.y = Math.max(
      height(camera.position.x, camera.position.z) + 0.4,
      state.ty + sp2 * state.dist);
    camera.position.z = state.tz + Math.cos(state.camYaw) * cp * state.dist - Math.sin(state.camYaw) * shoulder;
    if (shake > 0.001) {
      camera.position.y += Math.sin(now * 0.061) * shake;
      camera.position.x += Math.sin(now * 0.047 + 1.3) * shake * 0.6;
    }
    TMP.set(state.tx, state.ty, state.tz);
    camera.setTarget(TMP);
    camera.fov = 0.95 + Math.min(0.18, speed * 0.022);

    overlay.tick(now);
    scene.render();
  });

  addEventListener('resize', () => engine.resize());

  // premier rendu prêt : on lève l'écran de chargement
  scene.executeWhenReady(() => boot.classList.add('gone'));

  // poignées de développement (cadrage des captures d'itération)
  window.__laroute = { state, scene, engine, deform, van, driver };
}
