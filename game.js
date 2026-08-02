/* ============================================================
   L'ATELIER DE MINUIT — Prologue : le garage
   ------------------------------------------------------------
   Direction artistique : toon-shading à paliers, contours encrés,
   tungstène ambré contre nuit bleue. 1 unité = 1 mètre.
   ============================================================ */
'use strict';

/* ---------------------------------------------------------- */
/* 0. Constantes générales                                     */
/* ---------------------------------------------------------- */
const ROOM = { w: 7.2, d: 5.6, h: 2.9 };          // garage : 7,2 m × 5,6 m, plafond 2,9 m
const CHAR = {
  height: 1.78,
  radius: 0.26,          // capsule de collision
  hipY: 0.93,            // hauteur de l'articulation de hanche
  thigh: 0.44, shin: 0.40, ankleY: 0.09,
  hipHalf: 0.10,         // demi-écart des hanches
  walkSpeed: 1.5, runSpeed: 4.4,
  accel: 30, friction: 11, turnRate: 11,
};
const CAM = {
  fov: 55, minDist: 1.5, maxDist: 4.8, dist0: 3.1,
  minPitch: -0.42, maxPitch: 1.22, sens: 0.0022,
  targetH: 1.38, margin: 0.22,
};

const PAL = {
  night: 0x0c1220, plaster: 0x5a6480, panel: 0x2d3652,
  floor: 0x454b58, warm: 0xffb066, moon: 0x8fb3ff,
  suit: 0xc96a34, suitDark: 0x9c4d22, cream: 0xe8dcc8,
  skin: 0xe2a67c, hair: 0x3a2a20, boots: 0x4a3327,
  sole: 0x2b2018, cap: 0x5b5244, brass: 0xc9a34a,
  red: 0xa63a35, teal: 0x3f6f6a, ink: 0x191219,
};

/* ---------------------------------------------------------- */
/* 1. Petites aides                                            */
/* ---------------------------------------------------------- */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (a, b, l, dt) => lerp(a, b, 1 - Math.exp(-l * dt));
const smooth = t => t * t * (3 - 2 * t);
const sstep = (a, b, v) => smooth(clamp((v - a) / (b - a), 0, 1));
const wrapPi = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const dampAngle = (cur, tgt, l, dt) => cur + wrapPi(tgt - cur) * (1 - Math.exp(-l * dt));
// bruit doux 1D (regards, balancements)
const noise1 = t => Math.sin(t * 1.7) * 0.5 + Math.sin(t * 0.83 + 1.3) * 0.32 + Math.sin(t * 2.9 + 4.1) * 0.18;

const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const X_AXIS = new THREE.Vector3(1, 0, 0), Y_AXIS = new THREE.Vector3(0, 1, 0), DOWN = new THREE.Vector3(0, -1, 0);

/* ---------------------------------------------------------- */
/* 2. Interface (CSS + HUD injectés)                           */
/* ---------------------------------------------------------- */
const css = document.createElement('style');
css.textContent = `
  html,body{margin:0;height:100%;overflow:hidden;background:#0c1220}
  #stage{position:fixed;inset:0}
  #stage canvas{display:block;width:100%;height:100%}
  .vignette{position:fixed;inset:0;pointer-events:none;z-index:5;
    background:radial-gradient(ellipse at 50% 42%, transparent 52%, rgba(5,8,16,.55) 100%)}
  .hud{position:fixed;z-index:10;color:#e8dcc8;user-select:none;pointer-events:none;
    font-family:Georgia,'Times New Roman',serif}
  #title{top:26px;left:32px}
  #title .t1{font-size:21px;letter-spacing:.42em;color:#ffb066;text-shadow:0 2px 12px rgba(0,0,0,.7)}
  #title .t2{margin-top:5px;font-size:12px;letter-spacing:.14em;opacity:.72;font-style:italic}
  #keys{bottom:22px;right:26px;font-family:'Courier New',monospace;font-size:12px;line-height:1.85;
    background:rgba(10,14,26,.62);border:1px solid rgba(232,220,200,.16);border-radius:8px;
    padding:10px 16px;backdrop-filter:blur(3px)}
  #keys b{color:#ffb066;font-weight:normal}
  #enter{position:fixed;inset:0;z-index:20;display:flex;align-items:center;justify-content:center;
    flex-direction:column;background:rgba(8,11,20,.55);cursor:pointer;
    font-family:Georgia,serif;color:#e8dcc8;transition:opacity .5s;backdrop-filter:blur(2px)}
  #enter .big{font-size:26px;letter-spacing:.5em;color:#ffb066;margin-bottom:14px;
    text-shadow:0 0 24px rgba(255,176,102,.35)}
  #enter .small{font-size:13px;letter-spacing:.2em;opacity:.8;font-style:italic}
  #enter.hidden{opacity:0;pointer-events:none}
  #hint{bottom:24px;left:50%;transform:translateX(-50%);font-family:'Courier New',monospace;
    font-size:11px;letter-spacing:.12em;opacity:0;transition:opacity .6s;color:#b9c2d8}
`;
document.head.appendChild(css);
document.body.insertAdjacentHTML('beforeend', `
  <div id="stage"></div>
  <div class="vignette"></div>
  <div class="hud" id="title"><div class="t1">L'ATELIER</div><div class="t2">Prologue&nbsp;— minuit et quart</div></div>
  <div class="hud" id="keys"><b>ZQSD</b> / <b>WASD</b>&nbsp; se déplacer<br><b>Shift</b>&nbsp; courir<br><b>Souris</b>&nbsp; caméra&nbsp; · &nbsp;<b>Molette</b>&nbsp; zoom<br><b>M</b>&nbsp; son</div>
  <div class="hud" id="hint">Échap pour libérer la souris</div>
  <div id="enter"><div class="big">L'ATELIER</div><div class="small">— cliquer pour allumer la lumière —</div></div>
`);

/* ---------------------------------------------------------- */
/* 3. Rendu                                                    */
/* ---------------------------------------------------------- */
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
document.getElementById('stage').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PAL.night);
const camera = new THREE.PerspectiveCamera(CAM.fov, innerWidth / innerHeight, 0.05, 60);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

/* ---------------------------------------------------------- */
/* 4. Textures peintes (canvas)                                */
/* ---------------------------------------------------------- */
function canvasTex(size, draw, repX = 1, repY = 1) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.encoding = THREE.sRGBEncoding;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repX, repY);
  t.anisotropy = 4;
  return t;
}
// palier de toon-shading (4 tons)
const gradCanvas = document.createElement('canvas'); gradCanvas.width = 4; gradCanvas.height = 1;
{ const g = gradCanvas.getContext('2d');
  ['#30303a', '#6a6a74', '#b8b8c0', '#efefef'].forEach((col, i) => { g.fillStyle = col; g.fillRect(i, 0, 1, 1); }); }
const gradMap = new THREE.CanvasTexture(gradCanvas);
gradMap.minFilter = gradMap.magFilter = THREE.NearestFilter;

const floorTex = canvasTex(1024, (g, s) => {
  g.fillStyle = '#3a4050'; g.fillRect(0, 0, s, s);
  // moucheture du béton
  for (let i = 0; i < 5200; i++) {
    const a = Math.random();
    g.fillStyle = a < .5 ? 'rgba(255,255,255,.030)' : 'rgba(6,8,14,.05)';
    g.fillRect(Math.random() * s, Math.random() * s, 1 + Math.random() * 2.2, 1 + Math.random() * 2.2);
  }
  // joints de dalle
  g.strokeStyle = 'rgba(10,12,20,.35)'; g.lineWidth = 3;
  g.strokeRect(2, 2, s - 4, s - 4);
  g.beginPath(); g.moveTo(s / 2, 0); g.lineTo(s / 2, s); g.moveTo(0, s / 2); g.lineTo(s, s / 2); g.stroke();
  // taches d'huile
  const stain = (x, y, r, al) => {
    const rg = g.createRadialGradient(x, y, r * .15, x, y, r);
    rg.addColorStop(0, `rgba(12,10,18,${al})`); rg.addColorStop(1, 'rgba(12,10,18,0)');
    g.fillStyle = rg; g.beginPath(); g.ellipse(x, y, r, r * .7, Math.random() * 3, 0, 7); g.fill();
  };
  stain(s * .32, s * .40, 90, .55); stain(s * .36, s * .47, 46, .45);
  stain(s * .72, s * .70, 60, .38); stain(s * .60, s * .22, 34, .3);
  // bande jaune peinte, usée
  g.strokeStyle = 'rgba(214,171,54,.36)'; g.lineWidth = 10;
  g.setLineDash([64, 26]); g.strokeRect(s * .09, s * .09, s * .82, s * .82); g.setLineDash([]);
}, 2, 2);
floorTex.repeat.set(1, 1);

