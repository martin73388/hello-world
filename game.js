'use strict';
/* ============================================================
   ÉOLIA — terres du vent · un voyage au long cours
   Exploration 3D à l'échelle réelle : 1 unité = 1 mètre,
   1 seconde réelle = 1 minute de jeu. Île de ~7 km, montagne
   à ~1200 m (une journée de jeu pour la gravir). Le joueur vit
   dans un camping-car vide qu'il aménage au fil de ses trouvailles.
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

/* ---------- relief de l'île (échelle : mètres) ---------- */
const SEA = 0;
const ISLAND_R = 3200;

function terrainH(x, z) {
  let h = fbm(x * 0.00035 + 13.7, z * 0.00035 + 7.3, 5);
  h = (h - 0.42) * 420;
  h += (fbm(x * 0.0014 + 4.2, z * 0.0014 + 1.8, 3) - 0.5) * 60;
  h += (fbm(x * 0.008 + 9.9, z * 0.008 + 2.7, 2) - 0.5) * 6;

  // le grand pic au nord-ouest (~1200 m)
  const dx = x + 1100, dz = z + 1300;
  const md2 = dx * dx + dz * dz;
  const mw = Math.exp(-md2 / (2 * 950 * 950));
  const ridge = 1 - Math.abs(2 * fbm(x * 0.0009 + 3.1, z * 0.0009 + 9.2, 4) - 1);
  h += mw * (350 + ridge * 900);

  // masque d'île
  const d = Math.sqrt(x * x + z * z) / ISLAND_R;
  const fall = Math.max(0, 1 - Math.pow(Math.max(0, d - 0.15) / 0.85, 2.6));
  h = h * fall;
  h -= Math.pow(Math.max(0, d - 0.85), 1.6) * 800;
  return h;
}

function terrainSlope(x, z) {
  const e = 8;
  const gx = terrainH(x + e, z) - terrainH(x - e, z);
  const gz = terrainH(x, z + e) - terrainH(x, z - e);
  return Math.sqrt(gx * gx + gz * gz) / (2 * e);
}

function findLandAlong(angle, rStart, rEnd, hMin, hMax, slopeMax) {
  const step = (rEnd - rStart) / 200;
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
  for (let x = -3100; x <= 3100; x += 40) {
    for (let z = -3100; z <= 3100; z += 40) {
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
  spots.push(findPeak());
  const defs = [
    { a: 1.45, r0: 2950, r1: 500, hMin: 5, hMax: 90, sMax: 0.35 },
    { a: 2.85, r0: 3050, r1: 800, hMin: 2, hMax: 18, sMax: 0.3 },
    { a: 5.6, r0: 2850, r1: 500, hMin: 25, hMax: 280, sMax: 0.4 },
    { a: 0.35, r0: 800, r1: 2500, hMin: 25, hMax: 280, sMax: 0.35 },
    { a: 4.3, r0: 2950, r1: 600, hMin: 15, hMax: 220, sMax: 0.4 },
    { a: 3.6, r0: 500, r1: 2750, hMin: 60, hMax: 450, sMax: 0.45 },
  ];
  for (const d of defs) {
    let s = findLandAlong(d.a, d.r0, d.r1, d.hMin, d.hMax, d.sMax);
    if (!s) { s = findLandAlong(d.a, 2700, 400, 3, 600, 0.6); }
    if (!s) { s = { x: Math.sin(d.a) * 1400, z: Math.cos(d.a) * 1400, h: terrainH(Math.sin(d.a) * 1400, Math.cos(d.a) * 1400) }; }
    spots.push(s);
  }
  return spots;
}

function findSpawn() {
  const s = findLandAlong(2.35, 3050, 800, 2, 12, 0.22);
  return s || { x: 0, z: 1400, h: terrainH(0, 1400) };
}

/* ============================================================ */
/*  Navigateur : rendu, contrôles, van, aménagements, audio     */
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
scene.fog = new THREE.Fog(0xcfe3ea, 500, 3600);

const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.3, 14000);

/* ---------- lumières ---------- */
const hemi = new THREE.HemisphereLight(0xbfd9e8, 0x8a9a6a, 0.85);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff2dc, 1.35);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -140; sun.shadow.camera.right = 140;
sun.shadow.camera.top = 140; sun.shadow.camera.bottom = -140;
sun.shadow.camera.near = 10; sun.shadow.camera.far = 2000;
sun.shadow.bias = -0.002;
scene.add(sun);
scene.add(sun.target);

/* ---------- ciel, étoiles ---------- */
const skyUniforms = {
  top: { value: new THREE.Color(0x4f92c4) },
  bottom: { value: new THREE.Color(0xcfe3ea) },
  sunDir: { value: new THREE.Vector3(0, 1, 0) },
  sunCol: { value: new THREE.Color(0xfff3d8) },
};
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(9000, 24, 12),
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
      '  col += sunCol * (pow(s, 700.0) * 1.4 + pow(s, 14.0) * 0.10);',
      '  gl_FragColor = vec4(col, 1.0);',
      '}',
    ].join('\n'),
  })
);
sky.frustumCulled = false;
scene.add(sky);

const starGeo = new THREE.BufferGeometry();
{
  const n = 900, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const u = hash2(i, 1) * 2 - 1, t = hash2(i, 2) * Math.PI * 2;
    const r = Math.sqrt(1 - u * u);
    pos[i * 3] = Math.cos(t) * r * 8200;
    pos[i * 3 + 1] = Math.abs(u) * 8200 + 200;
    pos[i * 3 + 2] = Math.sin(t) * r * 8200;
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
}
const starMat = new THREE.PointsMaterial({ color: 0xd8e4ff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
const stars = new THREE.Points(starGeo, starMat);
scene.add(stars);

/* ---------- terrain ---------- */
const TER_SIZE = 7600, TER_SEG = 300;
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
    const jit = (vnoise(x * 0.012 + 50, z * 0.012) - 0.5) * 0.5;
    if (h < -15) { tmp.copy(cDeep); }
    else if (h < 3 + jit * 3) { tmp.copy(cSand); }
    else if (h > 850 + jit * 160 && sl < 0.8) { tmp.copy(cSnow); }
    else if (sl > 0.6 + jit * 0.2 || h > 650 + jit * 160) {
      tmp.copy(cRock).lerp(cRockD, vnoise(x * 0.004, z * 0.004 + 9));
    } else {
      tmp.copy(cGrassA).lerp(cGrassB, vnoise(x * 0.003 + 7, z * 0.003));
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
  new THREE.CircleGeometry(9000, 48),
  new THREE.MeshPhongMaterial({ color: 0x2f7fae, transparent: true, opacity: 0.8, shininess: 140, specular: 0x88bbcc })
);
water.rotation.x = -Math.PI / 2;
water.position.y = SEA;
scene.add(water);

/* ---------- végétation & rochers ---------- */
function scatter(count, seed, test) {
  const out = [];
  let i = 0, guard = 0;
  while (out.length < count && guard < count * 40) {
    guard++;
    const x = (hash2(i, seed) - 0.5) * 2 * ISLAND_R;
    const z = (hash2(i, seed + 11.1) - 0.5) * 2 * ISLAND_R;
    i++;
    const h = terrainH(x, z);
    const sl = terrainSlope(x, z);
    if (test(x, z, h, sl)) { out.push({ x: x, z: z, h: h, r: hash2(i, seed + 5) }); }
  }
  return out;
}

const treeSpots = scatter(2400, 77.7, function (x, z, h, sl) {
  return h > 5 && h < 550 && sl < 0.45 && fbm(x * 0.001 + 21, z * 0.001 + 8, 3) > 0.52;
});
{
  const trunkGeo = new THREE.CylinderGeometry(0.35, 0.55, 6, 6);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6d543a });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, treeSpots.length);
  const folGeo = new THREE.IcosahedronGeometry(4, 0);
  const folMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const fols = new THREE.InstancedMesh(folGeo, folMat, treeSpots.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const e = new THREE.Euler();
  const gA = new THREE.Color(0x5d9c4d), gB = new THREE.Color(0x8fae4e), gC = new THREE.Color(0x4a8a56);
  const col = new THREE.Color();
  for (let i = 0; i < treeSpots.length; i++) {
    const t = treeSpots[i];
    const sc = 0.8 + t.r * 1.2;
    e.set(0, t.r * 6.28, 0); q.setFromEuler(e);
    p.set(t.x, t.h + 2.8 * sc, t.z); s.set(sc, sc, sc);
    m.compose(p, q, s); trunks.setMatrixAt(i, m);
    p.set(t.x, t.h + (6 + 2.2) * sc, t.z); s.set(sc, sc * (1.1 + t.r * 0.5), sc);
    m.compose(p, q, s); fols.setMatrixAt(i, m);
    col.copy(gA).lerp(t.r < 0.5 ? gB : gC, hash2(i, 9.1));
    fols.setColorAt(i, col);
  }
  trunks.castShadow = true; fols.castShadow = true;
  scene.add(trunks); scene.add(fols);
}

