'use strict';
/* ============================================================
   ÉOLIA — terres du vent
   Exploration 3D d'une île grandiose. Style inspiré des grands
   jeux d'aventure en monde ouvert : couleurs douces, brume,
   paravoile, sanctuaires à découvrir.
   ============================================================ */

/* ---------- bruit déterministe (pur, testable) ---------- */
function hash2(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}
function smooth(t) { return t * t * (3 - 2 * t); }
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const a = hash2(xi, yi), b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  const u = smooth(xf), v = smooth(yf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, oct) {
  let sum = 0, amp = 0.5, tot = 0;
  for (let i = 0; i < oct; i++) {
    sum += amp * vnoise(x, y);
    tot += amp;
    x *= 2.03; y *= 2.03; amp *= 0.5;
  }
  return sum / tot;
}

/* ---------- relief de l'île ---------- */
const SEA = 0;               // niveau de la mer
const ISLAND_R = 720;        // rayon approximatif de l'île

function terrainH(x, z) {
  let h = fbm(x * 0.0016 + 13.7, z * 0.0016 + 7.3, 5);
  h = (h - 0.42) * 95;

  // collines douces supplémentaires
  h += (fbm(x * 0.006 + 4.2, z * 0.006 + 1.8, 3) - 0.5) * 18;

  // grande montagne au nord-ouest (crêtes)
  const dx = x + 250, dz = z + 290;
  const md2 = dx * dx + dz * dz;
  const mw = Math.exp(-md2 / (2 * 240 * 240));
  const ridge = 1 - Math.abs(2 * fbm(x * 0.0038 + 3.1, z * 0.0038 + 9.2, 4) - 1);
  h += mw * (70 + ridge * 150);

  // masque d'île : la terre plonge dans l'océan sur les bords
  const d = Math.sqrt(x * x + z * z) / ISLAND_R;
  const fall = Math.max(0, 1 - Math.pow(Math.max(0, d - 0.15) / 0.85, 2.6));
  h = h * fall;
  h -= Math.pow(Math.max(0, d - 0.85), 1.6) * 260;
  return h;
}

function terrainSlope(x, z) {
  const e = 2.5;
  const gx = terrainH(x + e, z) - terrainH(x - e, z);
  const gz = terrainH(x, z + e) - terrainH(x, z - e);
  return Math.sqrt(gx * gx + gz * gz) / (2 * e);
}

/* cherche un point de terre ferme le long d'un rayon depuis le centre */
function findLandAlong(angle, rStart, rEnd, hMin, hMax, slopeMax) {
  const step = (rEnd - rStart) / 160;
  for (let r = rStart; (step > 0 ? r <= rEnd : r >= rEnd); r += step) {
    const x = Math.sin(angle) * r, z = Math.cos(angle) * r;
    const h = terrainH(x, z);
    if (h >= hMin && h <= hMax && terrainSlope(x, z) < slopeMax) {
      return { x: x, z: z, h: h };
    }
  }
  return null;
}

function findPeak() {
  let bx = 0, bz = 0, bh = -1e9;
  for (let x = -700; x <= 700; x += 12) {
    for (let z = -700; z <= 700; z += 12) {
      const h = terrainH(x, z);
      if (h > bh) { bh = h; bx = x; bz = z; }
    }
  }
  return { x: bx, z: bz, h: bh };
}

const BEACON_NAMES = [
  'Sanctuaire des Cimes',
  'Sanctuaire du Levant',
  'Sanctuaire de l’Écume',
  'Sanctuaire des Brumes',
  'Sanctuaire de la Forêt',
  'Sanctuaire du Couchant',
  'Sanctuaire du Zénith',
];

function findBeaconSpots() {
  const spots = [];
  spots.push(findPeak()); // les Cimes
  const defs = [
    { a: 1.45, r0: 660, r1: 120, hMin: 2, hMax: 20, sMax: 0.35 },   // Levant (est)
    { a: 2.85, r0: 700, r1: 200, hMin: 0.8, hMax: 6, sMax: 0.3 },   // Écume (plage sud)
    { a: 5.6, r0: 640, r1: 120, hMin: 8, hMax: 60, sMax: 0.4 },     // Brumes (ouest)
    { a: 0.35, r0: 200, r1: 560, hMin: 6, hMax: 55, sMax: 0.35 },   // Forêt (nord-est)
    { a: 4.3, r0: 660, r1: 140, hMin: 4, hMax: 45, sMax: 0.4 },     // Couchant
    { a: 3.6, r0: 120, r1: 620, hMin: 15, hMax: 90, sMax: 0.45 },   // Zénith (intérieur)
  ];
  for (const d of defs) {
    let s = findLandAlong(d.a, d.r0, d.r1, d.hMin, d.hMax, d.sMax);
    if (!s) { s = findLandAlong(d.a, 600, 80, 1, 120, 0.6); }
    if (!s) { s = { x: Math.sin(d.a) * 300, z: Math.cos(d.a) * 300, h: terrainH(Math.sin(d.a) * 300, Math.cos(d.a) * 300) }; }
    spots.push(s);
  }
  return spots;
}