const wallTex = canvasTex(512, (g, s) => {
  // plâtre haut / lambris bas
  g.fillStyle = '#454e6c'; g.fillRect(0, 0, s, s);
  for (let i = 0; i < 1300; i++) {
    g.fillStyle = Math.random() < .5 ? 'rgba(255,255,255,.03)' : 'rgba(8,10,18,.04)';
    g.fillRect(Math.random() * s, Math.random() * s, 2, 2);
  }
  const hBand = s * .42;                       // partie basse (~1,2 m)
  g.fillStyle = '#1f2840'; g.fillRect(0, s - hBand, s, hBand);
  g.fillStyle = 'rgba(255,255,255,.05)'; g.fillRect(0, s - hBand, s, 4);
  for (let x = 0; x < s; x += 42) { g.fillStyle = 'rgba(10,13,24,.5)'; g.fillRect(x, s - hBand + 6, 2, hBand - 6); }
  // salissures près du sol
  const rg = g.createLinearGradient(0, s - 30, 0, s);
  rg.addColorStop(0, 'rgba(8,8,14,0)'); rg.addColorStop(1, 'rgba(8,8,14,.4)');
  g.fillStyle = rg; g.fillRect(0, s - 30, s, 30);
});

const posterTex = canvasTex(256, (g, s) => {
  g.fillStyle = '#20304a'; g.fillRect(0, 0, s, s);
  g.fillStyle = '#e8dcc8'; g.fillRect(10, 10, s - 20, s - 20);
  g.fillStyle = '#20304a'; g.fillRect(18, 18, s - 36, s - 36);
  // silhouette de fourgon (clin d'œil à la suite…)
  g.fillStyle = '#e8dcc8';
  g.beginPath();
  g.moveTo(52, 168); g.lineTo(52, 118); g.quadraticCurveTo(54, 96, 78, 92);
  g.lineTo(148, 88); g.quadraticCurveTo(190, 88, 204, 128); g.lineTo(206, 168); g.closePath(); g.fill();
  g.fillStyle = '#20304a';
  g.beginPath(); g.arc(88, 170, 15, 0, 7); g.arc(176, 170, 15, 0, 7); g.fill();
  g.fillRect(64, 100, 34, 26); g.fillRect(108, 98, 34, 26);
  g.fillStyle = '#d6ab36'; g.font = 'bold 26px Georgia'; g.textAlign = 'center';
  g.fillText('UN JOUR,', s / 2, 52); g.fillText('LA ROUTE', s / 2, 214);
});

const pegTex = canvasTex(256, (g, s) => {
  g.fillStyle = '#6e5a3f'; g.fillRect(0, 0, s, s);
  g.fillStyle = 'rgba(30,22,12,.6)';
  for (let y = 12; y < s; y += 24) for (let x = 12; x < s; x += 24) { g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill(); }
});

/* ---------------------------------------------------------- */
/* 5. Matériaux                                                */
/* ---------------------------------------------------------- */
const M = {};
const toon = (color, opts = {}) => Object.assign(new THREE.MeshToonMaterial({ color, gradientMap: gradMap }), opts);
M.floor = toon(0xffffff, { map: floorTex });
M.wall = toon(0xffffff, { map: wallTex });
M.ceil = toon(0x262d45);
M.suit = toon(PAL.suit); M.suitDark = toon(PAL.suitDark);
M.cream = toon(PAL.cream); M.skin = toon(PAL.skin);
M.hair = toon(PAL.hair); M.boots = toon(PAL.boots); M.sole = toon(PAL.sole);
M.cap = toon(PAL.cap); M.brass = toon(PAL.brass);
M.red = toon(0x8f2f2b); M.redDark = toon(0x63211e);
M.teal = toon(0x33605a); M.metal = toon(0x5c6572);
M.metalDark = toon(0x363d4c); M.wood = toon(0x6e5236);
M.tire = toon(0x23262c); M.tarp = toon(0x40514a);
M.eye = new THREE.MeshBasicMaterial({ color: 0x241a14 });
M.bulb = new THREE.MeshBasicMaterial({ color: 0xffd9a0 });
M.window = new THREE.MeshBasicMaterial({ map: canvasTex(256, (g, s) => {
  const grad = g.createLinearGradient(0, 0, 0, s);
  grad.addColorStop(0, '#2a4372'); grad.addColorStop(1, '#101c38');
  g.fillStyle = grad; g.fillRect(0, 0, s, s);
  g.fillStyle = 'rgba(255,255,255,.8)';
  for (let i = 0; i < 26; i++) { const r = Math.random() * 1.4 + 0.4; g.beginPath(); g.arc(Math.random() * s, Math.random() * s, r, 0, 7); g.fill(); }
  g.fillStyle = '#dfe8f8'; g.beginPath(); g.arc(s * .72, s * .34, 13, 0, 7); g.fill();
  g.fillStyle = '#22375e'; g.beginPath(); g.arc(s * .68, s * .30, 11, 0, 7); g.fill();
}) });
M.outline = new THREE.MeshBasicMaterial({ color: PAL.ink, side: THREE.BackSide });

/* ---------------------------------------------------------- */
/* 6. Le garage                                                */
/* ---------------------------------------------------------- */
const colliders = [];   // AABB {minX,maxX,minZ,maxZ, maxY} pour perso + caméra
function addCollider(x, z, w, d, h) {
  colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, maxY: h });
}
const box = (w, h, d, mat, x = 0, y = 0, z = 0, parent = scene) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; parent.add(m); return m;
};
const cyl = (r1, r2, h, mat, x = 0, y = 0, z = 0, parent = scene, seg = 20) => {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg), mat);
  m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; parent.add(m); return m;
};