const rockSpots = scatter(380, 33.3, function (x, z, h, sl) { return h > 2 && sl < 0.8; });
{
  const geo = new THREE.DodecahedronGeometry(2, 0);
  const mat = new THREE.MeshLambertMaterial({ color: 0x8b8478 });
  const rocks = new THREE.InstancedMesh(geo, mat, rockSpots.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const e = new THREE.Euler();
  for (let i = 0; i < rockSpots.length; i++) {
    const t = rockSpots[i];
    const sc = 0.5 + t.r * 2.6;
    e.set(t.r * 2, t.r * 9, t.r); q.setFromEuler(e);
    p.set(t.x, t.h + sc * 0.4, t.z); s.set(sc, sc * (0.6 + t.r * 0.6), sc);
    m.compose(p, q, s);
    rocks.setMatrixAt(i, m);
  }
  rocks.castShadow = true;
  scene.add(rocks);
}

/* ---------- îles flottantes & nuages ---------- */
const floatIslands = [];
{
  const mat = new THREE.MeshLambertMaterial({ color: 0x77836f });
  const matTop = new THREE.MeshLambertMaterial({ color: 0x7fae58 });
  const defs = [
    { x: -3600, y: 1350, z: 2000, s: 1.4 },
    { x: 3000, y: 1500, z: -3300, s: 1.0 },
    { x: 600, y: 1650, z: 4200, s: 1.8 },
  ];
  for (const d of defs) {
    const g = new THREE.Group();
    const rock = new THREE.Mesh(new THREE.ConeGeometry(150, 280, 7), mat);
    rock.rotation.x = Math.PI;
    rock.position.y = -145;
    g.add(rock);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(150, 164, 40, 7), matTop);
    g.add(top);
    const tr = new THREE.Mesh(new THREE.IcosahedronGeometry(48, 0), matTop);
    tr.position.set(30, 55, -16);
    g.add(tr);
    g.position.set(d.x, d.y, d.z);
    g.scale.setScalar(d.s);
    g.userData.baseY = d.y;
    g.userData.phase = d.x;
    floatIslands.push(g);
    scene.add(g);
  }
}

const clouds = [];
{
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
  for (let i = 0; i < 22; i++) {
    const g = new THREE.Group();
    const n = 3 + Math.floor(hash2(i, 3) * 3);
    for (let j = 0; j < n; j++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(60 + hash2(i, j) * 70, 7, 5), mat);
      b.position.set(j * 85 - n * 42 + hash2(j, i) * 60, hash2(i, j + 9) * 30, hash2(j + 2, i) * 76 - 38);
      b.scale.y = 0.45;
      g.add(b);
    }
    g.position.set((hash2(i, 51) - 0.5) * 11000, 1000 + hash2(i, 52) * 600, (hash2(i, 53) - 0.5) * 11000);
    g.userData.speed = 8 + hash2(i, 54) * 8;
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
      const st = new THREE.Mesh(new THREE.BoxGeometry(2.2, 7 + hash2(i, k) * 4, 1.6), stoneMat);
      st.position.set(Math.cos(a) * 9, 3.5, Math.sin(a) * 9);
      st.rotation.y = -a;
      st.rotation.z = (hash2(k, i) - 0.5) * 0.16;
      st.castShadow = true;
      g.add(st);
    }
    const crystal = new THREE.Mesh(
      new THREE.OctahedronGeometry(3),
      new THREE.MeshStandardMaterial({ color: 0xbffcf4, emissive: 0x37d6c2, emissiveIntensity: 1.3, roughness: 0.25 })
    );
    crystal.position.y = 10;
    g.add(crystal);
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(4, 4, 3000, 10, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x66e6d4, transparent: true, opacity: 0.13, blending: THREE.AdditiveBlending, side: THREE.BackSide, depthWrite: false, fog: false })
    );
    pillar.position.y = 1500;
    g.add(pillar);
    g.position.set(s.x, s.h, s.z);
    scene.add(g);
    beacons.push({ group: g, crystal: crystal, pillar: pillar, x: s.x, z: s.z, h: s.h, name: BEACON_NAMES[i], found: false });
  }
}

/* ---------- ressources & points d'intérêt ---------- */
const interactables = [];   // {type, label, x, z, y, mesh, gain}

const woodMat = new THREE.MeshLambertMaterial({ color: 0x7a5c3a });
for (let i = 0; i < 90; i++) {
  const t = treeSpots[Math.floor(hash2(i, 62) * treeSpots.length)];
  if (!t) { continue; }
  const x = t.x + (hash2(i, 63) - 0.5) * 12, z = t.z + (hash2(i, 64) - 0.5) * 12;
  const y = terrainH(x, z);
  if (y < 2) { continue; }
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 1.6, 5), woodMat);
  m.position.set(x, y + 0.1, z);
  m.rotation.set(Math.PI / 2, 0, hash2(i, 65) * 6.28);
  scene.add(m);
  interactables.push({ type: 'bois', label: 'ramasser du bois', x: x, z: z, y: y, mesh: m, gain: 2 });
}