function findSpawn() {
  const s = findLandAlong(2.35, 700, 200, 1.5, 8, 0.3);
  return s || { x: 0, z: 300, h: terrainH(0, 300) };
}

/* ============================================================ */
/*  À partir d'ici : rendu, contrôles, audio (navigateur)       */
/* ============================================================ */

function init() {
const canvas = document.getElementById('cv');
const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xcfe3ea, 260, 1500);

const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.5, 4000);

/* ---------- lumières ---------- */
const hemi = new THREE.HemisphereLight(0xbfd9e8, 0x8a9a6a, 0.85);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff2dc, 1.35);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -90; sun.shadow.camera.right = 90;
sun.shadow.camera.top = 90; sun.shadow.camera.bottom = -90;
sun.shadow.camera.near = 10; sun.shadow.camera.far = 700;
sun.shadow.bias = -0.0015;
scene.add(sun);
scene.add(sun.target);

/* ---------- ciel ---------- */
const skyUniforms = {
  top: { value: new THREE.Color(0x4f92c4) },
  bottom: { value: new THREE.Color(0xcfe3ea) },
  sunDir: { value: new THREE.Vector3(0, 1, 0) },
  sunCol: { value: new THREE.Color(0xfff3d8) },
};
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(2400, 24, 12),
  new THREE.ShaderMaterial({
    uniforms: skyUniforms,
    side: THREE.BackSide,
    depthWrite: false,
    vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: [
      'varying vec3 vDir;',
      'uniform vec3 top; uniform vec3 bottom; uniform vec3 sunDir; uniform vec3 sunCol;',
      'void main(){',
      '  vec3 d = normalize(vDir);',
      '  float h = clamp(d.y * 0.5 + 0.5, 0.0, 1.0);',
      '  vec3 col = mix(bottom, top, pow(h, 0.78));',
      '  float s = max(dot(d, normalize(sunDir)), 0.0);',
      '  col += sunCol * (pow(s, 700.0) * 1.4 + pow(s, 10.0) * 0.16);',
      '  gl_FragColor = vec4(col, 1.0);',
      '}',
    ].join('\n'),
  })
);
sky.frustumCulled = false;
scene.add(sky);

