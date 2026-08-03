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
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { createOverlay } from './ui/overlay.js';
import { buildTerrain } from './terrain/terrain.js';
import { height } from './terrain/road.js';
import { plantPines } from './vegetation/pines.js';
import { buildSky } from './world/sky.js';

const canvas = document.getElementById('rc');
const boot = document.getElementById('boot');

function showNoGpu() {
  boot.style.display = 'none';
  document.getElementById('nogpu').style.display = 'flex';
}
// « ?gl » : chemin WebGL réservé au DÉVELOPPEMENT (captures d'itération en CI
// sans adaptateur WebGPU). La cible livrée reste WebGPU, sans repli.
const DEV_GL = new URLSearchParams(location.search).has('gl');
if (!DEV_GL && !navigator.gpu) {
  showNoGpu();
} else {
  // navigator.gpu peut exister sans adaptateur utilisable : même sortie unique
  start().catch((e) => { console.error(e); showNoGpu(); });
}

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
  buildTerrain(scene, shadows);
  const pines = plantPines(scene, shadows);
  console.log('pins plantés :', pines.count);

  // Marcheur provisoire : capsule (la silhouette robe/capuche arrive au M4)
  const player = MeshBuilder.CreateCapsule('player', { height: 1.78, radius: 0.3 }, scene);
  player.position.y = height(0, 20) + 0.89;
  const pmat = new StandardMaterial('pmat', scene);
  pmat.diffuseColor = new Color3(0.75, 0.45, 0.25);
  player.material = pmat;
  shadows.addShadowCaster(player);

  const camera = new FreeCamera('cam', new Vector3(0, 2.2, -4), scene);
  camera.minZ = 0.05; camera.maxZ = 800;
  camera.fov = 0.95;

  /* ---- état & scratch (aucune allocation dans la boucle) ---- */
  const state = {
    px: 0, pz: 20, py: height(0, 20), vx: 0, vz: 0, yaw: Math.PI,
    camYaw: Math.PI, camPitch: 0.22, dist: 4.2, distTarget: 4.2,
    tx: 0, ty: height(0, 20) + 1.55, tz: 20,
    locked: false,
  };
  const keys = Object.create(null);
  const TMP = new Vector3();

  addEventListener('keydown', (e) => { if (!e.repeat) keys[e.code] = true; });
  addEventListener('keyup', (e) => { keys[e.code] = false; });
  addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
  canvas.addEventListener('click', () => { if (!state.locked) canvas.requestPointerLock?.(); });
  document.addEventListener('pointerlockchange', () => { state.locked = document.pointerLockElement === canvas; });
  addEventListener('mousemove', (e) => {
    if (!state.locked) return;
    state.camYaw -= e.movementX * 0.0022;
    state.camPitch = Math.min(1.25, Math.max(-0.4, state.camPitch + e.movementY * 0.0022));
  });
  addEventListener('wheel', (e) => {
    state.distTarget = Math.min(9, Math.max(1.6, state.distTarget + Math.sign(e.deltaY) * 0.5));
  }, { passive: true });

  const overlay = createOverlay(engine, scene, { sun, fog: scene });

  const WALK = 2.2, RUN = 6.5, ACCEL = 26, DAMP = 10;
  let last = performance.now();

  engine.runRenderLoop(() => {
    const now = performance.now();
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;

    // entrée caméra-relative
    let ix = 0, iz = 0;
    if (keys.KeyW || keys.ArrowUp) iz += 1;
    if (keys.KeyS || keys.ArrowDown) iz -= 1;
    if (keys.KeyA || keys.ArrowLeft) ix -= 1;
    if (keys.KeyD || keys.ArrowRight) ix += 1;
    const il = Math.hypot(ix, iz);
    const max = (keys.ShiftLeft || keys.ShiftRight) ? RUN : WALK;
    if (il > 0) {
      ix /= il; iz /= il;
      const cy = state.camYaw;
      const dx = Math.sin(cy) * iz + Math.cos(cy) * ix;
      const dz = Math.cos(cy) * iz - Math.sin(cy) * ix;
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
    const gy = height(state.px, state.pz);
    state.py += (gy - state.py) * Math.min(1, 14 * dt);
    player.position.x = state.px;
    player.position.y = state.py + 0.89;
    player.position.z = state.pz;
    player.rotation.y = state.yaw;

    // caméra épaule : cible amortie, distance aisée, FOV qui s'élargit à la vitesse
    const speed = Math.hypot(state.vx, state.vz);
    const lead = Math.min(0.5, speed * 0.08);
    const k = 1 - Math.exp(-7 * dt);
    state.tx += (state.px + state.vx * lead - state.tx) * k;
    state.ty += (state.py + 1.55 - state.ty) * k;
    state.tz += (state.pz + state.vz * lead - state.tz) * k;
    state.dist += (state.distTarget - state.dist) * (1 - Math.exp(-8 * dt));
    const cp = Math.cos(state.camPitch), sp2 = Math.sin(state.camPitch);
    const shoulder = 0.4;
    camera.position.x = state.tx + Math.sin(state.camYaw) * cp * state.dist + Math.cos(state.camYaw) * shoulder;
    camera.position.y = Math.max(
      height(camera.position.x, camera.position.z) + 0.4,
      state.ty + sp2 * state.dist);
    camera.position.z = state.tz + Math.cos(state.camYaw) * cp * state.dist - Math.sin(state.camYaw) * shoulder;
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
  window.__laroute = { state, scene, engine };
}