const bushSpots = scatter(70, 44.4, function (x, z, h, sl) { return h > 4 && h < 350 && sl < 0.35; });
{
  const bushMat = new THREE.MeshLambertMaterial({ color: 0x3f6f3a });
  const berryMat = new THREE.MeshLambertMaterial({ color: 0xd0455a });
  for (let i = 0; i < bushSpots.length; i++) {
    const b = bushSpots[i];
    const g = new THREE.Group();
    const bu = new THREE.Mesh(new THREE.IcosahedronGeometry(0.9, 0), bushMat);
    bu.scale.y = 0.8;
    g.add(bu);
    for (let k = 0; k < 4; k++) {
      const be = new THREE.Mesh(new THREE.SphereGeometry(0.11, 5, 4), berryMat);
      be.position.set((hash2(i, k) - 0.5) * 1.3, 0.2 + hash2(k, i) * 0.6, (hash2(i, k + 7) - 0.5) * 1.3);
      g.add(be);
    }
    g.position.set(b.x, b.h + 0.5, b.z);
    scene.add(g);
    interactables.push({ type: 'baies', label: 'cueillir des baies', x: b.x, z: b.z, y: b.h, mesh: g, gain: 4 });
  }
}

const wreckSpots = [];
for (let i = 0; i < 8; i++) {
  const a = i / 8 * Math.PI * 2 + 0.4;
  const s = findLandAlong(a, 2500, 500, 4, 200, 0.3);
  if (s) { wreckSpots.push(s); }
}
{
  const rust = new THREE.MeshLambertMaterial({ color: 0x8a5a41 });
  const rustD = new THREE.MeshLambertMaterial({ color: 0x5f4536 });
  const scrapMat = new THREE.MeshLambertMaterial({ color: 0x9a9284 });
  const jerryMat = new THREE.MeshLambertMaterial({ color: 0xb8433a });
  for (let i = 0; i < wreckSpots.length; i++) {
    const w = wreckSpots[i];
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(4.6, 2, 2), rust);
    body.position.y = 0.8;
    body.rotation.z = 0.08;
    body.castShadow = true;
    g.add(body);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.9, 1.9), rustD);
    cab.position.set(-2.6, 0.6, 0);
    g.add(cab);
    g.position.set(w.x, w.h, w.z);
    g.rotation.y = hash2(i, 91) * 6.28;
    scene.add(g);
    // colonne de fumée repérable de loin
    const smoke = new THREE.Mesh(
      new THREE.CylinderGeometry(7, 1.5, 140, 8, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x8a8a92, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false })
    );
    smoke.position.set(w.x, w.h + 72, w.z);
    smoke.rotation.z = 0.06;
    scene.add(smoke);
    for (let k = 0; k < 2; k++) {
      const sx = w.x + (hash2(i, 95 + k) - 0.5) * 10, sz = w.z + (hash2(i, 98 + k) - 0.5) * 10;
      const sy = terrainH(sx, sz);
      const sp = new THREE.Mesh(new THREE.DodecahedronGeometry(0.5, 0), scrapMat);
      sp.position.set(sx, sy + 0.3, sz);
      scene.add(sp);
      interactables.push({ type: 'ferraille', label: 'récupérer de la ferraille', x: sx, z: sz, y: sy, mesh: sp, gain: 3 });
    }
    if (hash2(i, 103) > 0.35) {
      const jx = w.x + 3, jz = w.z + 2;
      const jy = terrainH(jx, jz);
      const j = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.35), jerryMat);
      j.position.set(jx, jy + 0.35, jz);
      scene.add(j);
      interactables.push({ type: 'carburant', label: 'prendre le jerrican (+20 L)', x: jx, z: jz, y: jy, mesh: j, gain: 20 });
    }
  }
}

/* ---------- personnage ---------- */
const player = new THREE.Group();
const bodyMat = new THREE.MeshLambertMaterial({ color: 0x3a7ca5 });
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
const legGeo = new THREE.BoxGeometry(0.34, 1.0, 0.4);
legGeo.translate(0, -0.45, 0);
const legL = new THREE.Mesh(legGeo, pantsMat);
const legR = new THREE.Mesh(legGeo, pantsMat);
legL.position.set(-0.24, 1.4, 0); legR.position.set(0.24, 1.4, 0);
legL.castShadow = true; legR.castShadow = true;
player.add(legL); player.add(legR);
const armGeo = new THREE.BoxGeometry(0.26, 0.95, 0.32);
armGeo.translate(0, -0.4, 0);
const armL = new THREE.Mesh(armGeo, bodyMat);
const armR = new THREE.Mesh(armGeo, bodyMat);
armL.position.set(-0.66, 2.05, 0); armR.position.set(0.66, 2.05, 0);
armL.castShadow = true; armR.castShadow = true;
player.add(armL); player.add(armR);

const glider = new THREE.Group();
{
  const sail = new THREE.Mesh(
    new THREE.CylinderGeometry(2.3, 2.3, 2.3, 14, 1, true, Math.PI * 0.15, Math.PI * 0.7),
    new THREE.MeshLambertMaterial({ color: 0xc9543a, side: THREE.DoubleSide })
  );
  sail.rotation.z = Math.PI / 2;
  sail.position.y = 2.7;
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
player.scale.setScalar(0.8);   // ~2,3 m de haut
scene.add(player);

/* ---------- le camping-car ---------- */
const spawn = findSpawn();
const van = {
  x: spawn.x + 6, z: spawn.z + 4,
  heading: 2.0, speed: 0,
  fuel: 25, fuelMax: 60,
  group: new THREE.Group(),
};
{
  const white = new THREE.MeshLambertMaterial({ color: 0xe8e4da });
  const stripe = new THREE.MeshLambertMaterial({ color: 0xd0784a });
  const dark = new THREE.MeshLambertMaterial({ color: 0x3a3f4a });
  const glass = new THREE.MeshLambertMaterial({ color: 0x9fc4d8 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.1, 5.4), white);
  body.position.y = 1.55;
  body.castShadow = true;
  van.group.add(body);
  const st = new THREE.Mesh(new THREE.BoxGeometry(2.24, 0.4, 5.44), stripe);
  st.position.y = 1.5;
  van.group.add(st);
  const windshield = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.8, 0.1), glass);
  windshield.position.set(0, 1.95, 2.72);
  van.group.add(windshield);
  const sideWin = new THREE.Mesh(new THREE.BoxGeometry(2.26, 0.6, 1.4), glass);
  sideWin.position.set(0, 2.05, 1.4);
  van.group.add(sideWin);
  for (const wz of [1.7, -1.7]) {
    for (const wx of [-1.05, 1.05]) {
      const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.3, 10), dark);
      wh.rotation.z = Math.PI / 2;
      wh.position.set(wx, 0.45, wz);
      van.group.add(wh);
    }
  }
  van.solarPanel = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.08, 2.4), new THREE.MeshLambertMaterial({ color: 0x2b4d6e }));
  van.solarPanel.position.y = 2.68;
  van.solarPanel.visible = false;
  van.group.add(van.solarPanel);
  van.group.rotation.order = 'YXZ';
  scene.add(van.group);
}