function buildGarage() {
  const { w, d, h } = ROOM;
  // sol / plafond
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), M.floor);
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(w, d), M.ceil);
  ceil.rotation.x = Math.PI / 2; ceil.position.y = h; scene.add(ceil);
  // murs (face intérieure)
  const mkWall = (ww, x, z, ry) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(ww, h), M.wall.clone());
    m.material.map = wallTex.clone(); m.material.map.needsUpdate = true;
    m.material.map.repeat.set(ww / 2.9, 1);
    m.position.set(x, h / 2, z); m.rotation.y = ry; m.receiveShadow = true; scene.add(m); return m;
  };
  mkWall(w, 0, -d / 2, 0);            // mur nord (porte de garage)
  mkWall(w, 0, d / 2, Math.PI);       // mur sud (établi)
  mkWall(d, -w / 2, 0, Math.PI / 2);  // ouest
  mkWall(d, w / 2, 0, -Math.PI / 2);  // est

  // --- porte sectionnelle (fermée), mur nord ---
  const door = new THREE.Group(); door.position.set(0, 0, -d / 2 + 0.06); scene.add(door);
  for (let i = 0; i < 5; i++) {
    const p = box(2.6, 0.40, 0.055, M.metalDark, 0, 0.22 + i * 0.43, 0, door);
    box(2.44, 0.30, 0.02, M.metal, 0, 0.22 + i * 0.43, 0.032, door);
    p.receiveShadow = true;
  }
  box(0.09, 2.25, 0.10, M.metalDark, -1.38, 1.12, 0, door);
  box(0.09, 2.25, 0.10, M.metalDark, 1.38, 1.12, 0, door);
  box(0.55, 0.16, 0.03, M.metal, 0, 1.02, 0.06, door); // poignée
  // enseigne émaillée au-dessus de la porte
  const sign = box(1.5, 0.34, 0.04, M.teal, 0, 2.55, 0.02, door);
  sign.add(new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.24),
    toon(0xffffff, { map: canvasTex(256, (g, s) => {
      g.fillStyle = '#3f6f6a'; g.fillRect(0, 0, s, s);
      g.strokeStyle = '#e8dcc8'; g.lineWidth = 8; g.strokeRect(8, s * .34, s - 16, s * .32);
      g.fillStyle = '#e8dcc8'; g.font = 'bold 44px Georgia'; g.textAlign = 'center';
      g.fillText('GARAGE MODERNE', s / 2, s * .57);
    }) })));
  sign.children[0].position.z = 0.025;

  // --- établi, mur sud ---
  const bench = new THREE.Group(); bench.position.set(-1.0, 0, d / 2 - 0.36); scene.add(bench);
  box(2.3, 0.07, 0.64, M.wood, 0, 0.90, 0, bench);                    // plateau
  [[-1.05, -0.24], [-1.05, 0.24], [1.05, -0.24], [1.05, 0.24]].forEach(([x, z]) =>
    box(0.07, 0.88, 0.07, M.metalDark, x, 0.44, z, bench));
  box(2.1, 0.05, 0.5, M.wood, 0, 0.28, 0, bench);                     // étagère basse
  // étau, bidons, chiffon
  box(0.16, 0.14, 0.12, M.metalDark, 0.8, 0.99, 0.05, bench);
  cyl(0.06, 0.06, 0.02, M.metal, 0.8, 1.07, 0.05, bench);
  cyl(0.075, 0.075, 0.2, M.red, -0.62, 1.035, -0.1, bench);
  cyl(0.055, 0.055, 0.16, M.teal, -0.42, 1.015, 0.08, bench);
  box(0.3, 0.02, 0.22, M.cream, 0.25, 0.945, 0.1, bench).rotation.y = 0.4;
  addCollider(-1.0, d / 2 - 0.36, 2.4, 0.72, 0.95);
  // panneau à outils au-dessus
  const peg = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 0.95), toon(0xffffff, { map: pegTex }));
  peg.position.set(-1.0, 1.72, d / 2 - 0.045); peg.rotation.y = Math.PI; peg.receiveShadow = true; scene.add(peg);
  // quelques outils accrochés
  const tool = (x, y, len, rot) => {
    const t = new THREE.Group(); t.position.set(x, y, d / 2 - 0.075); t.rotation.z = rot; scene.add(t);
    box(0.035, len, 0.02, M.metal, 0, -len / 2, 0, t);
    cyl(0.036, 0.036, 0.045, M.metal, 0, 0.012, 0, t);
  };
  tool(-1.75, 1.98, 0.26, 0.12); tool(-1.5, 2.0, 0.32, -0.06); tool(-1.22, 1.96, 0.22, 0.2);
  tool(-0.6, 1.99, 0.3, -0.15); tool(-0.34, 1.95, 0.24, 0.05);
  // lampe d'établi
  const benchLampArm = new THREE.Group(); benchLampArm.position.set(-0.3, 2.3, d / 2 - 0.1); scene.add(benchLampArm);
  cyl(0.02, 0.02, 0.5, M.metalDark, 0, 0, -0.22, benchLampArm).rotation.x = Math.PI / 2.3;
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.14, 20, 1, true), M.teal);
  shade.position.set(0, -0.1, -0.48); shade.material.side = THREE.DoubleSide; benchLampArm.add(shade);
  const bulbB = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), M.bulb);
  bulbB.position.set(0, -0.15, -0.48); benchLampArm.add(bulbB);

  // --- rayonnage métallique, mur ouest ---
  const shelf = new THREE.Group(); shelf.position.set(-w / 2 + 0.26, 0, -0.6); scene.add(shelf);
  for (let i = 0; i < 4; i++) box(0.44, 0.04, 1.8, M.metalDark, 0, 0.14 + i * 0.55, 0, shelf);
  [[-0.19, -0.87], [-0.19, 0.87], [0.19, -0.87], [0.19, 0.87]].forEach(([x, z]) =>
    box(0.05, 1.84, 0.05, M.metal, x, 0.92, z, shelf));
  cyl(0.09, 0.09, 0.24, M.red, 0, 0.83, -0.5, shelf);
  cyl(0.09, 0.09, 0.24, M.teal, 0, 0.83, -0.24, shelf);
  cyl(0.07, 0.07, 0.2, M.cream, 0.02, 0.81, 0.02, shelf);
  box(0.34, 0.22, 0.5, M.wood, 0, 1.35, 0.45, shelf);
  box(0.3, 0.2, 0.34, M.wood, 0, 0.35, 0.55, shelf).rotation.y = 0.2;
  box(0.34, 0.24, 0.4, M.teal, 0, 1.94 - 0.55, -0.6, shelf);
  addCollider(-w / 2 + 0.26, -0.6, 0.62, 1.95, 1.9);

  // --- pile de pneus ---
  const tires = new THREE.Group(); tires.position.set(-w / 2 + 0.55, 0, 1.35); scene.add(tires);
  for (let i = 0; i < 4; i++) {
    const t = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.105, 12, 24), M.tire);
    t.rotation.x = Math.PI / 2; t.position.y = 0.105 + i * 0.20;
    t.rotation.z = i * 0.6; t.castShadow = t.receiveShadow = true; tires.add(t);
  }
  addCollider(-w / 2 + 0.55, 1.35, 0.78, 0.78, 0.85);

  // --- servante rouge (caisse à outils roulante), mur est ---
  const cab = new THREE.Group(); cab.position.set(w / 2 - 0.48, 0, 0.4); scene.add(cab);
  box(0.72, 0.82, 0.5, M.red, 0, 0.55, 0, cab);
  for (let i = 0; i < 4; i++) {
    box(0.62, 0.13, 0.02, M.redDark, 0, 0.28 + i * 0.18, 0.255, cab);
    box(0.3, 0.03, 0.03, M.metal, 0, 0.28 + i * 0.18, 0.27, cab);
  }
  box(0.72, 0.04, 0.52, M.metalDark, 0, 0.98, 0, cab);
  [[-0.28, -0.18], [-0.28, 0.18], [0.28, -0.18], [0.28, 0.18]].forEach(([x, z]) =>
    cyl(0.05, 0.05, 0.04, M.metalDark, x, 0.06, z, cab).rotation.z = Math.PI / 2);
  addCollider(w / 2 - 0.48, 0.4, 0.85, 0.65, 1.0);

  // --- bidon d'huile + caisse, coin nord-est ---
  cyl(0.3, 0.3, 0.9, M.teal, w / 2 - 0.55, 0.45, -d / 2 + 0.62, scene, 24);
  cyl(0.3, 0.3, 0.04, M.metalDark, w / 2 - 0.55, 0.91, -d / 2 + 0.62, scene, 24);
  addCollider(w / 2 - 0.55, -d / 2 + 0.62, 0.72, 0.72, 0.95);
  box(0.55, 0.34, 0.4, M.wood, -2.2, 0.17, -d / 2 + 0.5).rotation.y = -0.25;
  addCollider(-2.2, -d / 2 + 0.5, 0.72, 0.6, 0.4);

  // --- la forme sous la bâche (mystère…) ---
  const tarp = new THREE.Group(); tarp.position.set(1.6, 0, 1.7); tarp.rotation.y = -0.35; scene.add(tarp);
  const blob = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), M.tarp);
  blob.scale.set(1.05, 0.62, 0.52); blob.position.y = 0.52; blob.castShadow = blob.receiveShadow = true; tarp.add(blob);
  const blob2 = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12), M.tarp);
  blob2.scale.set(0.55, 0.5, 0.45); blob2.position.set(0.45, 0.75, 0); blob2.castShadow = true; tarp.add(blob2);
  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.12, 0.5, 22, 1, true), M.tarp);
  skirt.scale.set(1.05, 1, 0.55); skirt.position.y = 0.25; skirt.material.side = THREE.DoubleSide; skirt.castShadow = true; tarp.add(skirt);
  // corde
  const rope = new THREE.Mesh(new THREE.TorusGeometry(1.09, 0.018, 6, 30), toon(0xb08d55));
  rope.rotation.x = Math.PI / 2; rope.scale.set(1.03, 0.56, 1); rope.position.y = 0.34; tarp.add(rope);
  addCollider(1.6, 1.7, 2.3, 1.45, 1.1);

  // --- affiches, tableau électrique, fenêtre haute ---
  const poster = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.62), toon(0xffffff, { map: posterTex }));
  poster.position.set(w / 2 - 0.02, 1.75, 1.6); poster.rotation.y = -Math.PI / 2; poster.rotation.z = 0.02; scene.add(poster);
  const breaker = box(0.34, 0.5, 0.09, M.metal, -2.6, 1.7, d / 2 - 0.06);
  box(0.1, 0.06, 0.03, M.red, -2.6, 1.78, d / 2 - 0.1);
  breaker.receiveShadow = true;
  // bandeau vitré côté est (lueur de lune)
  const win = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.5), M.window);
  win.position.set(w / 2 - 0.02, 2.42, -0.6); win.rotation.y = -Math.PI / 2; scene.add(win);
  // cadre : traverses haut/bas + meneaux (rien devant la vitre)
  box(0.06, 0.05, 2.72, M.metalDark, w / 2 - 0.035, 2.68, -0.6);
  box(0.06, 0.05, 2.72, M.metalDark, w / 2 - 0.035, 2.16, -0.6);
  [-1.32, -0.44, 0.44, 1.32].forEach(o =>
    box(0.06, 0.56, 0.05, M.metalDark, w / 2 - 0.035, 2.42, -0.6 + o));

  // --- luminaire central (ampoule + abat-jour émaillé) ---
  const lampG = new THREE.Group(); lampG.position.set(0.15, h, -0.2); scene.add(lampG);
  cyl(0.012, 0.012, 0.62, M.metalDark, 0, -0.31, 0, lampG);
  const shade2 = new THREE.Mesh(new THREE.ConeGeometry(0.23, 0.18, 26, 1, true), M.teal);
  shade2.material = M.teal.clone(); shade2.material.side = THREE.DoubleSide;
  shade2.position.y = -0.66; lampG.add(shade2);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10), M.bulb);
  bulb.position.y = -0.74; lampG.add(bulb);

  return { lampPos: new THREE.Vector3(0.15, h - 0.78, -0.2), benchLampPos: new THREE.Vector3(-0.3, 2.13, d / 2 - 0.58) };
}
const anchors = buildGarage();