/* étoiles */
const starGeo = new THREE.BufferGeometry();
{
  const n = 900, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const u = hash2(i, 1) * 2 - 1, t = hash2(i, 2) * Math.PI * 2;
    const r = Math.sqrt(1 - u * u);
    pos[i * 3] = Math.cos(t) * r * 2200;
    pos[i * 3 + 1] = Math.abs(u) * 2200 + 60;
    pos[i * 3 + 2] = Math.sin(t) * r * 2200;
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
}
const starMat = new THREE.PointsMaterial({ color: 0xd8e4ff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
const stars = new THREE.Points(starGeo, starMat);
scene.add(stars);

/* ---------- terrain ---------- */
const TER_SIZE = 2000, TER_SEG = 230;
const terGeo = new THREE.PlaneGeometry(TER_SIZE, TER_SIZE, TER_SEG, TER_SEG);
terGeo.rotateX(-Math.PI / 2);
{
  const pos = terGeo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const cSand = new THREE.Color(0xd9c893);
  const cGrassA = new THREE.Color(0x86b25a);
  const cGrassB = new THREE.Color(0x5f954a);
  const cRock = new THREE.Color(0x8d8577);
  const cRockD = new THREE.Color(0x6e675c);
  const cSnow = new THREE.Color(0xf3f5f7);
  const cDeep = new THREE.Color(0x3c5e57);
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = terrainH(x, z);
    pos.setY(i, h);
    const sl = terrainSlope(x, z);
    const jit = (vnoise(x * 0.05 + 50, z * 0.05) - 0.5) * 0.5;
    if (h < -3) { tmp.copy(cDeep); }
    else if (h < 1.6 + jit) { tmp.copy(cSand); }
    else if (h > 128 + jit * 30 && sl < 0.75) { tmp.copy(cSnow); }
    else if (sl > 0.62 + jit * 0.2 || h > 95 + jit * 30) {
      tmp.copy(cRock).lerp(cRockD, vnoise(x * 0.02, z * 0.02 + 9));
    } else {
      tmp.copy(cGrassA).lerp(cGrassB, vnoise(x * 0.015 + 7, z * 0.015));
    }
    tmp.offsetHSL(0, 0, jit * 0.04);
    colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
  }
  terGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  terGeo.computeVertexNormals();
}
const terrain = new THREE.Mesh(terGeo, new THREE.MeshLambertMaterial({ vertexColors: true }));
terrain.receiveShadow = true;
scene.add(terrain);

/* ---------- océan ---------- */
const water = new THREE.Mesh(
  new THREE.CircleGeometry(2300, 48),
  new THREE.MeshPhongMaterial({ color: 0x2f7fae, transparent: true, opacity: 0.8, shininess: 140, specular: 0x88bbcc })
);
water.rotation.x = -Math.PI / 2;
water.position.y = SEA;
scene.add(water);

/* ---------- arbres & rochers (instanciés) ---------- */
function scatter(count, test) {
  const out = [];
  let i = 0, guard = 0;
  while (out.length < count && guard < count * 30) {
    guard++;
    const x = (hash2(i, 77.7) - 0.5) * 2 * ISLAND_R;
    const z = (hash2(i, 33.3) - 0.5) * 2 * ISLAND_R;
    i++;
    const h = terrainH(x, z);
    const sl = terrainSlope(x, z);
    if (test(x, z, h, sl)) { out.push({ x: x, z: z, h: h, r: hash2(i, 5) }); }
  }
  return out;
}

const treeSpots = scatter(520, function (x, z, h, sl) {
  return h > 3 && h < 75 && sl < 0.4 && fbm(x * 0.004 + 21, z * 0.004 + 8, 3) > 0.52;
});
{
  const trunkGeo = new THREE.CylinderGeometry(0.32, 0.5, 3.4, 6);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6d543a });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, treeSpots.length);
  const folGeo = new THREE.IcosahedronGeometry(2.7, 0);
  const folMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const fols = new THREE.InstancedMesh(folGeo, folMat, treeSpots.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const e = new THREE.Euler();
  const gA = new THREE.Color(0x5d9c4d), gB = new THREE.Color(0x8fae4e), gC = new THREE.Color(0x4a8a56);
  const col = new THREE.Color();
  for (let i = 0; i < treeSpots.length; i++) {
    const t = treeSpots[i];
    const sc = 0.75 + t.r * 0.8;
    e.set(0, t.r * 6.28, 0); q.setFromEuler(e);
    p.set(t.x, t.h + 1.6 * sc, t.z); s.set(sc, sc, sc);
    m.compose(p, q, s); trunks.setMatrixAt(i, m);
    p.set(t.x, t.h + (3.4 + 1.4) * sc, t.z); s.set(sc, sc * (1.1 + t.r * 0.5), sc);
    m.compose(p, q, s); fols.setMatrixAt(i, m);
    col.copy(gA).lerp(t.r < 0.5 ? gB : gC, hash2(i, 9.1));
    fols.setColorAt(i, col);
  }
  trunks.castShadow = true; fols.castShadow = true;
  scene.add(trunks); scene.add(fols);
}

const rockSpots = scatter(140, function (x, z, h, sl) { return h > 1 && sl < 0.7; });
{
  const geo = new THREE.DodecahedronGeometry(1.6, 0);
  const mat = new THREE.MeshLambertMaterial({ color: 0x8b8478 });
  const rocks = new THREE.InstancedMesh(geo, mat, rockSpots.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const e = new THREE.Euler();
  for (let i = 0; i < rockSpots.length; i++) {
    const t = rockSpots[i];
    const sc = 0.5 + t.r * 2.2;
    e.set(t.r * 2, t.r * 9, t.r); q.setFromEuler(e);
    p.set(t.x, t.h + sc * 0.4, t.z); s.set(sc, sc * (0.6 + t.r * 0.6), sc);
    m.compose(p, q, s);
    rocks.setMatrixAt(i, m);
  }
  rocks.castShadow = true;
  scene.add(rocks);
}

/* ---------- îles flottantes décoratives ---------- */
{
  const mat = new THREE.MeshLambertMaterial({ color: 0x77836f });
  const matTop = new THREE.MeshLambertMaterial({ color: 0x7fae58 });
  const defs = [
    { x: -900, y: 330, z: 500, s: 1.4 },
    { x: 750, y: 390, z: -820, s: 1.0 },
    { x: 150, y: 430, z: 1050, s: 1.8 },
  ];
  for (const d of defs) {
    const g = new THREE.Group();
    const rock = new THREE.Mesh(new THREE.ConeGeometry(38, 70, 7), mat);
    rock.rotation.x = Math.PI;
    rock.position.y = -36;
    g.add(rock);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(38, 41, 10, 7), matTop);
    top.position.y = 0;
    g.add(top);
    const tr = new THREE.Mesh(new THREE.IcosahedronGeometry(12, 0), matTop);
    tr.position.set(8, 14, -4);
    g.add(tr);
    g.position.set(d.x, d.y, d.z);
    g.scale.setScalar(d.s);
    g.userData.baseY = d.y;
    g.userData.phase = d.x;
    floatIslands.push(g);
    scene.add(g);
  }
}