/* ---------- habitacle (vue "maison de poupée") ---------- */
const ROOM = new THREE.Group();
ROOM.position.set(0, -3000, 0);
scene.add(ROOM);
{
  const floor = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.1, 2.2), new THREE.MeshLambertMaterial({ color: 0x8a6f50 }));
  ROOM.add(floor);
  const wallMat = new THREE.MeshLambertMaterial({ color: 0xd8d2c4 });
  const wallL = new THREE.Mesh(new THREE.BoxGeometry(5.2, 2.0, 0.08), wallMat);
  wallL.position.set(0, 1.05, -1.1);
  ROOM.add(wallL);
  const wallFond = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.0, 2.2), wallMat);
  wallFond.position.set(-2.6, 1.05, 0);
  ROOM.add(wallFond);
  const win = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.7, 0.1), new THREE.MeshBasicMaterial({ color: 0xa8cfe0 }));
  win.position.set(0.6, 1.3, -1.1);
  ROOM.add(win);
  const roomLight = new THREE.PointLight(0xffdfb0, 0.9, 12);
  roomLight.position.set(0, 1.9, 0.6);
  ROOM.add(roomLight);
  ROOM.userData.light = roomLight;
}

/* ---------- aménagements ---------- */
const inv = { bois: 0, ferraille: 0, baies: 2, repas: 0, cristaux: 0 };
const upgrades = [
  { id: 'matelas', name: 'Vrai lit', cost: { bois: 4 }, done: false,
    desc: 'dormir à fond, récupérer 100 % d’énergie' },
  { id: 'kitchenette', name: 'Kitchenette', cost: { bois: 6, ferraille: 3 }, done: false,
    desc: 'cuisiner des repas de route (4 baies → 1 repas)' },
  { id: 'etageres', name: 'Étagères', cost: { bois: 5 }, done: false,
    desc: 'un van rangé est un van heureux' },
  { id: 'deco', name: 'Plante & tapis', cost: { bois: 3, baies: 4 }, done: false,
    desc: 'une touche de vie' },
  { id: 'guirlande', name: 'Guirlande lumineuse', cost: { ferraille: 4, cristaux: 1 }, done: false,
    desc: 'des soirées douces' },
  { id: 'radio', name: 'Radio', cost: { ferraille: 5, cristaux: 1 }, done: false,
    desc: 'de la musique sur la route' },
  { id: 'solaire', name: 'Panneau solaire', cost: { ferraille: 8, cristaux: 2 }, done: false,
    desc: 'consommation de carburant −30 %' },
];
function upgradeById(id) { return upgrades.find(function (u) { return u.id === id; }); }
function confortPct() {
  return Math.round(upgrades.filter(function (u) { return u.done; }).length / upgrades.length * 100);
}

function buildFurniture(id) {
  const wood = new THREE.MeshLambertMaterial({ color: 0xa5825a });
  const cloth = new THREE.MeshLambertMaterial({ color: 0xd0784a });
  if (id === 'matelas') {
    const bed = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.35, 1.9), wood);
    bed.position.set(2.1, 0.25, 0);
    ROOM.add(bed);
    const mat = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.16, 1.8), new THREE.MeshLambertMaterial({ color: 0xece6d8 }));
    mat.position.set(2.1, 0.5, 0);
    ROOM.add(mat);
    const blanket = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.08, 1.0), cloth);
    blanket.position.set(2.1, 0.6, 0.3);
    ROOM.add(blanket);
  } else if (id === 'kitchenette') {
    const counter = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.85, 0.55), wood);
    counter.position.set(-0.8, 0.48, -0.78);
    ROOM.add(counter);
    const stove = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.4), new THREE.MeshLambertMaterial({ color: 0x2c2c30 }));
    stove.position.set(-1.1, 0.94, -0.75);
    ROOM.add(stove);
    const sink = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.14, 0.1, 10), new THREE.MeshLambertMaterial({ color: 0xb8bcc2 }));
    sink.position.set(-0.4, 0.93, -0.75);
    ROOM.add(sink);
  } else if (id === 'etageres') {
    for (let k = 0; k < 2; k++) {
      const sh = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.06, 0.34), wood);
      sh.position.set(0.7, 1.25 + k * 0.4, -0.9);
      ROOM.add(sh);
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.22, 0.26), new THREE.MeshLambertMaterial({ color: k ? 0x7f9c6a : 0xc9b98a }));
      box.position.set(0.3 + k * 0.7, 1.4 + k * 0.4, -0.9);
      ROOM.add(box);
    }
  } else if (id === 'deco') {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.1, 0.22, 8), new THREE.MeshLambertMaterial({ color: 0xb86a4a }));
    pot.position.set(-2.3, 0.16, 0.75);
    ROOM.add(pot);
    const plant = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 0), new THREE.MeshLambertMaterial({ color: 0x5d9c4d }));
    plant.position.set(-2.3, 0.42, 0.75);
    ROOM.add(plant);
    const rug = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.65, 0.03, 12), new THREE.MeshLambertMaterial({ color: 0x9c5f6a }));
    rug.position.set(0.2, 0.08, 0.3);
    ROOM.add(rug);
  } else if (id === 'guirlande') {
    for (let k = 0; k < 8; k++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 5),
        new THREE.MeshBasicMaterial({ color: [0xffd98a, 0x8ae0d0, 0xf0a0a8][k % 3] }));
      b.position.set(-2.4 + k * 0.65, 1.9 + Math.sin(k * 1.3) * 0.08, -0.95);
      ROOM.add(b);
    }
    const gl = new THREE.PointLight(0xffd0a0, 0.7, 8);
    gl.position.set(0, 1.8, -0.5);
    ROOM.add(gl);
  } else if (id === 'radio') {
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.22, 0.16), new THREE.MeshLambertMaterial({ color: 0x6a4a38 }));
    r.position.set(-1.6, 1.0, -0.8);
    ROOM.add(r);
    const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 8), new THREE.MeshLambertMaterial({ color: 0xd9b455 }));
    dial.rotation.x = Math.PI / 2;
    dial.position.set(-1.5, 1.02, -0.71);
    ROOM.add(dial);
  } else if (id === 'solaire') {
    van.solarPanel.visible = true;
    const bat = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, 0.3), new THREE.MeshLambertMaterial({ color: 0x2b4d6e }));
    bat.position.set(-2.35, 0.25, -0.85);
    ROOM.add(bat);
  }
}

/* ---------- état du jeu ---------- */
const pos = new THREE.Vector3(spawn.x, spawn.h + 0.1, spawn.z);
const vel = new THREE.Vector3();
let mode = 'walk';               // walk | drive | interior
let onGround = true, gliding = false, swimming = false;
let faceAngle = Math.atan2(-spawn.x, -spawn.z), walkPhase = 0;
let camYaw = Math.atan2(spawn.x, spawn.z) + 0.35, camPitch = 0.3, camDist = 9;
let started = false, startAnim = 0;
let found = 0;
let energy = 100;
let gameMin = 8 * 60;            // jour 1, 08:00 — 1 s réelle = 1 min de jeu
let radioOn = false;

const keys = {};
let jumpPressed = false, ePressed = false, fPressed = false, tPressed = false;

/* ---------- entrées ---------- */
window.addEventListener('keydown', function (e) {
  if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) { jumpPressed = true; } }
  if (!e.repeat) {
    if (e.code === 'KeyE') { ePressed = true; }
    if (e.code === 'KeyF') { fPressed = true; }
    if (e.code === 'KeyT') { tPressed = true; }
  }
  keys[e.code] = true;
});
window.addEventListener('keyup', function (e) { keys[e.code] = false; });