/* ---------------------------------------------------------- */
/* 7. Lumières                                                 */
/* ---------------------------------------------------------- */
scene.add(new THREE.HemisphereLight(0x223052, 0x100c09, 0.22));
// ampoule centrale sous abat-jour — cône chaud vers le sol
const keyLight = new THREE.SpotLight(0xffa25c, 2.0, 13, 1.0, 0.6, 1.3);
keyLight.position.copy(anchors.lampPos);
keyLight.target.position.set(0.15, 0, -0.2);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(1024, 1024);
keyLight.shadow.bias = -0.004;
keyLight.shadow.camera.near = 0.1; keyLight.shadow.camera.far = 12;
scene.add(keyLight, keyLight.target);
// halo chaud résiduel de l'ampoule (sans ombre)
const keyFill = new THREE.PointLight(0xffa25c, 0.35, 7, 1.8);
keyFill.position.copy(anchors.lampPos);
scene.add(keyFill);
// lampe d'établi
const benchLight = new THREE.PointLight(0xffc27d, 0.7, 4.5, 1.8);
benchLight.position.copy(anchors.benchLampPos);
scene.add(benchLight);
// lune par le bandeau vitré — contre-jour froid
const moon = new THREE.DirectionalLight(PAL.moon, 0.38);
moon.position.set(ROOM.w / 2 + 2, 3.4, -0.6);
moon.target.position.set(0, 0.5, 0.2);
scene.add(moon, moon.target);
// discret contre haut-arrière pour détacher le personnage
const rim = new THREE.DirectionalLight(0x9db4e8, 0.16);
rim.position.set(-2, 3.2, -3); scene.add(rim);

// poussières dans la lumière (points ronds et doux)
const dustSprite = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const g = c.getContext('2d');
  const rg = g.createRadialGradient(16, 16, 1, 16, 16, 15);
  rg.addColorStop(0, 'rgba(255,220,170,1)'); rg.addColorStop(1, 'rgba(255,220,170,0)');
  g.fillStyle = rg; g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
})();
const dustGeo = new THREE.BufferGeometry();
const dustN = 80, dustPos = new Float32Array(dustN * 3), dustSeed = [];
for (let i = 0; i < dustN; i++) {
  dustPos[i * 3] = 0.15 + (Math.random() - .5) * 2.2;
  dustPos[i * 3 + 1] = 0.4 + Math.random() * 2.0;
  dustPos[i * 3 + 2] = -0.2 + (Math.random() - .5) * 2.2;
  dustSeed.push(Math.random() * 20);
}
dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
  map: dustSprite, size: 0.022, transparent: true, opacity: 0.35,
  depthWrite: false, blending: THREE.AdditiveBlending }));
scene.add(dust);

/* ---------------------------------------------------------- */
/* 8. Le personnage — « Marcel »                               */
/* ---------------------------------------------------------- */
/* Hiérarchie : root(yaw) > hips > [spine > chest > neck > head,
   shoulderL/R > armL/R > foreL/R > handL/R] ; jambes : thighL/R > shinL/R > footL/R
   Jambes animées en IK analytique 2 os ; le reste en FK procédural. */

function limb(r1, r2, len, mat, parent) {
  // capsule effilée le long de -Y, pivot en haut
  const g = new THREE.Group(); parent.add(g);
  const geo = new THREE.CylinderGeometry(r2, r1, len, 14, 1);
  const m = new THREE.Mesh(geo, mat);
  m.position.y = -len / 2; m.castShadow = true; g.add(m);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(r1, 14, 10), mat);
  cap.position.y = -len; cap.castShadow = true; g.add(cap);
  const cap2 = new THREE.Mesh(new THREE.SphereGeometry(r2, 14, 10), mat);
  cap2.castShadow = true; g.add(cap2);
  return g;
}
function outline(mesh, k) {
  const o = new THREE.Mesh(mesh.geometry, M.outline);
  o.scale.copy(mesh.scale).multiplyScalar(k);
  o.position.copy(mesh.position); o.rotation.copy(mesh.rotation);
  mesh.parent.add(o);
  return o;
}
function outlineTree(root) {
  const list = [];
  root.traverse(o => { if (o.isMesh && o.material !== M.eye && o.material !== M.outline) list.push(o); });
  list.forEach(m => {
    if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
    const r = m.geometry.boundingSphere.radius * Math.max(m.scale.x, m.scale.y, m.scale.z);
    if (r < 0.045) return;                      // pas de contour sur les micro-détails
    outline(m, r > 0.14 ? 1.05 : 1.08);
  });
}