/* ---------- nuages ---------- */
const clouds = [];
{
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
  for (let i = 0; i < 16; i++) {
    const g = new THREE.Group();
    const n = 3 + Math.floor(hash2(i, 3) * 3);
    for (let j = 0; j < n; j++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(14 + hash2(i, j) * 16, 7, 5), mat);
      b.position.set(j * 20 - n * 10 + hash2(j, i) * 14, hash2(i, j + 9) * 8, hash2(j + 2, i) * 18 - 9);
      b.scale.y = 0.45;
      g.add(b);
    }
    g.position.set((hash2(i, 51) - 0.5) * 2600, 260 + hash2(i, 52) * 160, (hash2(i, 53) - 0.5) * 2600);
    g.userData.speed = 2.5 + hash2(i, 54) * 3;
    clouds.push(g);
    scene.add(g);
  }
}

/* ---------- sanctuaires ---------- */
const beaconSpots = findBeaconSpots();
const beacons = [];
{
  const stoneMat = new THREE.MeshLambertMaterial({ color: 0x7d7669 });
  for (let i = 0; i < beaconSpots.length; i++) {
    const s = beaconSpots[i];
    const g = new THREE.Group();
    for (let k = 0; k < 5; k++) {
      const a = k / 5 * Math.PI * 2;
      const st = new THREE.Mesh(new THREE.BoxGeometry(1.3, 4 + hash2(i, k) * 2.2, 1), stoneMat);
      st.position.set(Math.cos(a) * 5.5, 2, Math.sin(a) * 5.5);
      st.rotation.y = -a;
      st.rotation.z = (hash2(k, i) - 0.5) * 0.16;
      st.castShadow = true;
      g.add(st);
    }
    const crystal = new THREE.Mesh(
      new THREE.OctahedronGeometry(1.7),
      new THREE.MeshStandardMaterial({ color: 0xbffcf4, emissive: 0x37d6c2, emissiveIntensity: 1.3, roughness: 0.25 })
    );
    crystal.position.y = 6;
    g.add(crystal);
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(1.6, 1.6, 900, 10, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x66e6d4, transparent: true, opacity: 0.13, blending: THREE.AdditiveBlending, side: THREE.BackSide, depthWrite: false, fog: false })
    );
    pillar.position.y = 450;
    g.add(pillar);
    g.position.set(s.x, s.h, s.z);
    scene.add(g);
    beacons.push({ group: g, crystal: crystal, pillar: pillar, x: s.x, z: s.z, h: s.h, name: BEACON_NAMES[i], found: false });
  }
}

/* ---------- personnage ---------- */
const player = new THREE.Group();
const bodyMat = new THREE.MeshLambertMaterial({ color: 0x3a7ca5 });   // tunique bleue
const skinMat = new THREE.MeshLambertMaterial({ color: 0xe8b98a });
const hairMat = new THREE.MeshLambertMaterial({ color: 0xd9b455 });
const pantsMat = new THREE.MeshLambertMaterial({ color: 0x8a6f4d });

const torso = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.15, 0.6), bodyMat);
torso.position.y = 1.55;
torso.castShadow = true;
player.add(torso);
const head = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.7, 0.72), skinMat);
head.position.y = 2.55;
head.castShadow = true;
player.add(head);
const hair = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.28, 0.8), hairMat);
hair.position.y = 2.94;
player.add(hair);
const legL = new THREE.Mesh(new THREE.BoxGeometry(0.34, 1.0, 0.4), pantsMat);
const legR = legL.clone();
legL.position.set(-0.24, 0.95, 0); legR.position.set(0.24, 0.95, 0);
legL.geometry = legL.geometry.clone(); // pivot en haut de la jambe
legL.geometry.translate(0, -0.45, 0); legR.geometry = legL.geometry;
legL.position.y = 1.4; legR.position.y = 1.4;
legL.castShadow = true; legR.castShadow = true;
player.add(legL); player.add(legR);
const armGeo = new THREE.BoxGeometry(0.26, 0.95, 0.32);
armGeo.translate(0, -0.4, 0);
const armL = new THREE.Mesh(armGeo, bodyMat);
const armR = new THREE.Mesh(armGeo, bodyMat);
armL.position.set(-0.66, 2.05, 0); armR.position.set(0.66, 2.05, 0);
armL.castShadow = true; armR.castShadow = true;
player.add(armL); player.add(armR);