let dragging = false, lastMX = 0, lastMY = 0;
canvas.addEventListener('pointerdown', function (e) { dragging = true; lastMX = e.clientX; lastMY = e.clientY; });
window.addEventListener('pointerup', function () { dragging = false; });
window.addEventListener('pointermove', function (e) {
  if (!dragging || mode === 'interior') { return; }
  camYaw -= (e.clientX - lastMX) * 0.005;
  camPitch = Math.max(-0.05, Math.min(1.25, camPitch + (e.clientY - lastMY) * 0.004));
  lastMX = e.clientX; lastMY = e.clientY;
});
window.addEventListener('wheel', function (e) {
  camDist = Math.max(4, Math.min(30, camDist + e.deltaY * 0.01));
}, { passive: true });

/* ---------- audio ---------- */
let AC = null, windGain = null, windFilter = null, engineOsc = null, engineGain = null, radioTimer = null;
function ensureAudio() {
  if (AC) { if (AC.state === 'suspended') { AC.resume(); } return; }
  try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
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
  const padG = AC.createGain(); padG.gain.value = 0.01;
  padG.connect(AC.destination);
  [110, 164.8, 220].forEach(function (f, i) {
    const o = AC.createOscillator();
    o.type = 'triangle'; o.frequency.value = f; o.detune.value = (i - 1) * 4;
    const g = AC.createGain(); g.gain.value = 0.5;
    o.connect(g).connect(padG);
    o.start();
  });
  engineOsc = AC.createOscillator();
  engineOsc.type = 'sawtooth'; engineOsc.frequency.value = 40;
  const ef = AC.createBiquadFilter();
  ef.type = 'lowpass'; ef.frequency.value = 240;
  engineGain = AC.createGain(); engineGain.gain.value = 0;
  engineOsc.connect(ef).connect(engineGain).connect(AC.destination);
  engineOsc.start();
}
function tone(f, dur, vol, type, when) {
  if (!AC) { return; }
  const t0 = AC.currentTime + (when || 0);
  const o = AC.createOscillator(), g = AC.createGain();
  o.type = type || 'sine'; o.frequency.value = f;
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(AC.destination);
  o.start(t0); o.stop(t0 + dur + 0.05);
}
function bell(f, vol, when) {
  if (!AC) { return; }
  const t0 = (when || 0);
  [1, 2.76, 5.4].forEach(function (m, i) {
    tone(f * m, 1.4 / (i + 1), vol / (i * 2 + 1), 'sine', t0);
  });
}
function chimeDiscover() { [523.25, 659.25, 783.99, 1046.5].forEach(function (f, i) { bell(f, 0.16, i * 0.12); }); }
function chimeVictory() { [523.25, 659.25, 783.99, 1046.5, 1318.5, 1568].forEach(function (f, i) { bell(f, 0.15, i * 0.15); }); }
function sfxPickup() { tone(660, 0.08, 0.08, 'triangle'); tone(880, 0.1, 0.06, 'triangle', 0.07); }
function sfxBuild() { tone(220, 0.1, 0.09, 'square'); tone(330, 0.12, 0.07, 'square', 0.12); bell(523, 0.1, 0.25); }
function setRadio(on) {
  radioOn = on;
  if (radioTimer) { clearInterval(radioTimer); radioTimer = null; }
  if (on && AC) {
    const scale = [261.6, 293.7, 329.6, 392, 440, 523.3];
    let step = 0;
    radioTimer = setInterval(function () {
      if (!radioOn) { return; }
      const base = [0, 3, 1, 4][Math.floor(step / 8) % 4];
      tone(scale[(base + [0, 2, 4, 2][step % 4]) % 6] * 0.5, 0.5, 0.045, 'triangle');
      if (step % 2 === 0) { tone(scale[(base + step) % 6], 0.35, 0.035, 'sine'); }
      step++;
    }, 340);
  }
}

/* ---------- HUD ---------- */
const elCount = document.getElementById('count');
const elConfort = document.getElementById('confort');
const elToast = document.getElementById('toast');
const elCompass = document.getElementById('compassInner');
const elTitle = document.getElementById('title');
const elHints = document.getElementById('hints');
const elClock = document.getElementById('clock');
const elEnergy = document.getElementById('energyFill');
const elFuelWrap = document.getElementById('fuelWrap');
const elFuel = document.getElementById('fuelFill');
const elInv = document.getElementById('inv');
const elPrompt = document.getElementById('prompt');
const elPanel = document.getElementById('panel');
const elFade = document.getElementById('fade');
let toastTimer = 0;
const toastQueue = [];
function toast(msg, long) {
  toastQueue.push({ msg: msg, dur: long ? 6 : 3.5 });
}
function refreshInv() {
  const names = { bois: 'Bois', ferraille: 'Ferraille', baies: 'Baies', repas: 'Repas', cristaux: 'Cristaux' };
  let html = '';
  for (const k in inv) {
    if (inv[k] > 0) { html += '<span class="chip">' + names[k] + ' ' + inv[k] + '</span>'; }
  }
  elInv.innerHTML = html;
  elConfort.textContent = 'Confort du van : ' + confortPct() + ' %';
}
refreshInv();

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
  toast('Ton vieux camping-car est vide. Toute une île t’attend.', true);
  setTimeout(function () { toast('Récolte du bois et de la ferraille pour aménager ton chez-toi roulant.', true); }, 9000);
  setTimeout(function () { elHints.classList.add('hide'); }, 20000);
});