function buildCharacter() {
  const root = new THREE.Group(); scene.add(root);
  const B = {};                                   // les « os »
  B.root = root;

  B.hips = new THREE.Group(); B.hips.position.y = 0.98; root.add(B.hips);
  // bassin (le pivot des cuisses est à y = -0.05 dans le repère du bassin)
  const pelvis = new THREE.Mesh(new THREE.SphereGeometry(0.155, 18, 14), M.suit);
  pelvis.scale.set(1.12, 0.82, 0.86); pelvis.position.y = -0.03; pelvis.castShadow = true; B.hips.add(pelvis);
  // ceinture
  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.163, 0.168, 0.05, 18), M.boots);
  belt.scale.set(1.1, 1, 0.85); belt.position.y = 0.055; belt.castShadow = true; B.hips.add(belt);
  const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.04, 0.02), M.brass);
  buckle.position.set(0, 0.055, 0.15); B.hips.add(buckle);

  // colonne
  B.spine = new THREE.Group(); B.spine.position.y = 0.09; B.hips.add(B.spine);
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.138, 18, 14), M.suit);
  belly.scale.set(1.1, 0.94, 0.88); belly.position.y = 0.06; belly.castShadow = true; B.spine.add(belly);
  B.chest = new THREE.Group(); B.chest.position.y = 0.2; B.spine.add(B.chest);
  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.165, 18, 14), M.suit);
  chest.scale.set(1.16, 1.0, 0.88); chest.position.y = 0.1; chest.castShadow = true; B.chest.add(chest);
  // fermeture éclair + poche + écusson
  const zip = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.24, 0.01), M.suitDark);
  zip.position.set(0, 0.1, 0.145); zip.rotation.x = -0.1; B.chest.add(zip);
  const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.07, 0.014), M.suitDark);
  pocket.position.set(0.085, 0.13, 0.145); pocket.rotation.y = 0.18; B.chest.add(pocket);
  const patch = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.035, 0.012), M.cream);
  patch.position.set(-0.08, 0.16, 0.147); patch.rotation.y = -0.18; B.chest.add(patch);
  // col
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.11, 0.07, 14), M.cream);
  collar.position.y = 0.24; collar.castShadow = true; B.chest.add(collar);

  // cou et tête
  B.neck = new THREE.Group(); B.neck.position.y = 0.26; B.chest.add(B.neck);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.08, 12), M.skin);
  neck.position.y = 0.02; neck.castShadow = true; B.neck.add(neck);
  B.head = new THREE.Group(); B.head.position.y = 0.10; B.neck.add(B.head);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.105, 22, 18), M.skin);
  skull.scale.set(0.96, 1.1, 1.0); skull.position.y = 0.075; skull.castShadow = true; B.head.add(skull);
  // chevelure + casquette
  // nuque et tempes (l'arrière du crâne uniquement : phi ∈ [π, 2π] → z ≤ 0)
  const hairBack = new THREE.Mesh(new THREE.SphereGeometry(0.109, 18, 14, Math.PI * 0.92, Math.PI * 1.16, Math.PI * 0.3, Math.PI * 0.52), M.hair);
  hairBack.scale.set(1.0, 1.08, 1.0); hairBack.position.y = 0.075; B.head.add(hairBack);
  const capDome = new THREE.Mesh(new THREE.SphereGeometry(0.112, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.46), M.cap);
  capDome.scale.set(1.0, 0.82, 1.06); capDome.position.y = 0.108; capDome.castShadow = true; B.head.add(capDome);
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.115, 0.016, 18, 1, false, -Math.PI * 0.42, Math.PI * 0.84), M.cap);
  brim.position.set(0, 0.112, 0.055); brim.scale.z = 1.5; brim.castShadow = true; B.head.add(brim);
  // visage : yeux, sourcils, nez, moustache, oreilles
  const mkEye = sx => {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 8), M.eye);
    e.position.set(sx * 0.042, 0.075, 0.094); e.scale.set(1, 1.35, 0.6); B.head.add(e); return e;
  };
  const eyeL = mkEye(1), eyeR = mkEye(-1);
  const mkBrow = sx => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.011, 0.012), M.hair);
    b.position.set(sx * 0.043, 0.105, 0.093); b.rotation.z = sx * -0.12; B.head.add(b); return b;
  };
  mkBrow(1); mkBrow(-1);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.02, 10, 8), M.skin);
  nose.scale.set(0.85, 0.9, 1.1); nose.position.set(0, 0.055, 0.105); B.head.add(nose);
  const mous = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.016, 0.02), M.hair);
  mous.position.set(0, 0.033, 0.096); mous.rotation.x = 0.25; B.head.add(mous);
  const mkEar = sx => {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 8), M.skin);
    e.position.set(sx * 0.095, 0.06, 0.005); e.scale.set(0.5, 1, 0.8); B.head.add(e);
  };
  mkEar(1); mkEar(-1);
  B.head.scale.setScalar(1.12);         // tête un peu plus grande : lisibilité toon

  // bras
  const mkArm = sx => {
    const S = sx > 0 ? 'L' : 'R';
    const sh = new THREE.Group(); sh.position.set(sx * 0.205, 0.19, 0); B.chest.add(sh);
    // épaulette de la combinaison
    const pad = new THREE.Mesh(new THREE.SphereGeometry(0.075, 14, 10), M.suit);
    pad.scale.set(0.92, 0.8, 0.88); pad.castShadow = true; sh.add(pad);
    const arm = limb(0.052, 0.047, 0.28, M.suit, sh);
    const fore = limb(0.044, 0.038, 0.26, M.suit, arm); fore.position.y = -0.28;
    // poignet de chemise qui dépasse de la manche
    const wristCuff = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.043, 0.045, 12), M.cream);
    wristCuff.position.y = -0.235; wristCuff.castShadow = true; fore.add(wristCuff);
    const hand = new THREE.Group(); hand.position.y = -0.26; fore.add(hand);
    const palm = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10), M.skin);
    palm.scale.set(0.85, 1.15, 0.95); palm.position.y = -0.035; palm.castShadow = true; hand.add(palm);
    const thumb = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 8), M.skin);
    thumb.scale.set(0.8, 1.4, 0.8); thumb.position.set(sx * -0.005, -0.03, 0.045); hand.add(thumb);
    B['shoulder' + S] = sh; B['arm' + S] = arm; B['fore' + S] = fore; B['hand' + S] = hand;
  };
  mkArm(1); mkArm(-1);

  // jambes (pivot cuisse à ±hipHalf, y -0.05 du groupe hips)
  const mkLeg = sx => {
    const S = sx > 0 ? 'L' : 'R';
    const th = new THREE.Group(); th.position.set(sx * CHAR.hipHalf, -0.05, 0); B.hips.add(th);
    limbMeshes(th, 0.078, 0.062, CHAR.thigh, M.suit);
    const shin = new THREE.Group(); shin.position.y = -CHAR.thigh; th.add(shin);
    limbMeshes(shin, 0.058, 0.045, CHAR.shin - 0.02, M.suit);
    // revers de pantalon
    const hem = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.066, 0.06, 12), M.suitDark);
    hem.position.y = -(CHAR.shin - 0.10); hem.castShadow = true; shin.add(hem);
    const foot = new THREE.Group(); foot.position.y = -CHAR.shin; shin.add(foot);
    // botte : corps + pointe + semelle
    const bootB = new THREE.Mesh(new THREE.SphereGeometry(0.062, 12, 10), M.boots);
    bootB.scale.set(0.95, 1.1, 1.05); bootB.position.set(0, -0.025, 0.005); bootB.castShadow = true; foot.add(bootB);
    const toe = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 10), M.boots);
    toe.scale.set(0.92, 0.72, 1.5); toe.position.set(0, -0.052, 0.075); toe.castShadow = true; foot.add(toe);
    const sole = new THREE.Mesh(new THREE.BoxGeometry(0.105, 0.032, 0.235), M.sole);
    sole.position.set(0, -0.074, 0.045); sole.castShadow = true; foot.add(sole);
    B['thigh' + S] = th; B['shin' + S] = shin; B['foot' + S] = foot;
  };
  function limbMeshes(g, r1, r2, len, mat) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r2, r1, len, 14, 1), mat);
    m.position.y = -len / 2; m.castShadow = true; g.add(m);
    const c = new THREE.Mesh(new THREE.SphereGeometry(r1, 14, 10), mat); c.castShadow = true; g.add(c);
    const c2 = new THREE.Mesh(new THREE.SphereGeometry(r2, 14, 10), mat); c2.position.y = -len; c2.castShadow = true; g.add(c2);
  }
  mkLeg(1); mkLeg(-1);

  outlineTree(root);
  return { root, B, eyeL, eyeR };
}
const marcel = buildCharacter();