/* paravoile */
const glider = new THREE.Group();
{
  const sail = new THREE.Mesh(
    new THREE.CylinderGeometry(2.3, 2.3, 2.3, 14, 1, true, Math.PI * 0.15, Math.PI * 0.7),
    new THREE.MeshLambertMaterial({ color: 0xc9543a, side: THREE.DoubleSide })
  );
  sail.rotation.z = Math.PI / 2;   // axe du cylindre le long de X : aile gauche-droite
  sail.position.y = 2.7;           // la voûte culmine à ~5, juste au-dessus de la tête
  glider.add(sail);
  const stickMat = new THREE.MeshLambertMaterial({ color: 0x5c4630 });
  for (const sx of [-0.5, 0.5]) {
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.6), stickMat);
    st.position.set(sx, 3.5, 0);
    glider.add(st);
  }
}
glider.visible = false;
player.add(glider);
scene.add(player);

/* ---------- état du jeu ---------- */
const spawn = findSpawn();
const pos = new THREE.Vector3(spawn.x, spawn.h + 0.1, spawn.z);
const vel = new THREE.Vector3();
let onGround = true, gliding = false, swimming = false;
let faceAngle = Math.atan2(-spawn.x, -spawn.z), walkPhase = 0;
let camYaw = Math.atan2(spawn.x, spawn.z) + 0.35, camPitch = 0.32, camDist = 10;
let started = false, startAnim = 0;
let found = 0;
let dayT = 0.28;           // heure du monde (0..1), départ le matin
const DAY_LEN = 300;       // secondes par jour

const keys = {};
let jumpPressed = false;

/* ---------- entrées ---------- */
window.addEventListener('keydown', function (e) {
  if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) { jumpPressed = true; } }
  keys[e.code] = true;
});
window.addEventListener('keyup', function (e) { keys[e.code] = false; });

let dragging = false, lastMX = 0, lastMY = 0;
canvas.addEventListener('pointerdown', function (e) { dragging = true; lastMX = e.clientX; lastMY = e.clientY; });
window.addEventListener('pointerup', function () { dragging = false; });
window.addEventListener('pointermove', function (e) {
  if (!dragging) { return; }
  camYaw -= (e.clientX - lastMX) * 0.005;
  camPitch = Math.max(-0.05, Math.min(1.25, camPitch + (e.clientY - lastMY) * 0.004));
  lastMX = e.clientX; lastMY = e.clientY;
});
window.addEventListener('wheel', function (e) {
  camDist = Math.max(5, Math.min(24, camDist + e.deltaY * 0.01));
}, { passive: true });

/* ---------- audio ---------- */
let AC = null, windGain = null, windFilter = null;
function ensureAudio() {
  if (AC) { if (AC.state === 'suspended') { AC.resume(); } return; }
  try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
  // vent : bruit filtré en boucle
  const len = AC.sampleRate * 2;
  const buf = AC.createBuffer(1, len, AC.sampleRate);
  const data = buf.getChannelData(0);
  let v = 0;
  for (let i = 0; i < len; i++) { v = v * 0.98 + (Math.random() * 2 - 1) * 0.05; data[i] = v; }
  const src = AC.createBufferSource();
  src.buffer = buf; src.loop = true;
  windFilter = AC.createBiquadFilter();
  windFilter.type = 'bandpass'; windFilter.frequency.value = 400; windFilter.Q.value = 0.6;
  windGain = AC.createGain(); windGain.gain.value = 0.03;
  src.connect(windFilter).connect(windGain).connect(AC.destination);
  src.start();
  // nappe harmonique très discrète
  const padG = AC.createGain(); padG.gain.value = 0.012;
  padG.connect(AC.destination);
  [110, 164.8, 220].forEach(function (f, i) {
    const o = AC.createOscillator();
    o.type = 'triangle'; o.frequency.value = f; o.detune.value = (i - 1) * 4;
    const g = AC.createGain(); g.gain.value = 0.5;
    o.connect(g).connect(padG);
    o.start();
  });
}
function bell(f, vol, when) {
  if (!AC) { return; }
  const t0 = AC.currentTime + (when || 0);
  [1, 2.76, 5.4].forEach(function (m, i) {
    const o = AC.createOscillator(), g = AC.createGain();
    o.frequency.value = f * m;
    g.gain.setValueAtTime(vol / (i * 2 + 1), t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.4 / (i + 1));
    o.connect(g).connect(AC.destination);
    o.start(t0); o.stop(t0 + 1.6);
  });
}
function chimeDiscover() { [523.25, 659.25, 783.99, 1046.5].forEach(function (f, i) { bell(f, 0.16, i * 0.12); }); }
function chimeVictory() { [523.25, 659.25, 783.99, 1046.5, 1318.5, 1568].forEach(function (f, i) { bell(f, 0.15, i * 0.15); }); }