/* ---------- panneau habitacle ---------- */
function costText(cost) {
  const names = { bois: 'bois', ferraille: 'ferraille', baies: 'baies', cristaux: 'cristal' };
  const parts = [];
  for (const k in cost) { parts.push(cost[k] + ' ' + names[k]); }
  return parts.join(' · ');
}
function canAfford(cost) {
  for (const k in cost) { if ((inv[k] || 0) < cost[k]) { return false; } }
  return true;
}
function buy(id) {
  const u = upgradeById(id);
  if (!u || u.done || !canAfford(u.cost)) { return false; }
  for (const k in u.cost) { inv[k] -= u.cost[k]; }
  u.done = true;
  buildFurniture(id);
  sfxBuild();
  toast(u.name + ' — installé !');
  if (confortPct() === 100) {
    setTimeout(function () { toast('Ton van est enfin un vrai chez-toi. 100 % de confort.', true); }, 2500);
  }
  refreshInv();
  renderPanel();
  return true;
}
function sleepNow() {
  const hasBed = upgradeById('matelas').done;
  elFade.classList.add('on');
  setTimeout(function () {
    const day = Math.floor(gameMin / 1440);
    let target = day * 1440 + 7 * 60;
    if (gameMin >= target - 30) { target += 1440; }
    gameMin = target;
    energy = hasBed ? 100 : 55;
    toast(hasBed ? 'Une vraie nuit de sommeil. Énergie au maximum.' : 'Nuit inconfortable sur le siège… (installe un lit)');
    elFade.classList.remove('on');
    renderPanel();
  }, 1000);
}
function cookMeal() {
  if (!upgradeById('kitchenette').done || inv.baies < 4) { return; }
  inv.baies -= 4; inv.repas += 1;
  sfxPickup();
  toast('Un repas de route est prêt.');
  refreshInv();
  renderPanel();
}
function eat() {
  if (inv.repas > 0) {
    inv.repas--; energy = Math.min(100, energy + 45);
    toast('Un bon repas. +45 énergie.');
  } else if (inv.baies >= 3) {
    inv.baies -= 3; energy = Math.min(100, energy + 12);
    toast('Quelques baies. +12 énergie.');
  } else {
    toast('Rien à manger… cueille des baies.');
  }
  refreshInv();
}
function renderPanel() {
  let html = '<h2>L’habitacle</h2><div class="small">Ton chez-toi roulant — confort ' + confortPct() + ' %</div>';
  html += '<h3>Vivre</h3>';
  html += '<button class="pbtn" data-act="sleep">Dormir jusqu’au matin' +
    (upgradeById('matelas').done ? '' : ' <span class="cost">sans lit : récupération partielle</span>') + '</button>';
  if (upgradeById('kitchenette').done) {
    html += '<button class="pbtn" data-act="cook"' + (inv.baies < 4 ? ' disabled' : '') +
      '>Cuisiner un repas <span class="cost">4 baies → 1 repas (+45 énergie)</span></button>';
  }
  if (inv.repas > 0 || inv.baies >= 3) {
    html += '<button class="pbtn" data-act="eat">Manger <span class="cost">' +
      (inv.repas > 0 ? 'repas +45' : '3 baies +12') + ' énergie</span></button>';
  }
  if (upgradeById('radio').done) {
    html += '<button class="pbtn" data-act="radio">' + (radioOn ? 'Éteindre' : 'Allumer') + ' la radio</button>';
  }
  html += '<h3>Aménagements</h3>';
  for (const u of upgrades) {
    if (u.done) {
      html += '<button class="pbtn done" disabled>' + u.name + ' ✓ <span class="cost">' + u.desc + '</span></button>';
    } else {
      html += '<button class="pbtn" data-act="buy" data-id="' + u.id + '"' + (canAfford(u.cost) ? '' : ' disabled') + '>' +
        'Installer : ' + u.name + ' <span class="cost">' + costText(u.cost) + ' — ' + u.desc + '</span></button>';
    }
  }
  html += '<h3></h3><button class="pbtn" data-act="exit">Sortir du van (F)</button>';
  elPanel.innerHTML = html;
}
elPanel.addEventListener('click', function (e) {
  const btn = e.target.closest('button');
  if (!btn) { return; }
  const act = btn.getAttribute('data-act');
  if (act === 'buy') { buy(btn.getAttribute('data-id')); }
  else if (act === 'sleep') { sleepNow(); }
  else if (act === 'cook') { cookMeal(); }
  else if (act === 'eat') { eat(); renderPanel(); }
  else if (act === 'radio') { setRadio(!radioOn); renderPanel(); }
  else if (act === 'exit') { exitToWalk(); }
});

/* ---------- modes ---------- */
function nearVan() {
  const dx = pos.x - van.x, dz = pos.z - van.z;
  return dx * dx + dz * dz < 6 * 6;
}
function enterDrive() {
  mode = 'drive';
  player.visible = false;
  elFuelWrap.style.display = 'block';
  toast(van.fuel > 1 ? 'Sur la route.' : 'Le réservoir est à sec… trouve des jerricans.');
}
function enterInterior() {
  mode = 'interior';
  player.visible = false;
  elPanel.style.display = 'block';
  renderPanel();
}
function exitToWalk() {
  const right = { x: Math.cos(van.heading), z: -Math.sin(van.heading) };
  pos.set(van.x + right.x * 2.6, terrainH(van.x + right.x * 2.6, van.z + right.z * 2.6), van.z + right.z * 2.6);
  vel.set(0, 0, 0);
  mode = 'walk';
  player.visible = true;
  onGround = true; gliding = false;
  elPanel.style.display = 'none';
  elFuelWrap.style.display = 'none';
}

/* ---------- interactions ---------- */
function nearestInteractable() {
  let best = null, bd = 3.5 * 3.5;
  for (const it of interactables) {
    if (!it.mesh.visible) { continue; }
    const dx = pos.x - it.x, dz = pos.z - it.z, dy = pos.y - it.y;
    const d = dx * dx + dz * dz;
    if (d < bd && Math.abs(dy) < 6) { bd = d; best = it; }
  }
  return best;
}
function takeInteractable(it) {
  it.mesh.visible = false;
  if (it.type === 'carburant') {
    van.fuel = Math.min(van.fuelMax, van.fuel + it.gain);
    toast('+' + it.gain + ' L de carburant dans le réservoir.');
  } else {
    inv[it.type] = (inv[it.type] || 0) + it.gain;
    toast('+' + it.gain + ' ' + it.type + '.');
  }
  sfxPickup();
  refreshInv();
}

/* ---------- couleurs jour/nuit ---------- */
const C_DAY_TOP = new THREE.Color(0x4f92c4), C_DAY_BOT = new THREE.Color(0xcfe3ea);
const C_SET_TOP = new THREE.Color(0x51518f), C_SET_BOT = new THREE.Color(0xf0a868);
const C_NGT_TOP = new THREE.Color(0x0b1026), C_NGT_BOT = new THREE.Color(0x1c2742);
const tmpA = new THREE.Color(), tmpB = new THREE.Color();
const waterDay = new THREE.Color(0x2f7fae), waterNight = new THREE.Color(0x11263c);

/* ---------- boucle ---------- */
const clock = new THREE.Clock();
const fwd = new THREE.Vector3(), right = new THREE.Vector3(), wish = new THREE.Vector3();

function isNight() {
  const dayT = (gameMin % 1440) / 1440;
  return Math.sin(dayT * Math.PI * 2 - Math.PI / 2) < -0.05;
}