/* ---------------------------------------------------------- */
/* 9. Animation procédurale                                    */
/* ---------------------------------------------------------- */
const anim = {
  phase: 0, moveBlend: 0, runBlend: 0,
  leanRoll: 0, leanPitch: 0, headYaw: 0, headPitch: 0,
  blinkT: 1.6, blink: 0,
  contact: { L: true, R: true },       // pour les bruits de pas
};

// trajectoire du pied sur un cycle — u ∈ [0,1), retourne {z, y, pitch}
function footCurve(u, halfStride, lift, duty) {
  if (u < duty) {                      // appui : le pied recule (fixe au sol en absolu)
    const s = u / duty;
    const heel = Math.max(0, 1 - s * 3.2);            // talon qui vient de se poser
    const toe = Math.max(0, (s - 0.72) / 0.28);       // décollage du talon
    return {
      z: halfStride * (1 - 2 * s),
      y: CHAR.ankleY + toe * toe * 0.055,
      pitch: -0.22 * heel + 0.5 * toe * toe,
    };
  }
  const s = (u - duty) / (1 - duty);   // oscillation : retour vers l'avant
  const e = smooth(s);
  return {
    z: halfStride * (-1 + 2 * e),
    // départ à la hauteur du décollage de talon (continuité), puis cloche de levée
    y: CHAR.ankleY + Math.sin(Math.PI * Math.min(1, s * 1.05)) * lift
      + (1 - smooth(Math.min(1, s * 3))) * 0.055,
    pitch: lerp(0.5, -0.22, smooth(clamp(s * 1.25 - 0.1, 0, 1))),
  };
}

// IK 2 os d'une jambe ; cible exprimée dans le repère du root
function solveLeg(S, sx, target, footPitch) {
  const B = marcel.B;
  const hips = B.hips;
  // cible dans le repère du bassin
  _v.copy(target).sub(hips.position);
  _q.copy(hips.quaternion).invert();
  _v.applyQuaternion(_q);
  _v.sub(_v2.set(sx * CHAR.hipHalf, -0.05, 0));      // relative au pivot de cuisse
  const a = CHAR.thigh, b = CHAR.shin;
  const d = clamp(_v.length(), 0.12, a + b - 0.004);
  _v.normalize();
  _q2.setFromUnitVectors(DOWN, _v);                   // orienter la cuisse vers la cible
  const alpha = Math.acos(clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1));
  _q3.setFromAxisAngle(X_AXIS, -alpha);               // replier vers l'avant (genou devant)
  B['thigh' + S].quaternion.copy(_q2).multiply(_q3);
  const beta = Math.acos(clamp((a * a + b * b - d * d) / (2 * a * b), -1, 1));
  B['shin' + S].quaternion.setFromAxisAngle(X_AXIS, Math.PI - beta);
  // pied : orientation absolue voulue (dans le repère du root)
  _q.copy(hips.quaternion).multiply(B['thigh' + S].quaternion).multiply(B['shin' + S].quaternion).invert();
  _q2.setFromAxisAngle(X_AXIS, footPitch);
  B['foot' + S].quaternion.copy(_q).multiply(_q2);
}

function animate(dt, t, speed, yawRate, accelFwd) {
  const B = marcel.B;
  const fg = window.__atelier && window.__atelier.forceGait;   // pose figée (outillage)
  if (fg) { speed = fg.speed; yawRate = 0; accelFwd = 0; }
  const m = anim.moveBlend = fg ? sstep(0.08, 0.6, speed)
    : damp(anim.moveBlend, sstep(0.08, 0.6, speed), 8, dt);
  const r = anim.runBlend = fg ? sstep(2.2, 3.6, speed)
    : damp(anim.runBlend, sstep(2.2, 3.6, speed), 6, dt);

  // paramètres d'allure — la course introduit une phase de vol (appui court)
  const duty = lerp(0.58, 0.30, r);
  const cadence0 = lerp(1.3, 2.0, r);            // cycles/s « naturels »
  const strideCap = lerp(0.58, 0.66, r);
  const sweep = clamp(duty * speed / cadence0, 0.2, strideCap);
  const freq = speed > 0.05 ? duty * speed / sweep : 0;   // synchro exacte pied/sol
  anim.phase = (anim.phase + dt * freq) % 1;
  if (fg && fg.phase !== undefined) anim.phase = fg.phase;
  const lift = lerp(0.055, 0.16, r);
  const halfStride = sweep / 2;

  // inclinaisons du corps
  anim.leanRoll = damp(anim.leanRoll, clamp(-yawRate * speed * 0.045, -0.16, 0.16), 7, dt);
  anim.leanPitch = damp(anim.leanPitch, clamp(accelFwd * 0.018, -0.06, 0.1) + r * 0.2 * m, 6, dt);

  const p2 = anim.phase * Math.PI * 2;

  // --- bassin ---
  // marche : point bas au double appui (phase 0) ; course : point haut en vol
  const bobBase = lerp(0.975, lerp(0.915, 0.90, r), m);
  const bobPhase = r * 0.6 * Math.PI;
  const bob = m * lerp(0.016, 0.055, r) * (0.5 - 0.5 * Math.cos(2 * p2 - bobPhase));
  const sway = m * lerp(0.022, 0.012, r) * Math.sin(p2);
  const idleSway = (1 - m) * 0.016 * noise1(t * 0.4);
  B.hips.position.set(sway + idleSway, bobBase + bob, 0);
  const pelvYaw = m * lerp(0.10, 0.16, r) * Math.cos(p2);
  const pelvRoll = m * 0.045 * Math.sin(p2) + anim.leanRoll;
  const idleBreath = (1 - m) * 0.012 * Math.sin(t * 1.6);
  B.hips.rotation.set(anim.leanPitch + m * 0.03 + idleBreath * 0.3, pelvYaw, pelvRoll);

  // --- jambes (cibles en repère root) ---
  for (const [S, sx, off] of [['L', 1, 0], ['R', -1, 0.5]]) {
    const u = (anim.phase + off) % 1;
    const g = footCurve(u, halfStride, lift, duty);
    // pose de repos : pieds légèrement décalés
    const restZ = sx > 0 ? 0.035 : -0.03, restX = sx * 0.115;
    const tx = lerp(restX + idleSway * 0.4, sx * 0.105, m);
    const tz = lerp(restZ, g.z, m);
    const ty = lerp(CHAR.ankleY, g.y, m);
    solveLeg(S, sx, _v3.set(tx, ty, tz), m * g.pitch);
    // contact au sol → bruit de pas
    const grounded = m > 0.35 && u < duty;
    if (grounded && !anim.contact[S] && speed > 0.4) stepSound(Math.min(1, speed / 4));
    anim.contact[S] = grounded;
  }

  // --- torse ---
  const breath = Math.sin(t * 1.6) * (1 - m * 0.6);
  B.spine.rotation.set(0.02 + breath * 0.012 + anim.leanPitch * 0.4, -pelvYaw * 0.5, -anim.leanRoll * 0.25);
  B.chest.rotation.set(0.015 + breath * 0.018 + anim.leanPitch * 0.5, -pelvYaw * 0.9, -anim.leanRoll * 0.3);

  // --- bras ---
  const swing = m * lerp(0.38, 1.0, r);
  const armL = swing * Math.cos(p2), armR = -swing * Math.cos(p2);
  const idleArm = (1 - m) * (0.045 + 0.02 * Math.sin(t * 1.6 + 1));
  const flare = 0.06 + m * 0.04 + r * m * 0.14;   // coudes écartés en courant
  B.shoulderL.rotation.set(armL + idleArm, 0, flare + (1 - m) * 0.02 * noise1(t * .3 + 3));
  B.shoulderR.rotation.set(armR + idleArm, 0, -flare - (1 - m) * 0.02 * noise1(t * .3 + 7));
  const bendBase = lerp(0.28, 0.75, r * m);
  B.armL.rotation.x = -0.06 - m * 0.04;
  B.armR.rotation.x = -0.06 - m * 0.04;
  B.foreL.rotation.x = -(bendBase + m * lerp(0.25, 0.75, r) * (0.5 - 0.5 * Math.cos(p2)));
  B.foreR.rotation.x = -(bendBase + m * lerp(0.25, 0.75, r) * (0.5 + 0.5 * Math.cos(p2)));
  B.handL.rotation.x = -0.12; B.handR.rotation.x = -0.12;

  // --- tête : stabilisée, regards curieux à l'arrêt ---
  const glance = (1 - m) * sstep(0.4, 0.9, Math.abs(noise1(t * 0.23)));
  anim.headYaw = damp(anim.headYaw, glance * noise1(t * 0.31 + 9) * 0.55 - pelvYaw * 0.35, 4, dt);
  anim.headPitch = damp(anim.headPitch, glance * noise1(t * 0.27 + 4) * 0.14 - anim.leanPitch * 1.1 + m * 0.02, 4, dt);
  B.neck.rotation.set(anim.headPitch * 0.4, anim.headYaw * 0.4, -anim.leanRoll * 0.3);
  B.head.rotation.set(anim.headPitch * 0.6 + m * 0.02 * Math.cos(2 * p2), anim.headYaw * 0.6, -anim.leanRoll * 0.35);

  // clignement
  anim.blinkT -= dt;
  if (anim.blinkT <= 0) { anim.blinkT = 1.8 + Math.random() * 3.4; anim.blink = 1; }
  anim.blink = Math.max(0, anim.blink - dt * 9);
  const eyeScale = 1 - Math.min(1, anim.blink * 1.6) * 0.88;
  marcel.eyeL.scale.y = 1.35 * eyeScale; marcel.eyeR.scale.y = 1.35 * eyeScale;
}