/* ---------- HUD ---------- */
const elCount = document.getElementById('count');
const elToast = document.getElementById('toast');
const elCompass = document.getElementById('compassInner');
const elTitle = document.getElementById('title');
const elHints = document.getElementById('hints');
let toastTimer = 0;
function toast(msg, long) {
  elToast.textContent = msg;
  elToast.classList.add('show');
  toastTimer = long ? 6 : 3.5;
}

const cardinals = [
  { a: 0, t: 'N' }, { a: Math.PI / 2, t: 'E' }, { a: Math.PI, t: 'S' }, { a: -Math.PI / 2, t: 'O' },
];
const compassMarks = [];
for (const c of cardinals) {
  const d = document.createElement('div');
  d.className = 'cmark card';
  d.textContent = c.t;
  elCompass.appendChild(d);
  compassMarks.push({ el: d, angle: c.a, beacon: null });
}
for (const b of beacons) {
  const d = document.createElement('div');
  d.className = 'cmark dot';
  elCompass.appendChild(d);
  compassMarks.push({ el: d, angle: 0, beacon: b });
}
function wrapAngle(a) {
  while (a > Math.PI) { a -= Math.PI * 2; }
  while (a < -Math.PI) { a += Math.PI * 2; }
  return a;
}

document.getElementById('overlay').addEventListener('pointerdown', function () {
  if (started) { return; }
  started = true;
  ensureAudio();
  elTitle.classList.add('hide');
  bell(392, 0.12); bell(587, 0.1, 0.25);
  setTimeout(function () { elHints.classList.add('hide'); }, 14000);
});

/* ---------- couleurs jour/nuit ---------- */
const C_DAY_TOP = new THREE.Color(0x4f92c4), C_DAY_BOT = new THREE.Color(0xcfe3ea);
const C_SET_TOP = new THREE.Color(0x51518f), C_SET_BOT = new THREE.Color(0xf0a868);
const C_NGT_TOP = new THREE.Color(0x0b1026), C_NGT_BOT = new THREE.Color(0x1c2742);
const tmpA = new THREE.Color(), tmpB = new THREE.Color();

/* ---------- boucle ---------- */
const clock = new THREE.Clock();
const fwd = new THREE.Vector3(), right = new THREE.Vector3(), wish = new THREE.Vector3();

