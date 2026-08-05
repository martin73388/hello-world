/**
 * LA ROUTE — Milestone 1 : Fondation.
 * Boot WebGPU (sans repli), boucle de rendu, caméra épaule + ZQSD sur plan
 * provisoire, overlay de performance (F1). Zéro allocation dans la boucle.
 */
import { WebGPUEngine } from '@babylonjs/core/Engines/webgpuEngine.js';
// Les capacités du moteur (textures dynamiques, cibles de rendu, lecture de
// pixels…) ne sont PAS dans la classe : ce sont des greffes sur le prototype,
// livrées par des modules à effet de bord. Or `dynamicTexture.js` & consorts
// n'importent QUE la version WebGL (greffée sur ThinEngine, dont WebGPUEngine
// ne descend pas). En ESM tree-shaké, le chemin WebGPU part donc sans aucune
// de ces méthodes : `engine.createDynamicTexture is not a function` dès le
// premier ciel peint. C'est pour ça que la démo n'avait jamais démarré
// ailleurs qu'en `?gl`. On importe le jeu complet — treize greffes minuscules.
import '@babylonjs/core/Engines/WebGPU/Extensions/index.js';
import { Engine } from '@babylonjs/core/Engines/engine.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { EffectWrapper } from '@babylonjs/core/Materials/effectRenderer.js';
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
import { plantGrass } from './vegetation/grass.js';
import { plantFlora } from './vegetation/flora.js';
import { plantLitter } from './world/litter.js';
import { plantUnderstory } from './world/understory.js';
import { createRetro } from './retro.js';
import { windClock, sunShared } from './vegetation/wind.js';
import { buildSky } from './world/sky.js';
import { buildClouds } from './world/clouds.js';
import { buildRidges } from './world/ridges.js';
import { buildShafts } from './world/shafts.js';
import { installCapture } from './ui/capture.js';
import { buildWater } from './world/water.js';
import { applyHaze } from './world/haze.js';
import { hazeShared } from './vegetation/wind.js';
import { buildVan } from './vehicle/van.js';
import { buildVanInterior } from './vehicle/vanInterior.js';
import { createDust } from './vehicle/dust.js';
import { buildDriver } from './character/driver.js';
import { createCampfire } from './world/campfire.js';
import { createWeather } from './world/weather.js';
import { createHorn } from './world/horn.js';
import { createWildlife } from './world/wildlife.js';

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
  shaders: `WebGPU a démarré mais le <b>transpileur de shaders</b> n'a pas pu
    être chargé.<br>Babylon va chercher <code>glslang</code> et <code>twgsl</code>
    sur son CDN ; un blocage réseau, un pare-feu ou une extension suffit à
    l'empêcher.<br>Vérifie ta connexion, ou lance en WebGL ci-dessous — le
    rendu y est identique, seule l'API change.`,
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
  // Babylon 7 génère du WGSL NATIF pour StandardMaterial dès qu'il tourne sur
  // WebGPU. Or nos cinq plugins matériau (vent, herbe, brume, déformation,
  // nuages) sont écrits en GLSL : le gestionnaire de plugins les REFUSE sur un
  // matériau WGSL (« plugin is not compatible with the shader language »), et
  // la scène perdrait d'un coup le vent, la translucidité, l'étagement de
  // brume et les ornières. On force donc la génération GLSL, que le moteur
  // transpile en WGSL par glslang/twgsl — c'est l'architecture consignée
  // depuis le M2b, elle n'avait simplement jamais été branchée.
  StandardMaterial.ForceGLSL = true;
  EffectWrapper.ForceGLSL = true;                      // la passe de déformation

  let engine;
  if (DEV_GL) {
    engine = new Engine(canvas, true);
  } else {
    engine = new WebGPUEngine(canvas, { antialias: true });
    // initAsync télécharge glslang et twgsl depuis le CDN Babylon : ils
    // transpilent en WGSL le GLSL de nos plugins matériau (herbe, brume,
    // déformation). Sans eux, WebGPU démarre mais AUCUN shader ne compile —
    // écran noir sans explication. On échoue donc bruyamment et on propose
    // le repli WebGL, qui n'a pas besoin de cette transpilation.
    try {
      await engine.initAsync();
    } catch (e) {
      console.error('[LA ROUTE] transpilation WebGPU indisponible :', e);
      return showNoGpu('shaders');
    }
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
  amb.diffuse = new Color3(0.34, 0.45, 0.68);        // le ciel bleuit les ombres
  amb.groundColor = new Color3(0.2, 0.19, 0.16);
  amb.intensity = 0.95;
  const shadows = new CascadedShadowGenerator(2048, sun);
  shadows.numCascades = 2;
  shadows.shadowMaxZ = 220;
  shadows.lambda = 0.92;
  shadows.stabilizeCascades = true;
  shadows.usePercentageCloserFiltering = true;
  shadows.bias = 0.004;
  shadows.normalBias = 0.03;
  // ombres franches mais JAMAIS bouchées : le brief interdit le noir écrasé
  // sous la canopée — elles doivent rester bleues et lisibles
  shadows.setDarkness(0.5);

  // Le monde du M2 : terrain sculpté par la route, forêt, ciel
  const sky = buildSky(scene);
  const clouds = buildClouds(scene);                 // deux nappes de cumulus
  const ridges = buildRidges(scene);                 // le troisième plan : les crêtes
  // M3 : buffer d'état de déformation (2048² ≈ 4 cm/texel sur 80 m ; réduit
  // sur le chemin dev WebGL logiciel)
  const deform = createDeform(engine, { res: DEV_GL ? 768 : 2048 });
  const terrain = buildTerrain(scene, shadows, deform.state);
  const pines = plantPines(scene, shadows);
  // bouleaux en bosquets, souches, troncs couchés, rochers moussus, panneau
  const flora = plantFlora(scene, shadows);
  // passe densité : la litière de feuilles mortes et l'étage moyen qui
  // ferme les côtés — les deux modules lisent road.js eux-mêmes
  const litter = plantLitter(scene);
  const under = plantUnderstory(scene, shadows);
  // le tapis : herbe, fougères, buissons — se couchent dans les ornières
  const grass = plantGrass(scene, deform.state);
  console.log('pins :', pines.count, '| flore :', flora.count, '| litière :', litter.count, '| étage moyen :', under.count);

  // M4 : le mécano articulé remplace la capsule, le van attend sur la route
  const garage = buildGarage(scene, shadows);        // M7 : la thèse de la démo
  // sol de MARCHE unifié : dehors le terrain (+ ruban), dedans la dalle béton
  const groundAll = (x, z) => {
    const g = groundHeight(x, z);
    return garage.isInterior(x, z) ? Math.max(g, GARAGE.y + 0.07) : g;
  };
  const driver = buildDriver(scene, shadows);
  const van = buildVan(scene, shadows, groundAll);
  // l'intérieur habitable : physique en repère LOCAL du van, donc la
  // cellule reste praticable pendant que le véhicule roule
  const cabin = buildVanInterior(scene, shadows, van.body, van.st);
  const dust = createDust(scene);                    // M5 : le sillage
  // M6 : les interactions — toutes lisent/écrivent l'état du monde
  const fire = createCampfire(scene, deform, groundHeight);
  // le temps qui passe : cycle jour/nuit continu + météo à états
  const weather = createWeather(scene, { sun, amb, sky, deform, shadows });
  const horn = createHorn(scene, pines.trunks, groundHeight);
  // rais de lumière rasante entre les troncs (aube et couchant seulement)
  const shafts = buildShafts(scene, pines.trunks, groundHeight);
  // la vie de fond : chevreuils, vols d'oiseaux, moucherons, pollen, chauves-souris
  const wild = createWildlife(scene, { groundHeight, trunks: pines.trunks, shadows });
  // le gué : ruisseau qui coupe la route, réflexion et nénuphars
  const water = buildWater(scene);

  // obstacles (troncs + rochers) : hachage spatial 4 m pour les collisions
  const OBS = new Map();
  const okey = (cx, cz) => cx * 8192 + cz;
  for (const o of [...pines.trunks, ...terrain.rocks, ...flora.obstacles]) {
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
  const walkRects = [...garage.colliders];           // murs + van : obstacles à pied
  const vanRect = { x0: 0, x1: 0, z0: 0, z1: 0, y1: 0, active: true };
  camRects.push(vanRect);
  walkRects.push(vanRect);                           // le mécano ne traverse pas le van
  for (const c of garage.colliders) {
    const r = { x0: c.x0, x1: c.x1, z0: c.z0, z1: c.z1, y1: GARAGE.y + 3.9, active: true };
    if (c.door) { r.doorRect = true; }
    camRects.push(r);
  }
  // le TOIT du garage : occlusif par le dessus (yAbove) — la caméra ne
  // s'échappe plus par le plafond quand on lève le regard à l'intérieur
  camRects.push({
    x0: -GARAGE.hw, x1: GARAGE.hw, z0: GARAGE.z0, z1: GARAGE.z1,
    y1: -1e9, yAbove: GARAGE.y + 3.55, active: true,
  });

  // résolution cercle-AABB : le mécano ne traverse ni murs ni établi
  const rectOut = { x: 0, z: 0 };                    // scratch, zéro alloc
  const resolveRects = (px, pz, r) => {
    let x = px, z = pz;
    for (const c of walkRects) {
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
          if (x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1
            && (r.yAbove !== undefined ? y > r.yAbove : y < r.y1)) { hit = true; break; }
        }
      }
      if (hit) return Math.max(0.85, t - 0.35);
    }
    return want;
  };

  const camera = new FreeCamera('cam', new Vector3(0, 2.2, -4), scene);
  // minZ à 0,05 ruinait la précision du depth au loin (le ciel à 750 et les
  // nuages à 450 tombaient dans le même palier) : 0,2 suffit en 3e personne
  camera.minZ = 0.2; camera.maxZ = 900;
  camera.fov = 0.95;
  const post = createPost(scene, camera);            // M7 : chaîne de post
  const retro = createRetro(scene, camera);          // patine PS1, en dernier

  /* ---- état & scratch (aucune allocation dans la boucle) ---- */
  // M7 : la démo s'ouvre DANS le garage sombre, face à la porte fermée —
  // caméra au fond du bâtiment, regard vers le sud (la porte, puis la route)
  const state = {
    px: -1.6, pz: 37.5, py: GARAGE.y, vx: 0, vz: 0, yaw: Math.PI,
    camYaw: 0, camPitch: 0.14, dist: 4.2, distTarget: 4.2,
    tx: -1.6, ty: GARAGE.y + 1.55, tz: 37.5,
    locked: false, drive: false, distOcc: 4.2,
  };
  let walkDist = 4.2, wheelAcc = 0, lightsManual = false;
  // « à bord » : le mécano marche DANS le van pendant qu'il roule. Sa
  // position est alors tenue en coordonnées LOCALES du véhicule.
  let aboard = false;
  const lp = { x: 0, z: 0 };                         // position locale à bord
  const sc1 = { x: 0, z: 0 }, sc2 = { x: 0, z: 0 };  // scratchs de conversion
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
    // 1 : reprise en main des phares — l'automatisme rend la main au joueur
    if (e.code === 'Digit1') { lightsManual = true; van.setLights(!van.lightsOn()); }
    else if (e.code === 'Digit2') weather.setWeather(weather.weatherName() === 'averse' ? 'clair' : 'averse');
    else if (e.code === 'Digit3' && !state.drive) {
      // le feu s'installe là où le mécano regarde — jamais sur la chaussée,
      // jamais dans le garage (extinction possible partout : on rappuie)
      const fx = state.px + Math.sin(state.yaw) * 2.0;
      const fz = state.pz + Math.cos(state.yaw) * 2.0;
      if (fire.burning()
        || (roadQuery(fx, fz).dist > ROAD_HALF + 0.4 && !garage.isInterior(fx, fz))) {
        fire.toggleAt(fx, fz);
      }
    } else if (e.code === 'Digit4') weather.skipTo((weather.timeOfDay() + 0.28) % 1);
    else if (e.code === 'Digit5') {
      const hx = state.drive ? van.st.x : state.px;
      const hz = state.drive ? van.st.z : state.pz;
      horn.blast(hx, hz);
      wild.scatter(hx, hz);                          // le klaxon vide la clairière
    }
  });
  addEventListener('keydown', (e) => {
    if (e.code !== 'KeyE') return;
    // --- au volant : on se lève, on reste DANS le van ---
    if (state.drive) {
      if (Math.abs(van.st.speed) > 1.6) return;        // pas en marche
      state.drive = false;
      driver.setSeated(false);
      aboard = true;                                   // on passe dans la cellule
      lp.x = cabin.seatLocal.x - 0.55; lp.z = cabin.seatLocal.z - 0.9;
      state.distTarget = 2.4;                          // caméra resserrée dedans
      return;
    }
    // --- à bord, à pied : s'asseoir au volant, ou descendre ---
    if (aboard) {
      if (Math.hypot(lp.x - cabin.seatLocal.x, lp.z - cabin.seatLocal.z) < 1.0) {
        aboard = false; state.drive = true;
        driver.setSeated(true, van.body);
        state.distTarget = 8.4;
        return;
      }
      if (Math.abs(van.st.speed) > 0.6) return;        // on ne saute pas en marche
      cabin.openDoor();
      const d = cabin.doorWorld(sc1);
      aboard = false;
      state.px = d.x; state.pz = d.z; state.vx = 0; state.vz = 0;
      state.py = groundAll(d.x, d.z);
      state.distTarget = walkDist;
      return;
    }
    {
      // priorité au bouton de la porte du garage, puis à la portière du van
      const b = garage.buttonWorld;
      if (Math.hypot(state.px - b.x, state.pz - b.z) < 2.0
        && garage.isInterior(state.px, state.pz)) {  // pas à travers la façade
        // ne jamais refermer la porte sur le van en travers du seuil
        const vanInDoorway = Math.abs(van.st.x) < 3.4
          && van.st.z > GARAGE.z0 - 3.6 && van.st.z < GARAGE.z0 + 4.2;
        if (!(garage.doorFrac() > 0.5 && vanInDoorway)) garage.toggleDoor();
        return;
      }
      const d = cabin.doorWorld(sc1);
      if (Math.hypot(state.px - d.x, state.pz - d.z) < 2.3) {
        // on ENTRE dans la cellule à pied : la position bascule en local
        cabin.openDoor();
        cabin.toLocal(state.px, state.pz, lp);
        lp.x = Math.max(-0.7, Math.min(0.7, lp.x));
        lp.z = Math.max(-1.4, Math.min(1.2, lp.z));
        aboard = true;
        state.vx = 0; state.vz = 0;
        walkDist = state.distTarget;
        state.distTarget = 2.4;
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
  // la brume de vallée étage les plans (posée en dernier, sur tout le décor)
  applyHaze(scene, ['skyMat', 'waterFoamM', 'waterRipM']);

  // Filet de sécurité WebGPU : si un plugin GLSL ne survit pas à la
  // transpilation WGSL, Babylon désactive l'effet en silence et la scène se
  // dégrade sans rien dire. On le signale à l'écran — c'est exactement ce
  // qu'on veut savoir en validant le rendu sur une autre machine.
  let shaderFail = 0;
  scene.onAfterRenderObservable.addOnce(() => {
    for (const m of scene.materials) {
      const e = m.getEffect && m.getEffect();
      if (e && e.getCompilationError && e.getCompilationError()) shaderFail++;
    }
    if (shaderFail > 0) {
      const w = document.createElement('div');
      w.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:60;'
        + 'background:rgba(120,20,20,.9);color:#ffe;padding:9px 13px;border-radius:7px;'
        + 'font:12px system-ui;max-width:420px;line-height:1.5';
      w.textContent = shaderFail + ' shader(s) n\'ont pas compilé — le rendu est '
        + 'incomplet. Détail en console (F12). Essaie le mode WebGL (?gl) pour comparer.';
      document.body.appendChild(w);
      console.warn('[LA ROUTE]', shaderFail, 'shaders en échec de compilation');
    }
  });

  const overlay = createOverlay(engine, scene,
    { sun, fog: scene, post, retro, weather, haze: hazeShared });

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
      // un tour d'émission manuelle compile TOUS les systèmes de particules
      // (pluie comprise — sans toggle : pas de traîne d'égouttement fantôme)
      for (const ps of scene.particleSystems) ps.manualEmitCount = 2;
      van.setLights(true);
      fire.toggleAt(600, 600);                       // hors monde, hors buffer
      garage.toggleDoor();                           // variante « lueur de seuil »
    }
    if (warmFrames === 4) { state.camYaw = Math.PI; } // compile la vue garage
    if (warmFrames === 7) {
      state.camYaw = 0;
      van.snapLightsOff();                           // coupure sèche, zéro résidu
      fire.toggleAt(600, 600);                       // extinction
      garage.toggleDoor();
      // retour au mode automatique : manualEmitCount ≥ 0 désactive emitRate
      for (const ps of scene.particleSystems) ps.manualEmitCount = -1;
    }
    if (warmFrames >= 10) {
      garage.update(20);                             // porte refermée net sous le boot
      bootGone = true;
      boot.classList.add('gone');
    }
  };

  engine.runRenderLoop(() => {
    const now = performance.now();
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    windClock.t = now / 1000;
    // les feuillages en contre-jour suivent l'arc solaire (le cycle a
    // réorienté sun.direction juste avant, cf. weather.update)
    sunShared.x = sun.direction.x;
    sunShared.y = sun.direction.y;
    sunShared.z = sun.direction.z;

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
      van.update(dt, { throttle: iz, steer: ix, offroad, mist: weather.rainEase() }, vanBlocked);
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
      if (speed > 7) wild.scatter(van.st.x, van.st.z);   // un van lancé fait fuir
    } else if (aboard) {
      /* ---- à pied DANS le van : tout se joue en repère local ----
       * On déplace le mécano dans les coordonnées de la caisse, on résout
       * les collisions contre le mobilier en local, PUIS on repasse en
       * monde. Le van peut rouler pendant ce temps : le sol bouge sous les
       * pieds sans que la marche ait besoin de le savoir. */
      van.update(dt, { throttle: 0, steer: 0, offroad: false, mist: weather.rainEase() }, vanBlocked);
      dust.plumes[0].emitRate = 0; dust.plumes[1].emitRate = 0;
      const il = Math.hypot(ix, iz);
      if (il > 0) {
        ix /= il; iz /= il;
        // la marche est relative à la caméra, elle-même relative au van
        const cy = state.camYaw - van.st.yaw;
        const dx = -Math.sin(cy) * iz - Math.cos(cy) * ix;
        const dz = -Math.cos(cy) * iz + Math.sin(cy) * ix;
        lp.x += dx * WALK * 0.55 * dt;
        lp.z += dz * WALK * 0.55 * dt;
        state.yaw = van.st.yaw + Math.atan2(dx, dz);
      }
      cabin.resolve(lp.x, lp.z, 0.28, sc2);
      lp.x = sc2.x; lp.z = sc2.z;
      cabin.toWorld(lp.x, lp.z, sc1);
      state.px = sc1.x; state.pz = sc1.z;
      state.py = van.st.bodyY + cabin.floorY;
      driver.root.position.set(state.px, state.py, state.pz);
      driver.root.rotation.y = state.yaw;
      driver.update(dt, il > 0 ? WALK * 0.55 : 0);
      deform.update(dt, van.st.x, van.st.z);
      terrain.patchTick(van.st.x, van.st.z);
      speed = 0;
      focX = state.px; focZ = state.pz; focY = state.py + 1.45;
      fvx = 0; fvz = 0;
      // l'indice vit dans CETTE branche aussi, sinon il reste figé sur le
      // dernier texte affiché dehors
      const atSeat = Math.hypot(lp.x - cabin.seatLocal.x, lp.z - cabin.seatLocal.z) < 1.0;
      setHint(atSeat ? 'E — prendre le volant'
        : (Math.abs(van.st.speed) <= 0.6 ? 'E — descendre' : ''));
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
      van.update(dt, { throttle: 0, steer: 0, offroad: false, mist: weather.rainEase() }, vanBlocked);
      dust.plumes[0].emitRate = 0; dust.plumes[1].emitRate = 0;
      const gy = groundAll(state.px, state.pz);
      state.py += (gy - state.py) * Math.min(1, 14 * dt);
      driver.root.position.set(state.px, state.py, state.pz);
      driver.root.rotation.y = state.yaw;
      driver.update(dt, spd);
      speed = spd;
      focX = state.px; focZ = state.pz; focY = state.py + 1.55;
      fvx = state.vx; fvz = state.vz;
      if (aboard) {
        const nearSeat = Math.hypot(lp.x - cabin.seatLocal.x, lp.z - cabin.seatLocal.z) < 1.0;
        setHint(nearSeat ? 'E — prendre le volant' : 'E — descendre');
      } else {
        const d = cabin.doorWorld(sc1);
        const b = garage.buttonWorld;
        const dBtn = Math.hypot(state.px - b.x, state.pz - b.z);
        if (dBtn < 2.0) {
          setHint(garage.doorFrac() > 0.5 ? 'E — fermer la porte' : 'E — ouvrir la porte');
        } else {
          setHint(Math.hypot(state.px - d.x, state.pz - d.z) < 2.3 ? 'E — entrer dans le van' : '');
        }
      }
    }

    // interactions : la cellule de pluie et les lucioles suivent le focus
    const focAx = state.drive ? van.st.x : state.px;
    const focAz = state.drive ? van.st.z : state.pz;
    grass.tick(focAx, focAz);
    cabin.update(dt);
    garage.update(dt, focAx, focAz);
    for (const r of camRects) { if (r.doorRect) r.active = garage.doorBlocked(); }
    // la révélation : dans le garage porte fermée l'œil est adapté au sombre ;
    // la porte s'ouvre, le jour inonde, l'exposition redescend en ~1,2 s
    const inside = garage.isInterior(focAx, focAz);
    post.setExposure(1 + 0.3 * (inside ? 1 - garage.doorFrac() : 0));
    // le temps qui passe : le cycle et la météo posent lumière, ciel et brume.
    // Dedans, la cellule de pluie reste franchement dehors — son demi-côté
    // fait 17 m, il en faut plus pour qu'aucune goutte ne traverse le toit.
    weather.update(dt, focAx, inside ? GARAGE.z0 - 26 : focAz);
    clouds.update(dt, weather.sunHeight(), weather.cloudiness(), focAx, focAz, state.camYaw);
    ridges.update(weather.sunHeight(), focAx, focAz);
    // la nappe de brume prend la couleur du brouillard du moment et
    // s'épaissit au petit matin, sous l'averse et par temps de brume
    hazeShared.d = (0.0055 + weather.rainEase() * 0.004
      + Math.max(0, 0.24 - weather.sunHeight()) * 0.016) * (hazeShared.scale || 1);
    // le plancher de ciel suit l'ambiante du moment : bleu la nuit, franc le jour
    hazeShared.ar = amb.diffuse.r * amb.intensity * 0.2;
    hazeShared.ag = amb.diffuse.g * amb.intensity * 0.21;
    hazeShared.ab = amb.diffuse.b * amb.intensity * 0.24;
    hazeShared.r = scene.fogColor.r * 1.18 + 0.1;
    hazeShared.g = scene.fogColor.g * 1.18 + 0.12;
    hazeShared.b = scene.fogColor.b * 1.18 + 0.16;
    water.update(dt, weather.sunHeight());
    shafts.update(dt, focAx, focAz, weather.sunHeight(), weather.sunAzimuth(),
      state.camYaw, 1 - weather.cloudiness() * 0.8);
    fire.update(dt);
    horn.update(dt, focAx, focAz);
    wild.update(dt, focAx, focAz, weather.nightFactor());
    post.update(dt);
    // les phares s'allument tout seuls à la tombée du jour et sous l'averse,
    // mais SEULEMENT quand quelqu'un conduit : un van garé et vide reste
    // éteint (sinon il éclaire la forêt et le mécano toute la nuit)
    cabin.lampSet((aboard || state.drive)
      && Math.max(weather.nightFactor(), weather.rainEase() * 0.7) > 0.35);
    if (!lightsManual) {
      const dark = Math.max(weather.nightFactor(), weather.rainEase() * 0.55);
      const want = state.drive && dark > 0.42;
      if (want !== van.lightsOn()) van.setLights(want);
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
      // le van bloque la marche… SAUF au droit de sa portière ouverte :
      // sinon le mécano est expulsé du seuil avant d'avoir pu entrer
      const dw = cabin.doorWorld(sc2);
      const nearDoor = Math.hypot(state.px - dw.x, state.pz - dw.z) < 2.6;
      vanRect.active = !state.drive && !aboard && !nearDoor;
    }
    const odx = (Math.sin(state.camYaw) * cp * state.dist + Math.cos(state.camYaw) * shoulder) / state.dist;
    const ody = sp2;
    const odz = (Math.cos(state.camYaw) * cp * state.dist - Math.sin(state.camYaw) * shoulder) / state.dist;
    let allowed = camClamp(state.tx, state.ty, state.tz, odx, ody, odz, state.dist);
    // à bord, la cellule fait 3,4 m : au-delà, la caméra traverse la tôle
    if (aboard) allowed = Math.min(allowed, 1.9);
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

  // F9 : les trois captures 1440p de référence, cadrées à l'identique
  const capture = installCapture(engine, scene, camera, state, weather, setHint);

  // poignées de développement (cadrage des captures d'itération)
  window.__laroute = { state, scene, engine, deform, van, driver, weather, fire, horn,
    garage, post, retro, grass, clouds, shafts, water, flora, cabin, ridges, wild,
    capture, isAboard: () => aboard, localPos: lp };
}