/* ---------------------------------------------------------- */
/* 10. Entrées clavier                                         */
/* ---------------------------------------------------------- */
const keys = {};
addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'KeyM') audio.toggle();
});
addEventListener('keyup', e => keys[e.code] = false);
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
const keyAxis = () => {
  let x = 0, z = 0;
  if (keys.KeyW || keys.ArrowUp) z += 1;
  if (keys.KeyS || keys.ArrowDown) z -= 1;
  if (keys.KeyA || keys.ArrowLeft) x -= 1;
  if (keys.KeyD || keys.ArrowRight) x += 1;
  const l = Math.hypot(x, z);
  return l > 0 ? { x: x / l, z: z / l } : { x: 0, z: 0 };
};

/* ---------------------------------------------------------- */
/* 11. État du joueur + collisions                             */
/* ---------------------------------------------------------- */
const player = {
  pos: new THREE.Vector3(-0.3, 0, 0.1),
  vel: new THREE.Vector3(),
  yaw: Math.PI,            // face à la porte du garage
  yawRate: 0,
  speed: 0,
};

function collide(pos) {
  const r = CHAR.radius;
  // murs
  pos.x = clamp(pos.x, -ROOM.w / 2 + r + 0.05, ROOM.w / 2 - r - 0.05);
  pos.z = clamp(pos.z, -ROOM.d / 2 + r + 0.12, ROOM.d / 2 - r - 0.05);
  // obstacles (AABB, glissement le long du plus petit recouvrement)
  for (const c of colliders) {
    const nx = clamp(pos.x, c.minX, c.maxX), nz = clamp(pos.z, c.minZ, c.maxZ);
    const dx = pos.x - nx, dz = pos.z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2), push = (r - d) / d;
        pos.x += dx * push; pos.z += dz * push;
      } else {
        // au cœur de la boîte : expulser par la face la plus proche
        const outs = [
          { p: c.maxX + r - pos.x, ax: 'x', s: 1 }, { p: pos.x - (c.minX - r), ax: 'x', s: -1 },
          { p: c.maxZ + r - pos.z, ax: 'z', s: 1 }, { p: pos.z - (c.minZ - r), ax: 'z', s: -1 },
        ].sort((A, B2) => A.p - B2.p)[0];
        if (outs.ax === 'x') pos.x += outs.s * outs.p; else pos.z += outs.s * outs.p;
      }
    }
  }
}

function updatePlayer(dt) {
  const axis = keyAxis();
  const running = keys.ShiftLeft || keys.ShiftRight;
  const maxSpeed = running ? CHAR.runSpeed : CHAR.walkSpeed;
  // direction voulue, relative à la caméra
  const cy = camCtl.yaw;
  const dirX = axis.x * Math.cos(cy) + axis.z * Math.sin(cy);
  const dirZ = -axis.x * Math.sin(cy) + axis.z * Math.cos(cy);
  const wants = axis.x !== 0 || axis.z !== 0;

  const prevVel = _v2.copy(player.vel);
  if (wants) {
    player.vel.x += dirX * CHAR.accel * dt;
    player.vel.z += dirZ * CHAR.accel * dt;
    const sp = Math.hypot(player.vel.x, player.vel.z);
    if (sp > maxSpeed) { player.vel.x *= maxSpeed / sp; player.vel.z *= maxSpeed / sp; }
  } else {
    const f = Math.max(0, 1 - CHAR.friction * dt);
    player.vel.x *= f; player.vel.z *= f;
    if (player.vel.lengthSq() < 0.0004) player.vel.set(0, 0, 0);
  }
  player.pos.x += player.vel.x * dt;
  player.pos.z += player.vel.z * dt;
  collide(player.pos);

  player.speed = Math.hypot(player.vel.x, player.vel.z);
  // orientation : le personnage se tourne vers sa vitesse
  if (player.speed > 0.15) {
    const target = Math.atan2(player.vel.x, player.vel.z);
    const before = player.yaw;
    player.yaw = dampAngle(player.yaw, target, CHAR.turnRate, dt);
    player.yawRate = damp(player.yawRate, wrapPi(player.yaw - before) / Math.max(dt, 1e-4), 10, dt);
  } else {
    player.yawRate = damp(player.yawRate, 0, 8, dt);
  }
  // accélération avant (pour l'inclinaison)
  const fwdX = Math.sin(player.yaw), fwdZ = Math.cos(player.yaw);
  const accelFwd = ((player.vel.x - prevVel.x) * fwdX + (player.vel.z - prevVel.z) * fwdZ) / Math.max(dt, 1e-4);

  marcel.root.position.copy(player.pos);
  marcel.root.rotation.y = player.yaw;
  return accelFwd;
}

/* ---------------------------------------------------------- */
/* 12. Caméra 3e personne                                      */
/* ---------------------------------------------------------- */
const camCtl = {
  yaw: Math.PI + 0.4, pitch: 0.24,
  dist: CAM.dist0, distTarget: CAM.dist0, distSmooth: CAM.dist0,
  target: new THREE.Vector3(), pos: new THREE.Vector3(),
  locked: false, fov: CAM.fov,
};
{
  const el = renderer.domElement;
  const enter = document.getElementById('enter');
  const hint = document.getElementById('hint');
  const tryLock = () => { if (el.requestPointerLock) el.requestPointerLock(); };
  enter.addEventListener('click', () => { audio.start(); tryLock(); enter.classList.add('hidden'); });
  el.addEventListener('click', () => { if (!camCtl.locked) tryLock(); });
  document.addEventListener('pointerlockchange', () => {
    camCtl.locked = document.pointerLockElement === el;
    hint.style.opacity = camCtl.locked ? 0.7 : 0;
  });
  addEventListener('mousemove', e => {
    if (!camCtl.locked) return;
    camCtl.yaw -= e.movementX * CAM.sens;
    camCtl.pitch = clamp(camCtl.pitch + e.movementY * CAM.sens, CAM.minPitch, CAM.maxPitch);
  });
  // secours sans pointer lock : glisser
  let drag = null;
  el.addEventListener('mousedown', e => { if (!camCtl.locked) drag = { x: e.clientX, y: e.clientY }; });
  addEventListener('mouseup', () => drag = null);
  addEventListener('mousemove', e => {
    if (!drag || camCtl.locked) return;
    camCtl.yaw -= (e.clientX - drag.x) * CAM.sens * 1.4;
    camCtl.pitch = clamp(camCtl.pitch + (e.clientY - drag.y) * CAM.sens * 1.4, CAM.minPitch, CAM.maxPitch);
    drag = { x: e.clientX, y: e.clientY };
  });
  addEventListener('wheel', e => {
    camCtl.distTarget = clamp(camCtl.distTarget + Math.sign(e.deltaY) * 0.28, CAM.minDist, CAM.maxDist);
  }, { passive: true });
}

