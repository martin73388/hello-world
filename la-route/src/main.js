/**
 * LA ROUTE — Milestone 1 : Fondation.
 * Boot WebGPU (sans repli), boucle de rendu, caméra épaule + ZQSD sur plan
 * provisoire, overlay de performance (F1). Zéro allocation dans la boucle.
 */
import { WebGPUEngine } from '@babylonjs/core/Engines/webgpuEngine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color.js';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera.js';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight.js';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight.js';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator.js';
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent.js';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { createOverlay } from './ui/overlay.js';

const canvas = document.getElementById('rc');
const boot = document.getElementById('boot');

function showNoGpu() {
  boot.style.display = 'none';
  document.getElementById('nogpu').style.display = 'flex';
}
if (!navigator.gpu) {
  showNoGpu();
} else {
  // navigator.gpu peut exister sans adaptateur utilisable : même sortie unique
  start().catch(showNoGpu);
}

async function start() {
  const engine = new WebGPUEngine(canvas, { antialias: true });
  await engine.initAsync();

  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.055, 0.075, 0.12, 1);
  scene.fogMode = Scene.FOGMODE_EXP2;
  scene.fogDensity = 0.006;
  scene.fogColor = new Color3(0.06, 0.09, 0.15);

  // Soleil bas et chaud, ambiance bleutée (les vraies passes viennent au M2)
  const sun = new DirectionalLight('sun', new Vector3(-0.55, -0.35, 0.75), scene);
  sun.diffuse = new Color3(1.0, 0.72, 0.42);
  sun.intensity = 1.6;
  const amb = new HemisphericLight('amb', new Vector3(0, 1, 0), scene);
  amb.diffuse = new Color3(0.35, 0.45, 0.65);
  amb.groundColor = new Color3(0.1, 0.09, 0.12);
  amb.intensity = 0.55;
  const shadows = new ShadowGenerator(2048, sun);
  shadows.usePercentageCloserFiltering = true;

  // Plan provisoire (le clipmap arrive au M2)
  const ground = MeshBuilder.CreateGround('ground', { width: 400, height: 400, subdivisions: 2 }, scene);
  const gmat = new StandardMaterial('gmat', scene);
  gmat.diffuseColor = new Color3(0.16, 0.2, 0.28);
  gmat.specularColor = new Color3(0.02, 0.02, 0.02);
  ground.material = gmat;
  ground.receiveShadows = true;

  // Quelques repères d'échelle en attendant le terrain
  const bmat = new StandardMaterial('bmat', scene);
  bmat.diffuseColor = new Color3(0.28, 0.32, 0.42);
  bmat.specularColor = new Color3(0.05, 0.05, 0.05);
  for (let i = 0; i < 24; i++) {
    const s = 0.6 + (i * 37 % 13) / 6;
    const b = MeshBuilder.CreateBox('b' + i, { size: s }, scene);
    b.position.set(((i * 73) % 160) - 80, s / 2, ((i * 131) % 160) - 80);
    b.material = bmat;
    shadows.addShadowCaster(b);
    b.freezeWorldMatrix();
  }

  // Marcheur provisoire : capsule (la silhouette robe/capuche arrive au M4)
  const player = MeshBuilder.CreateCapsule('player', { height: 1.78, radius: 0.3 }, scene);
  player.position.y = 0.89;
  const pmat = new StandardMaterial('pmat', scene);
  pmat.diffuseColor = new Color3(0.75, 0.45, 0.25);
  player.material = pmat;
  shadows.addShadowCaster(player);

  const camera = new FreeCamera('cam', new Vector3(0, 2.2, -4), scene);
  camera.minZ = 0.05; camera.maxZ = 800;
  camera.fov = 0.95;

  /* ---- état & scratch (aucune allocation dans la boucle) ---- */
  const state = {
    px: 0, pz: 0, vx: 0, vz: 0, yaw: 0,
    camYaw: 0, camPitch: 0.32, dist: 4.2, distTarget: 4.2,
    tx: 0, ty: 1.5, tz: 0,
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
    player.position.x = state.px;
    player.position.z = state.pz;
    player.rotation.y = state.yaw;

    // caméra épaule : cible amortie, distance aisée, FOV qui s'élargit à la vitesse
    const speed = Math.hypot(state.vx, state.vz);
    const lead = Math.min(0.5, speed * 0.08);
    const k = 1 - Math.exp(-7 * dt);
    state.tx += (state.px + state.vx * lead - state.tx) * k;
    state.ty += (1.55 - state.ty) * k;
    state.tz += (state.pz + state.vz * lead - state.tz) * k;
    state.dist += (state.distTarget - state.dist) * (1 - Math.exp(-8 * dt));
    const cp = Math.cos(state.camPitch), sp2 = Math.sin(state.camPitch);
    const shoulder = 0.4;
    camera.position.x = state.tx + Math.sin(state.camYaw) * cp * state.dist + Math.cos(state.camYaw) * shoulder;
    camera.position.y = Math.max(0.3, state.ty + sp2 * state.dist);
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
}