function updateWalk(dt) {
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

  const tired = energy <= 0;
  const run = (keys.ShiftLeft || keys.ShiftRight) && !tired;
  let speed = run ? 4.6 : 2.2;             // m/s — allure réaliste
  if (tired) { speed *= 0.55; }
  const sl = terrainSlope(pos.x, pos.z);
  speed *= 1 - Math.min(0.62, Math.max(0, (sl - 0.4) * 1.0));
  if (swimming) { speed *= 0.45; }

  // énergie
  if (moving) {
    let drain = run ? 0.12 : 0.045;
    if (sl > 0.35) { drain += 0.1; }
    if (isNight()) { drain *= 1.4; }
    energy = Math.max(0, energy - drain * dt * (onGround || swimming ? 1 : 0.3));
    if (energy === 0 && !updateWalk.warned) {
      updateWalk.warned = true;
      toast('Épuisé·e… mange ou dors dans le van.');
    }
    if (energy > 10) { updateWalk.warned = false; }
  }

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
    if (jumpPressed) { vel.y = 4.5; onGround = false; pos.y += 0.2; }
  } else if (onGround) {
    gliding = false;
    if (moving) {
      vel.x += (wish.x * speed - vel.x) * Math.min(1, dt * 9);
      vel.z += (wish.z * speed - vel.z) * Math.min(1, dt * 9);
    } else {
      vel.x *= Math.max(0, 1 - dt * 10); vel.z *= Math.max(0, 1 - dt * 10);
    }
    if (jumpPressed) {
      vel.y = 5.6;
      onGround = false;
    }
  } else {
    if (jumpPressed && vel.y < 1) { gliding = !gliding; }
    if (gliding) {
      const gspeed = 9.5;
      if (moving) {
        vel.x += (wish.x * gspeed - vel.x) * Math.min(1, dt * 2.2);
        vel.z += (wish.z * gspeed - vel.z) * Math.min(1, dt * 2.2);
      }
      vel.y -= 14 * dt;
      if (vel.y < -1.7) { vel.y = -1.7; }
    } else {
      if (moving) {
        vel.x += wish.x * 8 * dt;
        vel.z += wish.z * 8 * dt;
      }
      vel.y -= 14 * dt;
    }
  }

  pos.x += vel.x * dt;
  pos.z += vel.z * dt;
  pos.y += vel.y * dt;

  const rr = Math.sqrt(pos.x * pos.x + pos.z * pos.z);
  if (rr > 4200) {
    pos.x *= 4200 / rr; pos.z *= 4200 / rr;
    vel.x *= -0.2; vel.z *= -0.2;
    toast('Le vent te ramène vers Éolia…');
  }

  const gh = terrainH(pos.x, pos.z);
  if (!swimming && pos.y <= gh) {
    pos.y = gh;
    if (vel.y < -11) { bell(98, 0.05); }
    vel.y = 0;
    onGround = true;
    gliding = false;
  } else if (!swimming && pos.y > gh + 0.25) {
    onGround = false;
  }

  // animation
  player.position.copy(pos);
  if (moving) {
    const target = Math.atan2(wish.x, wish.z);
    faceAngle += wrapAngle(target - faceAngle) * Math.min(1, dt * 10);
  }
  player.rotation.y = faceAngle;
  const hSpeed = Math.sqrt(vel.x * vel.x + vel.z * vel.z);
  if (onGround && hSpeed > 0.3) {
    walkPhase += dt * hSpeed * 3.4;
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

  // interactions
  const it = nearestInteractable();
  if (nearVan()) {
    showPrompt('<b>E</b> — prendre le volant · <b>F</b> — entrer dans l’habitacle');
    if (ePressed) { enterDrive(); }
    else if (fPressed) { enterInterior(); }
  } else if (it) {
    showPrompt('<b>E</b> — ' + it.label);
    if (ePressed) { takeInteractable(it); }
  } else {
    showPrompt(null);
  }
  if (tPressed) { eat(); }
}

function updateDrive(dt) {
  const accel = (keys.KeyW || keys.ArrowUp) ? 1 : 0;
  const brake = (keys.KeyS || keys.ArrowDown) ? 1 : 0;
  const steer = ((keys.KeyA || keys.ArrowLeft) ? 1 : 0) - ((keys.KeyD || keys.ArrowRight) ? 1 : 0);

  const solar = upgradeById('solaire').done;
  if (accel && van.fuel > 0) { van.speed += 5.5 * dt; }
  if (brake) { van.speed -= 6.5 * dt; }
  van.speed *= Math.max(0, 1 - dt * 0.25);
  van.speed = Math.max(-4, Math.min(22, van.speed));       // 22 m/s ≈ 80 km/h

  const fx = Math.sin(van.heading), fz = Math.cos(van.heading);
  const gradAlong = (terrainH(van.x + fx * 5, van.z + fz * 5) - terrainH(van.x - fx * 5, van.z - fz * 5)) / 10;
  van.speed -= gradAlong * 7 * dt * Math.sign(van.speed || 1);
  if (gradAlong > 0.42 && van.speed > 2.5) { van.speed = 2.5; }
  if (gradAlong > 0.6 && van.speed > 0) { van.speed = 0; toast('Trop raide pour le van.'); }

  van.heading += steer * dt * Math.min(1, Math.abs(van.speed) / 7) * 1.0 * Math.sign(van.speed);
  van.x += fx * van.speed * dt;
  van.z += fz * van.speed * dt;

  // l'océan arrête le van
  if (terrainH(van.x, van.z) < 0.5) {
    van.x -= fx * van.speed * dt; van.z -= fz * van.speed * dt;
    van.speed = 0;
  }

  // collisions sommaires avec les arbres
  if (Math.abs(van.speed) > 1) {
    for (const t of treeSpots) {
      const dx = van.x - t.x, dz = van.z - t.z;
      if (dx * dx + dz * dz < 2.6 * 2.6) {
        van.speed = -Math.sign(van.speed) * 1.5;
        tone(70, 0.15, 0.12, 'square');
        break;
      }
    }
  }

  if (Math.abs(van.speed) > 0.3) {
    van.fuel = Math.max(0, van.fuel - dt * 0.1 * (solar ? 0.7 : 1));
    if (van.fuel === 0 && !updateDrive.dry) {
      updateDrive.dry = true;
      toast('Panne sèche ! Cherche des jerricans près des épaves.', true);
    }
  }

  pos.set(van.x, terrainH(van.x, van.z), van.z);   // le joueur suit le van

  if (ePressed) {
    van.speed = 0;
    exitToWalk();
    return;
  }
  showPrompt(Math.abs(van.speed) < 0.5 ? '<b>E</b> — descendre · <b>ZQSD</b> — rouler' : null);

  // caméra qui suit la route
  const targetYaw = van.heading + Math.PI;
  camYaw += wrapAngle(targetYaw - camYaw) * Math.min(1, dt * 1.6);

  if (engineGain) {
    engineGain.gain.value += ((Math.abs(van.speed) > 0.2 ? 0.035 + Math.abs(van.speed) / 22 * 0.05 : 0) - engineGain.gain.value) * dt * 4;
    engineOsc.frequency.value = 38 + Math.abs(van.speed) * 4.5;
  }
}

function updateVanVisual(dt) {
  van.group.position.set(van.x, terrainH(van.x, van.z) + 0.15, van.z);
  const fx = Math.sin(van.heading), fz = Math.cos(van.heading);
  const rx = Math.cos(van.heading), rz = -Math.sin(van.heading);
  const hF = terrainH(van.x + fx * 2.4, van.z + fz * 2.4);
  const hB = terrainH(van.x - fx * 2.4, van.z - fz * 2.4);
  const hL = terrainH(van.x - rx * 1.1, van.z - rz * 1.1);
  const hR = terrainH(van.x + rx * 1.1, van.z + rz * 1.1);
  van.group.rotation.y = van.heading;
  van.group.rotation.x += (Math.atan2(hB - hF, 4.8) - van.group.rotation.x) * Math.min(1, dt * 6);
  van.group.rotation.z += (Math.atan2(hL - hR, 2.2) - van.group.rotation.z) * Math.min(1, dt * 6);
}

let promptShown = null;
function showPrompt(html) {
  if (html === promptShown) { return; }
  promptShown = html;
  if (html) { elPrompt.innerHTML = html; elPrompt.style.display = 'block'; }
  else { elPrompt.style.display = 'none'; }
}