function updatePlayer(dt) {
  const h = terrainH(pos.x, pos.z);
  swimming = h < SEA - 1.4;

  fwd.set(-Math.sin(camYaw), 0, -Math.cos(camYaw));
  right.set(fwd.z, 0, -fwd.x);
  wish.set(0, 0, 0);
  if (keys.KeyW || keys.ArrowUp) { wish.add(fwd); }
  if (keys.KeyS || keys.ArrowDown) { wish.sub(fwd); }
  if (keys.KeyA || keys.ArrowLeft) { wish.sub(right); }
  if (keys.KeyD || keys.ArrowRight) { wish.add(right); }
  const moving = wish.lengthSq() > 0;
  if (moving) { wish.normalize(); }

  const run = keys.ShiftLeft || keys.ShiftRight;
  let speed = run ? 19 : 12;
  const sl = terrainSlope(pos.x, pos.z);
  speed *= 1 - Math.min(0.6, Math.max(0, (sl - 0.55) * 0.9));
  if (swimming) { speed *= 0.4; }

  if (swimming) {
    gliding = false;
    pos.y += (SEA - 0.7 - pos.y) * Math.min(1, dt * 6);
    vel.y = 0;
    onGround = true;
    if (moving) {
      vel.x += (wish.x * speed - vel.x) * Math.min(1, dt * 6);
      vel.z += (wish.z * speed - vel.z) * Math.min(1, dt * 6);
    } else {
      vel.x *= Math.max(0, 1 - dt * 4); vel.z *= Math.max(0, 1 - dt * 4);
    }
    if (jumpPressed) { vel.y = 9; onGround = false; pos.y += 0.2; }
  } else if (onGround) {
    gliding = false;
    if (moving) {
      vel.x += (wish.x * speed - vel.x) * Math.min(1, dt * 9);
      vel.z += (wish.z * speed - vel.z) * Math.min(1, dt * 9);
    } else {
      vel.x *= Math.max(0, 1 - dt * 10); vel.z *= Math.max(0, 1 - dt * 10);
    }
    if (jumpPressed) {
      vel.y = 13;
      onGround = false;
    }
  } else {
    // en l'air
    if (jumpPressed && vel.y < 2) { gliding = !gliding; }
    if (gliding) {
      const gspeed = 22;
      if (moving) {
        vel.x += (wish.x * gspeed - vel.x) * Math.min(1, dt * 2.2);
        vel.z += (wish.z * gspeed - vel.z) * Math.min(1, dt * 2.2);
      }
      vel.y -= 30 * dt;
      if (vel.y < -3.2) { vel.y = -3.2; }
    } else {
      if (moving) {
        vel.x += wish.x * 26 * dt;
        vel.z += wish.z * 26 * dt;
      }
      vel.y -= 30 * dt;
    }
  }
  jumpPressed = false;

  pos.x += vel.x * dt;
  pos.z += vel.z * dt;
  pos.y += vel.y * dt;

  // limites du monde
  const rr = Math.sqrt(pos.x * pos.x + pos.z * pos.z);
  if (rr > 980) {
    pos.x *= 980 / rr; pos.z *= 980 / rr;
    vel.x *= -0.2; vel.z *= -0.2;
    toast('Le vent te ramène vers Éolia…');
  }

  const gh = terrainH(pos.x, pos.z);
  if (!swimming && pos.y <= gh) {
    pos.y = gh;
    if (vel.y < -22) { bell(98, 0.05); }
    vel.y = 0;
    onGround = true;
    gliding = false;
  } else if (!swimming && pos.y > gh + 0.25) {
    onGround = false;
  }

  // animation du personnage
  player.position.copy(pos);
  if (moving || !onGround) {
    const target = Math.atan2(gliding || !onGround ? vel.x : wish.x, gliding || !onGround ? vel.z : wish.z);
    if (moving) {
      let da = wrapAngle(target - faceAngle);
      faceAngle += da * Math.min(1, dt * 10);
    }
  }
  player.rotation.y = faceAngle;
  const hSpeed = Math.sqrt(vel.x * vel.x + vel.z * vel.z);
  if (onGround && hSpeed > 0.5) {
    walkPhase += dt * hSpeed * 1.1;
    const sw = Math.sin(walkPhase) * 0.55;
    legL.rotation.x = sw; legR.rotation.x = -sw;
    armL.rotation.x = -sw * 0.7; armR.rotation.x = sw * 0.7;
  } else if (gliding) {
    legL.rotation.x = 0.35; legR.rotation.x = 0.25;
    armL.rotation.x = Math.PI - 0.5; armR.rotation.x = Math.PI - 0.5;
  } else {
    legL.rotation.x *= 0.85; legR.rotation.x *= 0.85;
    armL.rotation.x *= 0.85; armR.rotation.x *= 0.85;
  }
  glider.visible = gliding;
  player.rotation.x = gliding ? 0.2 : 0;

  // découverte des sanctuaires
  for (const b of beacons) {
    if (!b.found) {
      const dx = pos.x - b.x, dz = pos.z - b.z;
      if (dx * dx + dz * dz < 13 * 13 && Math.abs(pos.y - b.h) < 25) {
        b.found = true;
        found++;
        b.crystal.material.color.set(0xffe9a8);
        b.crystal.material.emissive.set(0xffb52e);
        b.pillar.material.color.set(0xffce54);
        b.pillar.material.opacity = 0.07;
        elCount.textContent = found + ' / ' + beacons.length;
        if (found === beacons.length) {
          toast('Les sept sanctuaires veillent à nouveau. Éolia est à toi.', true);
          chimeVictory();
        } else {
          toast(b.name + ' découvert — ' + found + ' / ' + beacons.length);
          chimeDiscover();
        }
      }
    }
  }
}

function updateCamera(dt) {
  let d = camDist;
  if (startAnim < 1) {
    startAnim = Math.min(1, startAnim + (started ? dt * 0.25 : 0));
    const k = 1 - Math.pow(1 - startAnim, 3);
    d = camDist + (90 - camDist) * (1 - k);
    camPitch = 0.32 + 0.5 * (1 - k);
  }
  const cx = pos.x + Math.sin(camYaw) * Math.cos(camPitch) * d;
  const cz = pos.z + Math.cos(camYaw) * Math.cos(camPitch) * d;
  let cy = pos.y + 2 + Math.sin(camPitch) * d;
  const minY = terrainH(cx, cz) + 1.5;
  if (cy < minY) { cy = minY; }
  camera.position.set(cx, cy, cz);
  camera.lookAt(pos.x, pos.y + 2.2, pos.z);
}