// distance max le long d'un rayon avant de toucher murs / obstacles
function cameraRayLimit(origin, dir, want) {
  let tMax = want;
  // rester dans la pièce
  const walls = [
    { n: 1, o: -ROOM.w / 2 + CAM.margin, c: 'x' }, { n: -1, o: ROOM.w / 2 - CAM.margin, c: 'x' },
    { n: 1, o: -ROOM.d / 2 + CAM.margin, c: 'z' }, { n: -1, o: ROOM.d / 2 - CAM.margin, c: 'z' },
    { n: 1, o: 0.14, c: 'y' }, { n: -1, o: ROOM.h - CAM.margin, c: 'y' },
  ];
  for (const wl of walls) {
    const p = origin[wl.c], v = dir[wl.c];
    if (Math.abs(v) < 1e-6) continue;
    const t = (wl.o - p) / v;
    if (t > 0 && ((wl.n === 1 && v < 0) || (wl.n === -1 && v > 0))) tMax = Math.min(tMax, t);
  }
  // obstacles (gonflés) — méthode des « slabs »
  for (const c of colliders) {
    if (c.maxY < 1.0) continue;                        // trop bas pour gêner la caméra
    const g = 0.14;
    const mn = [c.minX - g, -1, c.minZ - g], mx = [c.maxX + g, c.maxY + g, c.maxZ + g];
    const o = [origin.x, origin.y, origin.z], v = [dir.x, dir.y, dir.z];
    let t0 = 0, t1 = tMax, ok = true;
    for (let i = 0; i < 3 && ok; i++) {
      if (Math.abs(v[i]) < 1e-6) { if (o[i] < mn[i] || o[i] > mx[i]) ok = false; continue; }
      let a = (mn[i] - o[i]) / v[i], b = (mx[i] - o[i]) / v[i];
      if (a > b) [a, b] = [b, a];
      t0 = Math.max(t0, a); t1 = Math.min(t1, b);
      if (t0 > t1) ok = false;
    }
    if (ok && t0 > 0.01) tMax = Math.min(tMax, t0 - 0.04);
  }
  return Math.max(0.35, tMax);
}

function updateCamera(dt) {
  // point visé : buste + un peu d'avance dans le sens du déplacement
  _v.set(player.vel.x, 0, player.vel.z).multiplyScalar(0.13);
  if (_v.length() > 0.34) _v.setLength(0.34);
  const tx = player.pos.x + _v.x, tz = player.pos.z + _v.z;
  camCtl.target.x = damp(camCtl.target.x, tx, 7, dt);
  camCtl.target.y = damp(camCtl.target.y, player.pos.y + CAM.targetH, 7, dt);
  camCtl.target.z = damp(camCtl.target.z, tz, 7, dt);

  const cp = Math.cos(camCtl.pitch), sp = Math.sin(camCtl.pitch);
  _v2.set(Math.sin(camCtl.yaw) * cp, sp, Math.cos(camCtl.yaw) * cp); // direction cible→caméra
  camCtl.dist = damp(camCtl.dist, camCtl.distTarget, 9, dt);
  const limit = cameraRayLimit(camCtl.target, _v2, camCtl.dist);
  // rapprocher vite (ne pas traverser), s'éloigner en douceur
  camCtl.distSmooth = limit < camCtl.distSmooth
    ? Math.min(camCtl.distSmooth, limit)
    : damp(camCtl.distSmooth, limit, 3.5, dt);

  camCtl.pos.copy(camCtl.target).addScaledVector(_v2, camCtl.distSmooth);
  camera.position.copy(camCtl.pos);
  camera.lookAt(camCtl.target);

  // léger élargissement du champ en courant
  const fovT = CAM.fov + anim.runBlend * 6;
  camCtl.fov = damp(camCtl.fov, fovT, 4, dt);
  camera.fov = camCtl.fov; camera.updateProjectionMatrix();
}

/* ---------------------------------------------------------- */
/* 13. Ambiance sonore (discrète)                              */
/* ---------------------------------------------------------- */
const audio = {
  ctx: null, master: null, muted: false,
  start() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      // ronronnement électrique très bas
      const hum = this.ctx.createOscillator(); hum.type = 'sine'; hum.frequency.value = 100;
      const hum2 = this.ctx.createOscillator(); hum2.type = 'sine'; hum2.frequency.value = 199;
      const hg = this.ctx.createGain(); hg.gain.value = 0.012;
      hum.connect(hg); hum2.connect(hg); hg.connect(this.master);
      hum.start(); hum2.start();
    } catch (e) { /* pas de son */ }
  },
  toggle() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
  },
};
function stepSound(vol) {
  if (!audio.ctx || audio.muted) return;
  const c = audio.ctx, t = c.currentTime;
  const dur = 0.09;
  const buf = c.createBuffer(1, c.sampleRate * dur, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 2.2);
  const src = c.createBufferSource(); src.buffer = buf;
  const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 330 + vol * 260;
  const g = c.createGain(); g.gain.setValueAtTime(0.16 * vol + 0.03, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f); f.connect(g); g.connect(audio.master);
  src.start(t);
}

/* ---------------------------------------------------------- */
/* 14. Boucle principale                                       */
/* ---------------------------------------------------------- */
let last = performance.now(), elapsed = 0;
function tick(now) {
  requestAnimationFrame(tick);
  const dt = clamp((now - last) / 1000, 0.001, 0.05);
  last = now; elapsed += dt;

  const accelFwd = updatePlayer(dt);
  animate(dt, elapsed, player.speed, player.yawRate, accelFwd);
  updateCamera(dt);

  // poussières qui dérivent
  const pa = dust.geometry.attributes.position;
  for (let i = 0; i < dustN; i++) {
    pa.array[i * 3 + 1] += Math.sin(elapsed * 0.5 + dustSeed[i]) * 0.0004 - 0.0002;
    pa.array[i * 3] += Math.sin(elapsed * 0.3 + dustSeed[i] * 2) * 0.0003;
    if (pa.array[i * 3 + 1] < 0.2) pa.array[i * 3 + 1] = 2.5;
  }
  pa.needsUpdate = true;
  // scintillement à peine perceptible de l'ampoule
  keyLight.intensity = 1.55 + Math.sin(elapsed * 13) * 0.014 + noise1(elapsed * 3.1) * 0.012;

  renderer.render(scene, camera);
}
requestAnimationFrame(tick);

// petites poignées pour l'outillage (captures, tests)
window.__atelier = {
  player, camCtl, anim, marcel, renderer,
  setCam(yaw, pitch, dist) { camCtl.yaw = yaw; camCtl.pitch = pitch; camCtl.distTarget = dist; camCtl.distSmooth = dist; camCtl.dist = dist; },
  warp(x, z, yaw) { player.pos.set(x, 0, z); if (yaw !== undefined) player.yaw = yaw; },
  press(code, v) { keys[code] = v; },
};