function updateCamera(dt) {
  if (mode === 'interior') {
    camera.position.set(ROOM.position.x + 3.6, ROOM.position.y + 3.2, ROOM.position.z + 3.4);
    camera.lookAt(ROOM.position.x, ROOM.position.y + 0.6, ROOM.position.z - 0.3);
    return;
  }
  const focus = mode === 'drive'
    ? { x: van.x, y: terrainH(van.x, van.z) + 2, z: van.z }
    : { x: pos.x, y: pos.y, z: pos.z };
  let d = (mode === 'drive' ? camDist + 7 : camDist);
  if (startAnim < 1) {
    startAnim = Math.min(1, startAnim + (started ? dt * 0.25 : 0));
    const k = 1 - Math.pow(1 - startAnim, 3);
    d = camDist + (170 - camDist) * (1 - k);
    camPitch = 0.3 + 0.5 * (1 - k);
  }
  const cx = focus.x + Math.sin(camYaw) * Math.cos(camPitch) * d;
  const cz = focus.z + Math.cos(camYaw) * Math.cos(camPitch) * d;
  let cy = focus.y + 2 + Math.sin(camPitch) * d;
  const minY = terrainH(cx, cz) + 1.5;
  if (cy < minY) { cy = minY; }
  camera.position.set(cx, cy, cz);
  camera.lookAt(focus.x, focus.y + 2.2, focus.z);
}

function fmtClock() {
  const day = Math.floor(gameMin / 1440) + 1;
  const m = Math.floor(gameMin % 1440);
  const h = Math.floor(m / 60), mm = Math.floor(m % 60);
  return 'Jour ' + day + ' · ' + String(h).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
}

function updateWorld(dt, t) {
  gameMin += dt;                       // 1 s réelle = 1 min de jeu
  const dayT = (gameMin % 1440) / 1440;
  const sa = dayT * Math.PI * 2 - Math.PI / 2;
  const sunY = Math.sin(sa);
  const sunDir = new THREE.Vector3(Math.cos(sa), sunY, 0.35).normalize();
  sun.position.copy(pos).addScaledVector(sunDir, 900);
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
  water.material.color.copy(waterDay).lerp(waterNight, 1 - dayK);

  sky.position.copy(camera.position);
  stars.position.set(camera.position.x, 0, camera.position.z);
  stars.rotation.y = t * 0.004;
  water.position.y = SEA + Math.sin(t * 0.7) * 0.12;
  water.position.x = camera.position.x;
  water.position.z = camera.position.z;

  for (const c of clouds) {
    c.position.x += c.userData.speed * dt;
    if (c.position.x > 6000) { c.position.x = -6000; }
  }
  for (const f of floatIslands) {
    f.position.y = f.userData.baseY + Math.sin(t * 0.25 + f.userData.phase) * 15;
  }
  for (const b of beacons) {
    b.crystal.rotation.y = t * 1.2;
    b.crystal.position.y = 10 + Math.sin(t * 1.6 + b.x) * 0.8;
  }

  // repos passif très lent quand on ne bouge pas
  if (mode !== 'walk' || vel.lengthSq() < 0.01) {
    energy = Math.min(100, energy + dt * 0.06);
  }

  // découverte des sanctuaires
  for (const b of beacons) {
    if (!b.found) {
      const dx = pos.x - b.x, dz = pos.z - b.z;
      if (dx * dx + dz * dz < 30 * 30 && Math.abs(pos.y - b.h) < 60) {
        b.found = true;
        found++;
        inv.cristaux += 1;
        b.crystal.material.color.set(0xffe9a8);
        b.crystal.material.emissive.set(0xffb52e);
        b.pillar.material.color.set(0xffce54);
        b.pillar.material.opacity = 0.07;
        elCount.textContent = found + ' / ' + beacons.length;
        refreshInv();
        if (found === beacons.length) {
          toast('Les sept sanctuaires veillent à nouveau. Éolia est à toi.', true);
          chimeVictory();
        } else {
          toast(b.name + ' — un cristal t’est offert. ' + found + ' / ' + beacons.length);
          chimeDiscover();
        }
      }
    }
  }

  // vent audio
  if (windGain) {
    const hSpeed = mode === 'drive' ? Math.abs(van.speed) : Math.sqrt(vel.x * vel.x + vel.z * vel.z);
    const target = mode === 'interior' ? 0.008 :
      0.02 + hSpeed / 25 * 0.06 + (gliding ? 0.1 : 0) + Math.max(0, pos.y) / 1500 * 0.04;
    windGain.gain.value += (target - windGain.gain.value) * dt * 3;
    windFilter.frequency.value = 320 + hSpeed * 30 + (gliding ? 260 : 0);
  }

  // boussole
  for (const m of compassMarks) {
    let a;
    if (m.beacon) {
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

  // HUD
  elClock.textContent = fmtClock();
  elEnergy.style.width = energy + '%';
  elEnergy.style.background = energy < 20 ? '#d0455a' : '';
  elFuel.style.width = (van.fuel / van.fuelMax * 100) + '%';

  if (toastTimer > 0) {
    toastTimer -= dt;
    if (toastTimer <= 0) { elToast.classList.remove('show'); }
  } else if (toastQueue.length) {
    const tq = toastQueue.shift();
    elToast.textContent = tq.msg;
    elToast.classList.add('show');
    toastTimer = tq.dur;
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
  if (started) {
    if (mode === 'walk') { updateWalk(dt); }
    else if (mode === 'drive') { updateDrive(dt); }
    else if (mode === 'interior') {
      if (fPressed || ePressed) { exitToWalk(); }
      showPrompt(null);
    }
  } else {
    player.position.copy(pos);
    player.rotation.y = faceAngle;
  }
  jumpPressed = false; ePressed = false; fPressed = false; tPressed = false;
  updateVanVisual(dt);
  updateCamera(dt);
  updateWorld(dt, t);
  renderer.render(scene, camera);
}
elCount.textContent = '0 / ' + beacons.length;
frame();

/* interface de debug (console) */
window.EOLIA = {
  teleport: function (x, y, z) { pos.set(x, y, z); vel.set(0, 0, 0); onGround = false; },
  setClock: function (min) { gameMin = min; },
  give: function (res, n) { inv[res] = (inv[res] || 0) + n; refreshInv(); },
  buy: buy,
  enterDrive: enterDrive,
  enterInterior: enterInterior,
  exitToWalk: exitToWalk,
  glide: function () { gliding = true; onGround = false; },
  vanTo: function (x, z) { van.x = x; van.z = z; },
  state: function () {
    return {
      mode: mode, x: pos.x, y: pos.y, z: pos.z,
      gliding: gliding, onGround: onGround, swimming: swimming,
      found: found, energy: Math.round(energy), clock: fmtClock(),
      fuel: Math.round(van.fuel * 10) / 10, vanX: Math.round(van.x), vanZ: Math.round(van.z),
      vanSpeed: Math.round(van.speed * 10) / 10,
      inv: JSON.parse(JSON.stringify(inv)),
      confort: confortPct(),
      upgrades: upgrades.filter(function (u) { return u.done; }).map(function (u) { return u.id; }),
    };
  },
};
}

if (typeof window !== 'undefined') {
  init();
} else if (typeof module !== 'undefined') {
  module.exports = { terrainH: terrainH, terrainSlope: terrainSlope, findBeaconSpots: findBeaconSpots, findSpawn: findSpawn, findPeak: findPeak };
}