function updateWorld(dt, t) {
  dayT = (dayT + dt / DAY_LEN) % 1;
  const sa = dayT * Math.PI * 2 - Math.PI / 2;
  const sunY = Math.sin(sa);
  const sunDir = new THREE.Vector3(Math.cos(sa), sunY, 0.35).normalize();
  sun.position.copy(pos).addScaledVector(sunDir, 400);
  sun.target.position.copy(pos);
  skyUniforms.sunDir.value.copy(sunDir);

  const dayK = Math.max(0, Math.min(1, sunY * 2.2 + 0.1));
  const duskK = Math.max(0, 1 - Math.abs(sunY) * 4) * (dayK > 0.02 ? 1 : 0.4);
  tmpA.copy(C_NGT_TOP).lerp(C_DAY_TOP, dayK).lerp(C_SET_TOP, duskK * 0.6);
  tmpB.copy(C_NGT_BOT).lerp(C_DAY_BOT, dayK).lerp(C_SET_BOT, duskK * 0.75);
  skyUniforms.top.value.copy(tmpA);
  skyUniforms.bottom.value.copy(tmpB);
  scene.fog.color.copy(tmpB);
  sun.intensity = 0.15 + dayK * 1.25;
  hemi.intensity = 0.25 + dayK * 0.65;
  starMat.opacity = Math.max(0, 1 - dayK * 2.5) * 0.9;
  water.material.color.setHex(0x2f7fae).lerp(new THREE.Color(0x11263c), 1 - dayK);

  sky.position.copy(camera.position);
  stars.position.set(camera.position.x, 0, camera.position.z);
  stars.rotation.y = t * 0.004;
  water.position.y = SEA + Math.sin(t * 0.7) * 0.12;
  water.position.x = camera.position.x;
  water.position.z = camera.position.z;

  for (const c of clouds) {
    c.position.x += c.userData.speed * dt;
    if (c.position.x > 1500) { c.position.x = -1500; }
  }
  for (const f of floatIslands) {
    f.position.y = f.userData.baseY + Math.sin(t * 0.25 + f.userData.phase) * 6;
  }
  for (const b of beacons) {
    b.crystal.rotation.y = t * 1.2;
    b.crystal.position.y = 6 + Math.sin(t * 1.6 + b.x) * 0.5;
  }

  // vent audio
  if (windGain) {
    const hSpeed = Math.sqrt(vel.x * vel.x + vel.z * vel.z);
    const target = 0.02 + hSpeed / 60 * 0.08 + (gliding ? 0.1 : 0) + Math.max(0, pos.y) / 200 * 0.03;
    windGain.gain.value += (target - windGain.gain.value) * dt * 3;
    windFilter.frequency.value = 320 + hSpeed * 14 + (gliding ? 260 : 0);
  }

  // boussole
  for (const m of compassMarks) {
    let a;
    if (m.beacon) {
      // cap depuis le nord (-z), positif vers l'est (+x)
      a = Math.atan2(m.beacon.x - pos.x, -(m.beacon.z - pos.z));
      m.el.classList.toggle('found', m.beacon.found);
    } else {
      a = m.angle;
    }
    const heading = -camYaw;
    const off = wrapAngle(a - heading);
    if (Math.abs(off) < 1.15) {
      m.el.style.display = 'block';
      m.el.style.left = (50 + off / 1.15 * 48) + '%';
      m.el.style.opacity = String(1 - Math.pow(Math.abs(off) / 1.15, 3));
    } else {
      m.el.style.display = 'none';
    }
  }

  if (toastTimer > 0) {
    toastTimer -= dt;
    if (toastTimer <= 0) { elToast.classList.remove('show'); }
  }
}

window.addEventListener('resize', function () {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, clock.getDelta());
  const t = clock.elapsedTime;
  if (started) { updatePlayer(dt); } else { player.position.copy(pos); }
  updateCamera(dt);
  updateWorld(dt, t);
  renderer.render(scene, camera);
}
elCount.textContent = '0 / ' + beacons.length;

/* interface de debug (console) */
window.EOLIA = {
  teleport: function (x, y, z) { pos.set(x, y, z); vel.set(0, 0, 0); onGround = false; },
  setDay: function (v) { dayT = v; },
  glide: function () { gliding = true; onGround = false; },
  state: function () {
    return { x: pos.x, y: pos.y, z: pos.z, gliding: gliding, onGround: onGround, swimming: swimming, found: found, dayT: dayT };
  },
};
frame();
}

/* îles flottantes (rempli dans init) */
const floatIslands = [];

if (typeof window !== 'undefined') {
  init();
} else if (typeof module !== 'undefined') {
  module.exports = { terrainH: terrainH, terrainSlope: terrainSlope, findBeaconSpots: findBeaconSpots, findSpawn: findSpawn, findPeak: findPeak };
}
