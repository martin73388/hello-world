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
const ROOM = { w: 16, d: 14, h: 4.2 };            // atelier : 16 m × 14 m — on peut y faire demi-tour
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
  fov: 55, minDist: 1.5, maxDist: 7.5, dist0: 3.6,
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
  html,body{margin:0;height:100%;overflow:hidden;background:#0c1220;overscroll-behavior:none}
  #stage{position:fixed;inset:0;touch-action:none}
  #stage canvas{display:block;width:100%;height:100%;touch-action:none}
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
  #objective{top:26px;right:26px;font-family:'Courier New',monospace;font-size:13px;
    letter-spacing:.14em;color:#e8dcc8;background:rgba(10,14,26,.62);
    border:1px solid rgba(232,220,200,.16);border-radius:8px;padding:8px 14px;text-align:right}
  #objective b{color:#ffb066}
  #prompt{bottom:96px;left:50%;transform:translateX(-50%);font-family:'Courier New',monospace;
    font-size:14px;letter-spacing:.1em;color:#e8dcc8;background:rgba(10,14,26,.72);
    border:1px solid rgba(255,176,102,.35);border-radius:8px;padding:8px 16px;
    opacity:0;transition:opacity .25s}
  #prompt b{color:#ffb066;border:1px solid rgba(255,176,102,.5);border-radius:4px;padding:0 6px;margin-right:8px}
  #toast{top:19%;left:50%;transform:translateX(-50%);font-size:17px;font-style:italic;
    letter-spacing:.08em;color:#ffe6c4;text-shadow:0 2px 14px rgba(0,0,0,.85);
    opacity:0;transition:opacity .5s;white-space:nowrap}
  .tbtn{position:fixed;z-index:12;display:none;align-items:center;justify-content:center;
    font-family:'Courier New',monospace;color:#e8dcc8;background:rgba(10,14,26,.55);
    border:1px solid rgba(232,220,200,.3);border-radius:50%;user-select:none;-webkit-user-select:none;
    touch-action:none}
  #stickZone{position:fixed;left:26px;bottom:26px;width:128px;height:128px;z-index:12;display:none;
    border:1px solid rgba(232,220,200,.25);border-radius:50%;background:rgba(10,14,26,.35);touch-action:none}
  #stickNub{position:absolute;left:44px;top:44px;width:40px;height:40px;border-radius:50%;
    background:rgba(255,176,102,.45)}
  #btnE{right:30px;bottom:118px;width:64px;height:64px;font-size:22px;color:#ffb066;opacity:.35}
  #btnRun{right:112px;bottom:40px;width:58px;height:58px;font-size:12px}
  body.touch #stickZone{display:block}
  body.touch .tbtn{display:flex}
  body.touch #keys{display:none}
`;
document.head.appendChild(css);
document.body.insertAdjacentHTML('beforeend', `
  <div id="stage"></div>
  <div class="vignette"></div>
  <div class="hud" id="title"><div class="t1">L'ATELIER</div><div class="t2">Prologue&nbsp;— minuit et quart</div></div>
  <div class="hud" id="keys"><b>ZQSD</b> / <b>WASD</b>&nbsp; se déplacer<br><b>Shift</b>&nbsp; courir&nbsp; · &nbsp;<b>E</b>&nbsp; interagir / conduire<br><b>Clic</b>&nbsp; capturer la souris&nbsp; · &nbsp;<b>Échap</b>&nbsp; libérer<br><b>Molette</b>&nbsp; zoom → 1ʳᵉ personne&nbsp; · &nbsp;<b>M</b>&nbsp; son</div>
  <div class="hud" id="hint">Échap pour libérer la souris</div>
  <div class="hud" id="objective">Retrouve <b>la clé de contact</b><span id="objN" style="display:none">0</span></div>
  <div class="hud" id="prompt"><b>E</b><span id="promptText"></span></div>
  <div class="hud" id="toast"></div>
  <div id="stickZone"><div id="stickNub"></div></div>
  <div class="tbtn" id="btnE">E</div>
  <div class="tbtn" id="btnRun">courir</div>
  <div id="enter"><div class="big">L'ATELIER</div><div class="small">— cliquer pour allumer la lumière —<br><br>retrouve la clé&nbsp;·&nbsp;monte à bord&nbsp;·&nbsp;prends la route</div></div>
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
renderer.toneMappingExposure = 1.15;
renderer.physicallyCorrectLights = true;          // chute physique des lumières
document.getElementById('stage').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PAL.night);
scene.fog = new THREE.FogExp2(0x0a1220, 0.016);

// environnement de réflexion (PMREM) : nuit bleue + deux nappes tungstène,
// c'est lui qui donne les reflets « ray-traced » aux chromes, vitres et sol ciré
{
  const env = new THREE.Scene();
  env.background = new THREE.Color(0x0a1424);
  const warm = new THREE.Mesh(new THREE.PlaneGeometry(6, 4),
    new THREE.MeshBasicMaterial({ color: 0xffa25c }));
  warm.position.set(0, 6, 0); warm.rotation.x = Math.PI / 2; env.add(warm);
  const warm2 = warm.clone(); warm2.position.set(-5, 6, 4); env.add(warm2);
  const cool = new THREE.Mesh(new THREE.PlaneGeometry(10, 3),
    new THREE.MeshBasicMaterial({ color: 0x35507e }));
  cool.position.set(8, 3, 0); cool.rotation.y = -Math.PI / 2; env.add(cool);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(env, 0.06).texture;
  pmrem.dispose();
}
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
// (l'ancienne rampe toon a laissé place au PBR)

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
// « toon » est désormais une usine PBR : les appels existants restent valides
const toon = (color, opts = {}) => {
  const p = Object.assign({ color, roughness: 0.85, metalness: 0.02 }, opts);
  return new THREE.MeshStandardMaterial(p);
};
M.floor = toon(0xffffff, { map: floorTex, roughness: 0.34, metalness: 0.04, envMapIntensity: 0.9 });
M.wall = toon(0xffffff, { map: wallTex, roughness: 0.96 });
M.ceil = toon(0x262d45, { roughness: 0.95 });
M.suit = toon(PAL.suit, { roughness: 0.92 }); M.suitDark = toon(PAL.suitDark, { roughness: 0.92 });
M.cream = toon(PAL.cream, { roughness: 0.9 }); M.skin = toon(PAL.skin, { roughness: 0.62 });
M.hair = toon(PAL.hair, { roughness: 0.8 }); M.boots = toon(PAL.boots, { roughness: 0.42 });
M.sole = toon(PAL.sole, { roughness: 0.7 });
M.cap = toon(PAL.cap, { roughness: 0.9 }); M.brass = toon(PAL.brass, { metalness: 0.85, roughness: 0.32, envMapIntensity: 1.1 });
M.red = toon(0x8f2f2b, { roughness: 0.45, metalness: 0.15 }); M.redDark = toon(0x63211e, { roughness: 0.5 });
M.teal = toon(0x33605a, { roughness: 0.55, metalness: 0.1 }); M.metal = toon(0x77808c, { metalness: 0.85, roughness: 0.38, envMapIntensity: 1.1 });
M.metalDark = toon(0x363d4c, { metalness: 0.6, roughness: 0.5 }); M.wood = toon(0x6e5236, { roughness: 0.75 });
M.tire = toon(0x1e2126, { roughness: 0.95 }); M.tarp = toon(0x40514a, { roughness: 0.9 });
M.eye = new THREE.MeshBasicMaterial({ color: 0x241a14 });
M.bulb = new THREE.MeshBasicMaterial({ color: 0xffc078 });
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
  // mur nord en trois pans : derrière la porte, la nuit
  const doorW = 5.6, doorH = 3.8;
  const sideW = (w - doorW) / 2;
  mkWall(sideW, -(doorW / 2 + sideW / 2), -d / 2, 0);
  mkWall(sideW, (doorW / 2 + sideW / 2), -d / 2, 0);
  {
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(doorW, h - doorH), M.wall.clone());
    strip.material.map = wallTex.clone(); strip.material.map.needsUpdate = true;
    strip.material.map.repeat.set(doorW / 2.9, (h - doorH) / h);
    strip.position.set(0, doorH + (h - doorH) / 2, -d / 2); strip.receiveShadow = true; scene.add(strip);
  }
  // (le dehors est réel désormais : voir buildOutside)

  mkWall(w, 0, d / 2, Math.PI);       // mur sud (établi)
  mkWall(d, -w / 2, 0, Math.PI / 2);  // ouest
  mkWall(d, w / 2, 0, -Math.PI / 2);  // est

  // --- porte sectionnelle (fermée), mur nord — assez large pour le camping-car ---
  const door = new THREE.Group(); door.position.set(0, 0, -d / 2 + 0.07); scene.add(door);
  for (let i = 0; i < 8; i++) {
    const p = box(5.5, 0.44, 0.055, M.metalDark, 0, 0.24 + i * 0.475, 0, door);
    box(5.3, 0.35, 0.02, M.metal, 0, 0.24 + i * 0.475, 0.032, door);
    p.receiveShadow = true;
  }
  box(0.7, 0.16, 0.03, M.metal, 0, 1.05, 0.06, door); // poignée
  // rails de guidage et enseigne : fixés au mur, la porte coulisse entre eux
  const doorFrame = new THREE.Group(); doorFrame.position.copy(door.position); scene.add(doorFrame);
  box(0.1, 4.1, 0.11, M.metalDark, -2.86, 2.05, 0, doorFrame);
  box(0.1, 4.1, 0.11, M.metalDark, 2.86, 2.05, 0, doorFrame);
  const sign = box(1.5, 0.3, 0.04, M.teal, 0, 3.99, 0.02, doorFrame);
  // le bouton de commande de la porte, sur le mur à droite
  const btnBox = new THREE.Group(); btnBox.position.set(3.4, 1.25, -d / 2 + 0.06); scene.add(btnBox);
  box(0.15, 0.21, 0.07, M.metalDark, 0, 0, 0, btnBox);
  const doorButton = cyl(0.038, 0.042, 0.035, M.red, 0, 0.035, 0.045, btnBox, 14);
  doorButton.rotation.x = Math.PI / 2;
  const doorLampMesh = new THREE.Mesh(new THREE.SphereGeometry(0.016, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0x552222 }));
  doorLampMesh.position.set(0, -0.062, 0.04); btnBox.add(doorLampMesh);
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
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.14, 20, 1, true), M.teal.clone());
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

  // (le camping-car est construit à part : voir buildVan)

  // --- affiches, tableau électrique, fenêtre haute ---
  const poster = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.62), toon(0xffffff, { map: posterTex }));
  poster.position.set(w / 2 - 0.02, 1.75, 1.6); poster.rotation.y = -Math.PI / 2; poster.rotation.z = 0.02; scene.add(poster);
  const breaker = box(0.34, 0.5, 0.09, M.metal, -2.6, 1.7, d / 2 - 0.06);
  box(0.1, 0.06, 0.03, M.red, -2.6, 1.78, d / 2 - 0.1);
  breaker.receiveShadow = true;
  // bandeau vitré côté est (lueur de lune)
  const win = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.6), M.window);
  win.position.set(w / 2 - 0.02, 3.3, -1.0); win.rotation.y = -Math.PI / 2; scene.add(win);
  // cadre : traverses haut/bas + meneaux (rien devant la vitre)
  box(0.06, 0.05, 3.72, M.metalDark, w / 2 - 0.035, 3.61, -1.0);
  box(0.06, 0.05, 3.72, M.metalDark, w / 2 - 0.035, 2.99, -1.0);
  [-1.82, -0.6, 0.6, 1.82].forEach(o =>
    box(0.06, 0.66, 0.05, M.metalDark, w / 2 - 0.035, 3.3, -1.0 + o));

  // --- deux luminaires suspendus (ampoule + abat-jour émaillé) ---
  const mkLamp = (x, z) => {
    const lampG = new THREE.Group(); lampG.position.set(x, h, z); scene.add(lampG);
    cyl(0.012, 0.012, 0.72, M.metalDark, 0, -0.36, 0, lampG);
    const sh = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.19, 26, 1, true), M.teal.clone());
    sh.material.side = THREE.DoubleSide; sh.position.y = -0.76; lampG.add(sh);
    const bl = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10), M.bulb.clone());
    bl.position.y = -0.85; lampG.add(bl);
    return { pos: new THREE.Vector3(x, h - 0.88, z), bulb: bl };
  };
  const lampA = mkLamp(1.8, -3.0);
  const lampB = mkLamp(-1.8, 3.2);

  // contours encrés sur les props héros (même langage graphique que le personnage)
  [bench, shelf, tires, cab].forEach(g2 => outlineTree(g2));

  return {
    lampPos: lampA.pos, lamp2Pos: lampB.pos,
    benchLampPos: new THREE.Vector3(-0.3, 2.13, d / 2 - 0.58),
    door, bulb: lampA.bulb, bulb2: lampB.bulb,
    doorLamp: doorLampMesh.material,
  };
}
const anchors = buildGarage();

/* ---------------------------------------------------------- */
/* 6bis. L'Hirondelle — coque praticable et conduite           */
/* ---------------------------------------------------------- */
/* Repère local : nez vers -z. Plancher intérieur à y = 0.42.
   Porte latérale ouverte côté droit (+x), z ∈ [0.25, 1.35].
   Toutes les collisions intérieures se font dans CE repère :
   si le van bouge, l'intérieur suit — sans couture.            */
const VAN = {
  floorY: 0.45, innerX: 1.11, innerZ: 3.26,
  doorZ0: 0.4, doorZ1: 1.6,
  seat: { x: -0.55, z: -2.25 },                 // siège conducteur (local)
  cols: [                                        // AABB locaux {x0,x1,z0,z1}
    { x0: -1.27, x1: -1.11, z0: -3.42, z1: 3.42 },              // paroi gauche
    { x0: 1.11, x1: 1.27, z0: -3.42, z1: 0.4 },                 // paroi droite avant
    { x0: 1.11, x1: 1.27, z0: 1.6, z1: 3.42 },                  // paroi droite arrière
    { x0: -1.27, x1: 1.27, z0: -3.42, z1: -3.26 },              // face avant
    { x0: -1.27, x1: 1.27, z0: 3.26, z1: 3.42 },                // face arrière
    { x0: -1.11, x1: 1.11, z0: 2.3, z1: 3.26 },                 // lit
    { x0: -1.11, x1: -0.59, z0: -0.62, z1: 1.62 },              // kitchenette
    { x0: -1.11, x1: 1.11, z0: -3.26, z1: -2.88 },              // tableau de bord
    { x0: -0.84, x1: -0.26, z0: -2.55, z1: -1.95 },             // siège gauche
    { x0: 0.26, x1: 0.84, z0: -2.55, z1: -1.95 },               // siège droit
  ],
};
const vanState = { x: -4.0, z: 0.8, yaw: 0, speed: 0, driving: false, driveHint: false };

function buildVan() {
  const van = new THREE.Group(); scene.add(van);
  const cream = new THREE.MeshPhysicalMaterial({ color: 0xc9b995, roughness: 0.45, metalness: 0.08,
    clearcoat: 0.9, clearcoatRoughness: 0.22, envMapIntensity: 0.55 });
  const teal = new THREE.MeshPhysicalMaterial({ color: 0x2c5b53, roughness: 0.42, metalness: 0.1,
    clearcoat: 0.9, clearcoatRoughness: 0.2, envMapIntensity: 0.55 });
  const chrome = toon(0xb8c2cc, { metalness: 1.0, roughness: 0.16, envMapIntensity: 1.3 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x7590b8, roughness: 0.06, metalness: 0,
    transparent: true, opacity: 0.18, envMapIntensity: 0.9, side: THREE.DoubleSide });
  const inner = toon(0xcbbfa2, { roughness: 0.9 });
  const woodFloor = toon(0x8a6f4d, { roughness: 0.6 });
  const cloth = toon(0x51706a, { roughness: 1.0, metalness: 0 });

  // plancher, bas de caisse
  box(2.36, 0.1, 7.0, woodFloor, 0, 0.4, 0, van);
  box(2.5, 0.24, 7.1, cream, 0, 0.33, 0, van);
  // parois basses (0.45 -> 1.55) — porte latérale droite ouverte
  box(0.12, 1.1, 6.94, cream, -1.18, 1.0, 0, van);
  box(0.12, 1.1, 3.8, cream, 1.18, 1.0, -1.5, van);
  box(0.12, 1.1, 1.8, cream, 1.18, 1.0, 2.5, van);
  // bande haute (1.55 -> 2.75) : piliers sarcelle + vitres
  const upSeg = (sx, z0, z1) => box(0.12, 1.2, z1 - z0, teal, sx * 1.18, 2.15, (z0 + z1) / 2, van);
  const pane = (sx, z0, z1) => box(0.03, 1.0, z1 - z0 - 0.08, glass, sx * 1.18, 2.12, (z0 + z1) / 2, van);
  [-1, 1].forEach(sx => {
    upSeg(sx, -3.4, -3.0); pane(sx, -3.0, -2.2);
    upSeg(sx, -2.2, -1.7); pane(sx, -1.7, -0.6);
    upSeg(sx, -0.6, sx > 0 ? 0.4 : -0.2);
  });
  pane(-1, -0.2, 1.1); upSeg(-1, 1.1, 1.5); pane(-1, 1.5, 2.8); upSeg(-1, 2.8, 3.4);
  upSeg(1, 1.6, 2.0); pane(1, 2.0, 3.1); upSeg(1, 3.1, 3.4);   // droite : la porte est l'ouverture
  // avant : tablier, pare-brise, calandre, phares, pare-chocs
  box(2.26, 1.05, 0.14, cream, 0, 0.975, -3.33, van);
  const ws = box(2.1, 1.15, 0.04, glass, 0, 2.12, -3.3, van); ws.rotation.x = -0.09;
  const grille = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.5), toon(0xffffff, { map: canvasTex(128, (g, s2) => {
    g.fillStyle = '#b7a888'; g.fillRect(0, 0, s2, s2);
    g.fillStyle = '#6d6250';
    for (let y = 10; y < s2; y += 22) g.fillRect(8, y, s2 - 16, 9);
  }), metalness: 0.6, roughness: 0.4 }));
  grille.position.set(0, 1.0, -3.415); grille.rotation.y = Math.PI; van.add(grille);
  const lenses = [];
  [-0.85, 0.85].forEach(x => {
    cyl(0.12, 0.12, 0.06, chrome, x, 1.42, -3.39, van, 16).rotation.x = Math.PI / 2;
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.09, 16),
      new THREE.MeshStandardMaterial({ color: 0x6b5c40, emissive: 0x241c10, roughness: 0.2 }));
    lens.position.set(x, 1.42, -3.425); lens.rotation.y = Math.PI; van.add(lens);
    lenses.push(lens.material);
  });
  box(2.6, 0.18, 0.24, chrome, 0, 0.45, -3.48, van);
  box(2.6, 0.18, 0.24, chrome, 0, 0.45, 3.48, van);
  // arrière : panneau plein + vitre + plaque
  box(2.26, 1.35, 0.14, cream, 0, 1.125, 3.33, van);
  box(1.6, 0.62, 0.04, glass, 0, 2.18, 3.33, van);
  box(2.26, 0.24, 0.14, teal, 0, 2.62, 3.33, van);
  const plateTex2 = canvasTex(128, (g, s2) => {
    g.fillStyle = '#1a1a20'; g.fillRect(0, 0, s2, s2);
    g.fillStyle = '#e8dcc8'; g.font = 'bold 40px Courier New'; g.textAlign = 'center';
    g.fillText('GM·73·AT', s2 / 2, s2 / 2 + 14);
  });
  [[-3.49, Math.PI], [3.49, 0]].forEach(([z, ry]) => {
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.14), new THREE.MeshBasicMaterial({ map: plateTex2 }));
    pl.position.set(0, 0.68, z); pl.rotation.y = ry; van.add(pl);
  });
  // toit + galerie + jerrican + roue de secours
  box(2.5, 0.17, 7.0, teal, 0, 2.835, 0, van);
  box(2.1, 0.12, 6.5, teal, 0, 2.97, 0, van);
  [-0.95, 0.95].forEach(x => box(0.06, 0.1, 5.2, M.metalDark, x, 3.08, 0.3, van));
  [-1.8, 0.2, 2.2].forEach(z => box(1.96, 0.06, 0.07, M.metalDark, 0, 3.1, z, van));
  cyl(0.2, 0.2, 0.5, M.teal, -0.45, 3.3, -1.2, van, 12);
  const spare = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.13, 10, 20), M.tire);
  spare.position.set(0.35, 3.28, 1.9); spare.rotation.x = Math.PI / 2; spare.castShadow = true; van.add(spare);
  // le nom, peint à la main
  const nameTex = canvasTex(256, (g, s2) => {
    g.fillStyle = '#e8dcc8'; g.font = 'italic 42px Georgia'; g.textAlign = 'center';
    g.fillText("L'Hirondelle", s2 / 2, s2 / 2 + 10);
    g.strokeStyle = '#e8dcc8'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(s2 * .22, s2 * .61); g.quadraticCurveTo(s2 / 2, s2 * .70, s2 * .78, s2 * .61); g.stroke();
  });
  [-1, 1].forEach(sx => {
    const nm = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1),
      toon(0xffffff, { map: nameTex, transparent: true, roughness: 0.6 }));
    nm.position.set(sx * 1.26, 1.05, sx > 0 ? 2.5 : 0.9); nm.rotation.y = sx * Math.PI / 2; van.add(nm);
  });
  // roues
  [[-1.06, -2.2], [1.06, -2.2], [-1.06, 2.2], [1.06, 2.2]].forEach(([x, z]) => {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 20), M.tire);
    t.position.set(x, 0.42, z); t.rotation.z = Math.PI / 2; t.castShadow = t.receiveShadow = true; van.add(t);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.32, 14), cream);
    hub.position.copy(t.position); hub.rotation.z = Math.PI / 2; van.add(hub);
  });
  // rétroviseurs
  [-1, 1].forEach(sx => {
    cyl(0.016, 0.016, 0.2, M.metalDark, sx * 1.38, 2.0, -3.1, van, 6).rotation.z = Math.PI / 2;
    box(0.025, 0.18, 0.12, chrome, sx * 1.48, 2.0, -3.1, van);
  });
  // marchepied sous la porte latérale
  box(0.5, 0.07, 1.0, M.metalDark, 1.42, 0.22, 1.0, van);
  // --- intérieur ---
  box(2.2, 0.5, 0.85, M.wood, 0, 0.7, 2.775, van);             // lit
  box(2.22, 0.16, 0.88, cloth, 0, 1.03, 2.775, van);           // matelas
  box(0.6, 0.14, 0.36, M.cream, -0.6, 1.18, 2.6, van);         // oreiller
  box(0.5, 0.9, 2.2, inner, -0.86, 0.9, 0.5, van);             // kitchenette
  box(0.52, 0.05, 2.24, M.wood, -0.86, 1.37, 0.5, van);
  cyl(0.13, 0.13, 0.03, M.metal, -0.86, 1.41, 0.0, van, 16);   // évier
  cyl(0.013, 0.013, 0.16, chrome, -0.96, 1.48, 0.0, van, 8);
  box(0.3, 0.02, 0.34, M.metalDark, -0.86, 1.4, 1.05, van);    // plaque de cuisson
  box(0.45, 0.55, 1.7, inner, -0.9, 2.35, 0.5, van);           // placards hauts
  box(2.24, 0.35, 0.38, inner, 0, 1.28, -3.06, van);           // tableau de bord
  [[-0.55], [0.55]].forEach(([x]) => {                         // sièges
    box(0.55, 0.5, 0.55, cloth, x, 0.72, -2.25, van);
    const back = box(0.55, 0.6, 0.13, cloth, x, 1.28, -1.98, van); back.rotation.x = 0.12;
  });
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.028, 10, 22), M.metalDark);
  wheel.position.set(-0.55, 1.32, -2.68); wheel.rotation.x = 1.05; wheel.castShadow = true; van.add(wheel);
  cyl(0.022, 0.022, 0.34, M.metalDark, -0.55, 1.18, -2.76, van, 8).rotation.x = -0.5;
  // la radio, posée sur la kitchenette
  const radioLed = (() => {
    const r = new THREE.Group(); r.position.set(-0.8, 1.395, -0.42); r.rotation.y = 1.35; van.add(r);
    box(0.26, 0.135, 0.09, M.teal.clone(), 0, 0.068, 0, r);
    box(0.095, 0.085, 0.006, M.metalDark, -0.06, 0.068, 0.048, r);
    box(0.075, 0.055, 0.006, M.cream, 0.068, 0.075, 0.048, r);
    cyl(0.013, 0.013, 0.015, M.brass, 0.068, 0.038, 0.053, r, 10).rotation.x = Math.PI / 2;
    cyl(0.004, 0.004, 0.24, M.metalDark, 0.11, 0.2, -0.02, r, 6).rotation.z = -0.5;
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.015, 0.008), new THREE.MeshBasicMaterial({ color: 0x33201a }));
    led.position.set(0.03, 0.105, 0.049); r.add(led);
    return led;
  })();
  // plafonnier chaleureux (avec ombres : la lumière ne doit pas fuir à travers la coque)
  const cabinLight = new THREE.PointLight(0xffb877, 2.0, 6, 2);
  cabinLight.position.set(0, 2.6, 0.6);
  cabinLight.castShadow = true;
  cabinLight.shadow.mapSize.set(512, 512);
  cabinLight.shadow.bias = -0.005;
  van.add(cabinLight);
  // faisceaux des phares (allumés en conduite)
  const beams = [];
  [-0.85, 0.85].forEach(x => {
    const b = new THREE.SpotLight(0xffe2b0, 0, 22, 0.52, 0.45, 2);
    b.position.set(x, 1.42, -3.5);
    b.target.position.set(x * 0.7, 0.2, -15);
    van.add(b, b.target); beams.push(b);
  });

  van.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return { group: van, lenses, cabinLight, beams, radioLed };
}
const hirondelle = buildVan();

/* ---------------------------------------------------------- */
/* 6ter. Dehors : la clairière, la route, la forêt             */
/* ---------------------------------------------------------- */
function buildOutside() {
  const g = new THREE.Group(); scene.add(g);
  // sol forestier
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(110, 62), toon(0x141c2b, { roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(0, -0.02, -22); ground.receiveShadow = true; g.add(ground);
  // la route de terre, dans l'axe de la porte
  const roadTex = canvasTex(256, (gg, s) => {
    gg.fillStyle = '#2b3247'; gg.fillRect(0, 0, s, s);
    for (let i = 0; i < 900; i++) {
      gg.fillStyle = Math.random() < .5 ? 'rgba(255,255,255,.035)' : 'rgba(5,8,14,.06)';
      gg.fillRect(Math.random() * s, Math.random() * s, 2, 2);
    }
    gg.strokeStyle = 'rgba(10,14,24,.5)'; gg.lineWidth = 5;
    [s * .3, s * .7].forEach(x => { gg.beginPath(); gg.moveTo(x, 0); gg.lineTo(x + (Math.random() - .5) * 14, s); gg.stroke(); });
  }, 1, 8);
  const road = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 29), toon(0xffffff, { map: roadTex, roughness: 0.8 }));
  road.rotation.x = -Math.PI / 2; road.position.set(0, 0, -21.5); road.receiveShadow = true; g.add(road);
  // sapins (déterministes), qui laissent la route et le seuil libres
  const trunkMat = toon(0x2a2019, { roughness: 1 }), pineMat = toon(0x122018, { roughness: 1 });
  const pine = (x, z, s) => {
    const t = new THREE.Group(); t.position.set(x, 0, z); t.scale.setScalar(s); g.add(t);
    cyl(0.12, 0.16, 1.0, trunkMat, 0, 0.5, 0, t, 8);
    [[1.5, 1.5], [1.15, 2.5], [0.8, 3.4]].forEach(([r, y]) => {
      const co = new THREE.Mesh(new THREE.ConeGeometry(r, 1.9, 9), pineMat);
      co.position.y = y; co.castShadow = true; t.add(co);
    });
    colliders.push({ minX: x - 0.3 * s, maxX: x + 0.3 * s, minZ: z - 0.3 * s, maxZ: z + 0.3 * s, maxY: 3 });
  };
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 44; i++) {
    const x = (rnd() - 0.5) * 46, z = -9.5 - rnd() * 24;
    if (Math.abs(x) < 3.6) continue;
    if (z > -11.5 && Math.abs(x) < 6.5) continue;
    pine(x, z, 0.8 + rnd() * 0.9);
  }
  // crête lointaine, lune, étoiles (hors brouillard)
  const ridgeTex = canvasTex(512, (gg, s) => {
    gg.fillStyle = '#0d1526'; gg.fillRect(0, 0, s, s);
    gg.fillStyle = '#080e1c';
    gg.beginPath(); gg.moveTo(0, s);
    for (let x = 0; x <= s; x += 32) gg.lineTo(x, s * 0.55 + Math.sin(x * 0.05) * 26 + (x % 96) * 0.14);
    gg.lineTo(s, s); gg.closePath(); gg.fill();
  });
  const ridge = new THREE.Mesh(new THREE.PlaneGeometry(90, 13),
    new THREE.MeshBasicMaterial({ map: ridgeTex, fog: false }));
  ridge.position.set(0, 6.2, -38); g.add(ridge);
  const moonDisc = new THREE.Mesh(new THREE.CircleGeometry(1.9, 26),
    new THREE.MeshBasicMaterial({ color: 0xe6eefc, fog: false }));
  moonDisc.position.set(14, 15.5, -36); moonDisc.lookAt(0, 1.5, 0); g.add(moonDisc);
  const starGeo = new THREE.BufferGeometry();
  const sp = new Float32Array(240 * 3);
  for (let i = 0; i < 240; i++) {
    const az = rnd() * Math.PI * 2, el = 0.12 + rnd() * 1.2, R = 42;
    sp[i * 3] = Math.cos(el) * Math.sin(az) * R;
    sp[i * 3 + 1] = 3 + Math.sin(el) * R * 0.5;
    sp[i * 3 + 2] = -Math.abs(Math.cos(el) * Math.cos(az) * R) - 4;
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  g.add(new THREE.Points(starGeo, new THREE.PointsMaterial({
    color: 0xcfd8ee, size: 1.6, sizeAttenuation: false, fog: false,
    transparent: true, opacity: 0.85 })));
  // façade extérieure du garage
  const fac = toon(0x212a3c, { roughness: 0.95 });
  const sideW2 = (ROOM.w - 5.7) / 2;
  box(sideW2, ROOM.h, 0.2, fac, -(2.85 + sideW2 / 2), ROOM.h / 2, -7.12);
  box(sideW2, ROOM.h, 0.2, fac, (2.85 + sideW2 / 2), ROOM.h / 2, -7.12);
  box(5.7, ROOM.h - 3.8 + 0.2, 0.2, fac, 0, 3.8 + (ROOM.h - 3.8) / 2, -7.12);
  box(0.2, ROOM.h, 14.3, fac, -8.15, ROOM.h / 2, 0);
  box(0.2, ROOM.h, 14.3, fac, 8.15, ROOM.h / 2, 0);
  box(16.7, ROOM.h, 0.2, fac, 0, ROOM.h / 2, 7.14);
  box(16.9, 0.28, 14.7, fac, 0, ROOM.h + 0.16, 0);
  // lampe de seuil au-dessus de la porte, dehors
  const porch = new THREE.PointLight(0xffa25c, 7, 9, 2);
  porch.position.set(0, 3.95, -7.6); scene.add(porch);
  const porchBulb = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), M.bulb.clone());
  porchBulb.position.set(0, 3.9, -7.28); scene.add(porchBulb);
}
buildOutside();

// transformations monde <-> local du van
function vanToLocal(wx, wz, out) {
  const dx = wx - vanState.x, dz = wz - vanState.z;
  const c = Math.cos(vanState.yaw), sn = Math.sin(vanState.yaw);
  out.x = c * dx - sn * dz; out.z = sn * dx + c * dz; return out;
}
function vanToWorld(lx, lz, out) {
  const c = Math.cos(vanState.yaw), sn = Math.sin(vanState.yaw);
  out.x = vanState.x + c * lx + sn * lz; out.z = vanState.z - sn * lx + c * lz; return out;
}
function syncVan() {
  hirondelle.group.position.set(vanState.x, 0, vanState.z);
  hirondelle.group.rotation.y = vanState.yaw;
}
syncVan();

/* --- traces de pneus dans la terre (persistantes) --- */
const TRACKS = { x0: -23, x1: 23, z0: -35, z1: -6.9, lastX: 0, lastZ: 0 };
const trackCanvas = document.createElement('canvas');
trackCanvas.width = 1024; trackCanvas.height = 640;
const trackCtx = trackCanvas.getContext('2d');
const trackTex = new THREE.CanvasTexture(trackCanvas);
{
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(TRACKS.x1 - TRACKS.x0, TRACKS.z1 - TRACKS.z0),
    new THREE.MeshBasicMaterial({ map: trackTex, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.position.set((TRACKS.x0 + TRACKS.x1) / 2, 0.02, (TRACKS.z0 + TRACKS.z1) / 2);
  scene.add(m);
}
function stampTracks() {
  const moved = Math.hypot(vanState.x - TRACKS.lastX, vanState.z - TRACKS.lastZ);
  if (moved < 0.14) return;
  TRACKS.lastX = vanState.x; TRACKS.lastZ = vanState.z;
  let dirty = false;
  for (const wl of [[-1.06, 2.2], [1.06, 2.2], [-1.06, -2.2], [1.06, -2.2]]) {
    vanToWorld(wl[0], wl[1], _w);
    if (_w.x < TRACKS.x0 || _w.x > TRACKS.x1 || _w.z < TRACKS.z0 || _w.z > TRACKS.z1) continue;
    const px = (_w.x - TRACKS.x0) / (TRACKS.x1 - TRACKS.x0) * trackCanvas.width;
    const py = (1 - (_w.z - TRACKS.z0) / (TRACKS.z1 - TRACKS.z0)) * trackCanvas.height;
    trackCtx.save();
    trackCtx.translate(px, py); trackCtx.rotate(-vanState.yaw);
    trackCtx.fillStyle = 'rgba(8,7,9,0.28)';
    trackCtx.beginPath(); trackCtx.ellipse(0, 0, 3.4, 4.6, 0, 0, 7); trackCtx.fill();
    trackCtx.restore();
    dirty = true;
  }
  if (dirty) trackTex.needsUpdate = true;
}

/* ---------------------------------------------------------- */
/* 7. Lumières                                                 */
/* ---------------------------------------------------------- */
const hemi = new THREE.HemisphereLight(0x223052, 0x100c09, 0.3);
scene.add(hemi);
// ampoule centrale sous abat-jour — cône chaud vers le sol
const keyLight = new THREE.SpotLight(0xff9440, 60, 16, 1.02, 0.62, 2);
keyLight.position.copy(anchors.lampPos);
keyLight.target.position.set(0.15, 0, -0.2);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.bias = -0.004;
keyLight.shadow.camera.near = 0.1; keyLight.shadow.camera.far = 12;
scene.add(keyLight, keyLight.target);
// second luminaire au-dessus de l'établi (cône chaud, sans ombre portée)
const keyLight2 = new THREE.SpotLight(0xff9440, 48, 14, 1.0, 0.62, 2);
keyLight2.position.copy(anchors.lamp2Pos);
keyLight2.target.position.set(-1.2, 0, 2.6);
scene.add(keyLight2, keyLight2.target);
// halo chaud résiduel (sans ombre)
const keyFill = new THREE.PointLight(0xff9440, 8, 12, 2);
keyFill.position.set(0, ROOM.h - 1.2, 0.6);
scene.add(keyFill);
// lampe d'établi
const benchLight = new THREE.PointLight(0xffc27d, 7, 6, 2);
benchLight.position.copy(anchors.benchLampPos);
scene.add(benchLight);
// lune par le bandeau vitré — contre-jour froid
const moon = new THREE.DirectionalLight(PAL.moon, 0.5);
moon.position.set(ROOM.w / 2 + 3, 4.6, -1.2);
moon.target.position.set(-0.5, 0.5, 0.4);
scene.add(moon, moon.target);
// discret contre haut-arrière pour détacher le personnage
const rim = new THREE.DirectionalLight(0x9db4e8, 0.1);
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
const dustN = 60, dustPos = new Float32Array(dustN * 3), dustSeed = [];
for (let i = 0; i < dustN; i++) {
  dustPos[i * 3] = (Math.random() - .5) * 9;        // concentrées sous les luminaires
  dustPos[i * 3 + 1] = 0.5 + Math.random() * 2.4;
  dustPos[i * 3 + 2] = 0.4 + (Math.random() - .5) * 8;
  dustSeed.push(Math.random() * 20);
}
dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
  map: dustSprite, size: 0.018, transparent: true, opacity: 0.24,
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
  const geo = new THREE.CylinderGeometry(r2, r1, len, 18, 1);
  const m = new THREE.Mesh(geo, mat);
  m.position.y = -len / 2; m.castShadow = true; g.add(m);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(r1, 16, 12), mat);
  cap.position.y = -len; cap.castShadow = true; g.add(cap);
  const cap2 = new THREE.Mesh(new THREE.SphereGeometry(r2, 16, 12), mat);
  cap2.castShadow = true; g.add(cap2);
  return g;
}
// rendu réaliste : plus de contours encrés
function outlineTree() {}

function buildCharacter() {
  const root = new THREE.Group(); scene.add(root);
  const B = {};                                   // les « os »
  B.root = root;

  B.hips = new THREE.Group(); B.hips.position.y = 0.98; root.add(B.hips);
  // torse en DEUX profils de révolution qui se recouvrent sous la ceinture :
  // une surface continue, fini les solides apparents
  const lathe = (pts, parent) => {
    const m = new THREE.Mesh(new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(p[0], p[1])), 26), M.suit);
    m.scale.set(1.15, 1, 0.9); m.castShadow = true; parent.add(m); return m;
  };
  lathe([[0.02, -0.27], [0.10, -0.25], [0.148, -0.17], [0.164, -0.06], [0.16, 0.05], [0.155, 0.17]], B.hips);
  // ceinture (elle cache le raccord des deux profils)
  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.168, 0.173, 0.055, 22), M.boots);
  belt.scale.set(1.1, 1, 0.85); belt.position.y = 0.06; belt.castShadow = true; B.hips.add(belt);
  const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.04, 0.02), M.brass);
  buckle.position.set(0, 0.06, 0.152); B.hips.add(buckle);

  // colonne
  B.spine = new THREE.Group(); B.spine.position.y = 0.09; B.hips.add(B.spine);
  B.chest = new THREE.Group(); B.chest.position.y = 0.2; B.spine.add(B.chest);
  lathe([[0.155, -0.23], [0.163, -0.1], [0.168, 0.0], [0.15, 0.1], [0.117, 0.19], [0.062, 0.25], [0.02, 0.27]], B.chest);
  // fermeture éclair + poche + écusson
  const zip = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.24, 0.01), M.suitDark);
  zip.position.set(0, 0.1, 0.15); zip.rotation.x = -0.1; B.chest.add(zip);
  const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.07, 0.014), M.suitDark);
  pocket.position.set(0.085, 0.13, 0.149); pocket.rotation.y = 0.18; B.chest.add(pocket);
  const patch = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.035, 0.012), M.cream);
  patch.position.set(-0.08, 0.16, 0.151); patch.rotation.y = -0.18; B.chest.add(patch);
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
    e.position.set(sx * 0.042, 0.075, 0.094); e.scale.set(1, 1.35, 0.6); B.head.add(e);
    const hl = new THREE.Mesh(new THREE.SphereGeometry(0.005, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0xfff4e0 }));
    hl.position.set(0.004, 0.004, 0.011); e.add(hl);
    return e;
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
    const arm = limb(0.056, 0.048, 0.28, M.suit, sh);
    const fore = limb(0.048, 0.038, 0.26, M.suit, arm); fore.position.y = -0.27;
    // poignet de chemise qui dépasse de la manche
    const wristCuff = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.043, 0.045, 12), M.cream);
    wristCuff.position.y = -0.235; wristCuff.castShadow = true; fore.add(wristCuff);
    const hand = new THREE.Group(); hand.position.y = -0.26; fore.add(hand);
    const palm = new THREE.Mesh(new THREE.SphereGeometry(0.05, 14, 12), M.skin);
    palm.scale.set(0.85, 1.1, 0.95); palm.position.y = -0.03; palm.castShadow = true; hand.add(palm);
    [-0.028, -0.0095, 0.0095, 0.028].forEach((fx, i) => {
      const f = new THREE.Mesh(new THREE.SphereGeometry(0.0135, 10, 8), M.skin);
      f.scale.set(0.85, 2.0 - Math.abs(i - 1.5) * 0.22, 0.85);
      f.position.set(fx, -0.082, 0.012); f.castShadow = true; hand.add(f);
    });
    const thumb = new THREE.Mesh(new THREE.SphereGeometry(0.019, 10, 8), M.skin);
    thumb.scale.set(0.8, 1.5, 0.8); thumb.position.set(sx * -0.004, -0.035, 0.046); hand.add(thumb);
    B['shoulder' + S] = sh; B['arm' + S] = arm; B['fore' + S] = fore; B['hand' + S] = hand;
  };
  mkArm(1); mkArm(-1);

  // jambes (pivot cuisse à ±hipHalf, y -0.05 du groupe hips)
  const mkLeg = sx => {
    const S = sx > 0 ? 'L' : 'R';
    const th = new THREE.Group(); th.position.set(sx * CHAR.hipHalf, -0.05, 0); B.hips.add(th);
    limbMeshes(th, 0.082, 0.064, CHAR.thigh, M.suit);
    const shin = new THREE.Group(); shin.position.y = -CHAR.thigh; th.add(shin);
    limbMeshes(shin, 0.064, 0.046, CHAR.shin - 0.02, M.suit);
    // revers de pantalon
    const hem = new THREE.Mesh(new THREE.CylinderGeometry(0.066, 0.07, 0.06, 16), M.suitDark);
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
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r2, r1, len, 18, 1), mat);
    m.position.y = -len / 2; m.castShadow = true; g.add(m);
    const c = new THREE.Mesh(new THREE.SphereGeometry(r1, 16, 12), mat); c.castShadow = true; g.add(c);
    const c2 = new THREE.Mesh(new THREE.SphereGeometry(r2, 16, 12), mat); c2.position.y = -len; c2.castShadow = true; g.add(c2);
  }
  mkLeg(1); mkLeg(-1);

  outlineTree(root);
  return { root, B, eyeL, eyeR };
}
const marcel = buildCharacter();

/* ---------------------------------------------------------- */
/* 8bis. Objets, interactions, boucle de jeu                   */
/* ---------------------------------------------------------- */
const gameState = { tools: 0, toolsTotal: 1, doorUnlocked: false, doorOpen: false, lightsOn: true };
const doorState = { y: 0, shake: 0, dustT: 0, done: false };
let vanBlink = 0, toastTimer = 0, entered = false;

const toastEl = document.getElementById('toast');
function toast(msg, dur = 3.4) { toastEl.textContent = msg; toastEl.style.opacity = 1; toastTimer = dur; }

function softSprite(color, size, opacity) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: dustSprite, color, transparent: true, opacity, depthWrite: false,
    blending: THREE.AdditiveBlending }));
  s.scale.setScalar(size); scene.add(s); return s;
}
// halo chaud autour de l'ampoule (matériau propre : l'ampoule doit pouvoir s'éteindre seule)
const bulbHalo = softSprite(0xffb066, 0.9, 0.3);
bulbHalo.position.copy(anchors.lampPos); bulbHalo.position.y -= 0.02;
const bulbHalo2 = softSprite(0xffb066, 0.9, 0.3);
bulbHalo2.position.copy(anchors.lamp2Pos); bulbHalo2.position.y -= 0.02;
// lueur froide au pied de la porte (montera quand elle s'ouvre)
const doorGlow = new THREE.PointLight(0x7fa8ff, 0, 10, 2);
doorGlow.position.set(0, 0.8, -ROOM.d / 2 + 0.6); scene.add(doorGlow);

// bouffées de poussière (pas de course, porte)
const puffs = [];
for (let i = 0; i < 14; i++) {
  const s = softSprite(0xcbb89a, 0.16, 0);
  s.material.blending = THREE.NormalBlending;
  puffs.push({ s, life: 0, vx: 0, vy: 0, vz: 0 });
}
let puffI = 0;
function spawnPuff(x, y, z, vx, vz) {
  const p = puffs[puffI = (puffI + 1) % puffs.length];
  p.life = 0.55; p.s.position.set(x, y, z); p.s.scale.setScalar(0.13);
  p.vx = vx + (Math.random() - .5) * .4; p.vy = 0.45 + Math.random() * .4; p.vz = vz + (Math.random() - .5) * .4;
}

// --- les cinq clés égarées ---
const toolSpots = [
  { x: -1.0, y: 0.947, z: ROOM.d / 2 - 0.38 },   // la clé de contact, oubliée sur l'établi
];
const tools = toolSpots.map((p, i) => {
  const g = new THREE.Group();
  const mat = M.brass.clone();
  mat.emissive = new THREE.Color(0xff9a4a); mat.emissiveIntensity = 0.2;
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.013, 0.12), mat);
  handle.castShadow = true; g.add(handle);
  const head = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.011, 8, 14, Math.PI * 1.55), mat);
  head.position.z = 0.072; head.rotation.x = Math.PI / 2; head.rotation.z = 0.6;
  head.castShadow = true; g.add(head);
  const glint = softSprite(0xffd9a0, 0.16, 0.5);
  glint.position.set(p.x, p.y + 0.09, p.z);
  g.position.set(p.x, p.y + 0.012, p.z); g.rotation.y = i * 1.7;
  scene.add(g);
  return { g, mat, glint, taken: false, i };
});
const TOOL_LINES = [
  'La clé de contact. Le bouton de la porte n’attend plus que toi.',
];

// --- registre des interactions ---
const interactables = [];
const interact = { nearest: null, relYaw: 0 };
const promptEl = document.getElementById('prompt');
const promptText = document.getElementById('promptText');
const btnE = document.getElementById('btnE');
function addInteract(o) { interactables.push(o); return o; }

tools.forEach(t => addInteract({
  x: t.g.position.x, z: t.g.position.z, r: 1.25,
  label: () => 'Ramasser la clé',
  enabled: () => !t.taken,
  action: () => startPickup(t),
}));
addInteract({   // le bouton de commande de la porte
  x: 3.4, z: -ROOM.d / 2 + 0.42, r: 1.2,
  label: () => !gameState.doorUnlocked ? 'Le bouton — verrouillé'
    : (gameState.doorOpen ? 'Fermer la porte' : 'Ouvrir la porte'),
  action: () => {
    if (!gameState.doorUnlocked) {
      doorState.shake = 0.5; thumpSound();
      toast('Le bouton refuse. Où est passée ma clé ?');
    } else {
      gameState.doorOpen = !gameState.doorOpen;
      clickSound(); rumbleSound();
    }
  },
});
addInteract({   // l'interrupteur
  x: 3.9, z: -ROOM.d / 2 + 0.42, r: 1.0,
  label: () => gameState.lightsOn ? 'Éteindre la lumière' : 'Rallumer la lumière',
  action: () => {
    gameState.lightsOn = !gameState.lightsOn; clickSound();
    toast(gameState.lightsOn ? 'Voilà qui est mieux.' : 'La lune suffit, parfois.');
  },
});
addInteract({   // la radio, sur la kitchenette du van
  pos: () => vanToWorld(-0.5, -0.35, _w), r: 1.15,
  label: () => audio.musicOn ? 'Éteindre la radio' : 'Allumer la radio',
  enabled: () => player.onVan && !vanState.driving,
  action: () => { audio.toggleMusic(); toast(audio.musicOn ? 'Un peu de musique.' : 'Silence, alors.'); },
});
addInteract({   // devant la porte latérale du van
  pos: () => vanToWorld(1.55, 1.0, _w), r: 1.4,
  label: () => 'L’Hirondelle — monter à bord',
  enabled: () => !player.onVan && !vanState.driving,
  action: () => {
    vanBlink = 1.4; clickSound();
    toast('La porte est ouverte. Monte, fais comme chez toi.');
  },
});
addInteract({   // le volant
  pos: () => vanToWorld(VAN.seat.x + 0.5, VAN.seat.z + 0.45, _w), r: 1.05,
  label: () => 'Prendre le volant',
  enabled: () => player.onVan && !vanState.driving,
  action: () => enterDrive(),
});
addInteract({   // l'affiche
  x: ROOM.w / 2 - 0.15, z: 1.6, r: 1.25,
  label: () => 'Regarder l’affiche',
  action: () => toast('« Un jour, la route. » — un jour proche.'),
});

// la radio vit desormais dans L'Hirondelle (voir buildVan) ; l'interrupteur reste au mur
const radioLED = hirondelle.radioLed;
(() => {  // interrupteur pres du bouton de porte
  const p = new THREE.Group(); p.position.set(3.9, 1.25, -ROOM.d / 2 + 0.045); scene.add(p);
  box(0.07, 0.11, 0.025, M.cream, 0, 0, 0, p);
  box(0.024, 0.04, 0.02, M.brass, 0, 0.01, 0.015, p);
})();

function startPickup(t) {
  if (anim.action) return;
  const dx = t.g.position.x - player.pos.x, dz = t.g.position.z - player.pos.z;
  anim.action = { type: 'pickup', t: 0, dur: 1.05, item: t, faceYaw: Math.atan2(dx, dz), grabbed: false };
}

function updateObjective() {
  document.getElementById('objN').textContent = gameState.tools;
  if (gameState.tools >= gameState.toolsTotal) {
    gameState.doorUnlocked = true;
    document.getElementById('objective').innerHTML = 'Clé en poche — <b>le bouton, puis en route</b>';
  }
}

function updateInteract() {
  let best = null, bd = 1e9, bx = 0, bz = 0;
  for (const o of interactables) {
    if (o.enabled && !o.enabled()) continue;
    let px = o.x, pz = o.z;
    if (o.pos) { const p = o.pos(); px = p.x; pz = p.z; }
    const d = Math.hypot(px - player.pos.x, pz - player.pos.z);
    if (d < o.r && d < bd) { bd = d; best = o; bx = px; bz = pz; }
  }
  interact.nearest = best;
  if (best) interact.relYaw = wrapPi(Math.atan2(bx - player.pos.x, bz - player.pos.z) - player.yaw);
  const show = best && !anim.action;
  promptEl.style.opacity = show ? 1 : 0;
  btnE.style.opacity = show ? 1 : 0.35;
  if (show) promptText.textContent = ' ' + best.label();
}
function tryInteract() { if (entered && interact.nearest && !anim.action) interact.nearest.action(); }

/* --- contrôles tactiles --- */
const touch = { on: 'ontouchstart' in window, ax: 0, az: 0, run: false, stickId: null, camId: null, camX: 0, camY: 0 };
if (touch.on) {
  document.body.classList.add('touch');
  document.getElementById('hint').textContent = '';
  const zone = document.getElementById('stickZone');
  const nub = document.getElementById('stickNub');
  const btnRun = document.getElementById('btnRun');
  zone.addEventListener('touchstart', e => {
    e.preventDefault();
    if (touch.stickId === null) touch.stickId = e.changedTouches[0].identifier;
  }, { passive: false });
  renderer.domElement.addEventListener('touchstart', e => {
    touch.lastT = performance.now();
    if (touch.camId === null) {
      const t = e.changedTouches[0];
      touch.camId = t.identifier; touch.camX = t.clientX; touch.camY = t.clientY;
    }
  }, { passive: true });
  addEventListener('touchmove', e => {
    for (const t of e.changedTouches) {
      if (t.identifier === touch.stickId) {
        const r = zone.getBoundingClientRect();
        let dx = (t.clientX - (r.left + 64)) / 50, dy = (t.clientY - (r.top + 64)) / 50;
        const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
        touch.ax = dx; touch.az = -dy;
        nub.style.left = (44 + dx * 34) + 'px'; nub.style.top = (44 + dy * 34) + 'px';
      } else if (t.identifier === touch.camId) {
        if (camCtl.locked) continue;
        camCtl.yaw -= (t.clientX - touch.camX) * 0.006;
        camCtl.pitch = clamp(camCtl.pitch + (t.clientY - touch.camY) * 0.006, CAM.minPitch, CAM.maxPitch);
        touch.camX = t.clientX; touch.camY = t.clientY;
      }
    }
  }, { passive: true });
  const release = e => {
    for (const t of e.changedTouches) {
      if (t.identifier === touch.stickId) {
        touch.stickId = null; touch.ax = touch.az = 0;
        nub.style.left = '44px'; nub.style.top = '44px';
      }
      if (t.identifier === touch.camId) touch.camId = null;
    }
  };
  addEventListener('touchend', release); addEventListener('touchcancel', release);
  btnE.addEventListener('touchstart', e => {
    e.preventDefault();
    if (vanState.driving) exitDrive(); else tryInteract();
  }, { passive: false });
  btnRun.addEventListener('touchstart', e => {
    e.preventDefault(); touch.run = !touch.run;
    btnRun.style.borderColor = touch.run ? '#ffb066' : 'rgba(232,220,200,.3)';
  }, { passive: false });
}

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

function seatedPose(t, dt) {
  const B = marcel.B;
  B.hips.position.set(0, 0.52, 0.06);
  B.hips.rotation.set(-0.06, 0, 0);
  B.spine.rotation.set(0.06 + Math.sin(t * 1.4) * 0.012, 0, 0);
  B.chest.rotation.set(0.05, 0, 0);
  solveLeg('L', 1, _v3.set(0.16, 0.11, 0.44), 0);
  solveLeg('R', -1, _v3.set(-0.16, 0.11, 0.44), 0);
  B.shoulderL.rotation.set(-0.95, 0, 0.12);
  B.shoulderR.rotation.set(-0.95, 0, -0.12);
  B.foreL.rotation.x = -0.55; B.foreR.rotation.x = -0.55;
  B.handL.rotation.x = -0.2; B.handR.rotation.x = -0.2;
  B.neck.rotation.set(0, 0, 0); B.head.rotation.set(0.02, 0, 0);
  anim.blinkT -= dt;
  if (anim.blinkT <= 0) { anim.blinkT = 1.8 + Math.random() * 3.4; anim.blink = 1; }
  anim.blink = Math.max(0, anim.blink - dt * 9);
  const es = 1 - Math.min(1, anim.blink * 1.6) * 0.88;
  marcel.eyeL.scale.y = 1.35 * es; marcel.eyeR.scale.y = 1.35 * es;
}

function animate(dt, t, speed, yawRate, accelFwd) {
  const B = marcel.B;
  if (vanState.driving) { seatedPose(t, dt); return; }
  const fg = window.__atelier && window.__atelier.forceGait;   // pose figée (outillage)
  if (fg) { speed = fg.speed; yawRate = 0; accelFwd = 0; }
  const m = anim.moveBlend = fg ? sstep(0.08, 0.6, speed)
    : damp(anim.moveBlend, sstep(0.08, 0.6, speed), 8, dt);
  const r = anim.runBlend = fg ? sstep(2.2, 3.6, speed)
    : damp(anim.runBlend, sstep(2.2, 3.6, speed), 6, dt);
  // poids de l'action de ramassage (cloche : 0 → accroupi → 0)
  const act = anim.action;
  const aw = act && act.type === 'pickup'
    ? Math.pow(Math.sin(Math.PI * clamp(act.t / act.dur, 0, 1)), 0.8) : 0;

  // paramètres d'allure — la course introduit une phase de vol (appui court)
  const duty = lerp(0.58, 0.30, r);
  const cadence0 = lerp(1.3, 2.0, r);            // cycles/s « naturels »
  const strideCap = lerp(0.58, 0.62, r);         // borné par l'allonge réelle des jambes
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
  const bobBase = lerp(0.975, lerp(0.915, 0.885, r), m);
  const bobPhase = r * 0.6 * Math.PI;
  const bob = m * lerp(0.016, 0.055, r) * (0.5 - 0.5 * Math.cos(2 * p2 - bobPhase));
  const sway = m * lerp(0.022, 0.012, r) * Math.sin(p2);
  const idleSway = (1 - m) * 0.016 * noise1(t * 0.4);
  B.hips.position.set(sway + idleSway, bobBase + bob - aw * 0.27, aw * 0.03);
  const pelvYaw = -m * lerp(0.10, 0.16, r) * Math.cos(p2);  // hanche gauche en avant avec la jambe gauche
  const pelvRoll = m * 0.045 * Math.sin(p2) + anim.leanRoll;
  const idleBreath = (1 - m) * 0.012 * Math.sin(t * 1.6);
  B.hips.rotation.set(anim.leanPitch + m * 0.03 + idleBreath * 0.3 + aw * 0.5, pelvYaw, pelvRoll);

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
    // contact au sol → bruit de pas + bouffée de poussière en course
    const grounded = m > 0.35 && u < duty;
    if (grounded && !anim.contact[S] && speed > 0.4) {
      stepSound(Math.min(1, speed / 4));
      if (speed > 2.8) {
        marcel.B['foot' + S].getWorldPosition(_v);
        spawnPuff(_v.x, 0.05, _v.z, -player.vel.x * 0.05, -player.vel.z * 0.05);
      }
    }
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
  if (aw > 0) {                       // main droite tendue vers la clé
    B.shoulderR.rotation.x = lerp(B.shoulderR.rotation.x, -1.15, aw);
    B.shoulderR.rotation.z = lerp(B.shoulderR.rotation.z, 0.18, aw);
    B.foreR.rotation.x = lerp(B.foreR.rotation.x, -0.22, aw);
    B.chest.rotation.x += aw * 0.22;
  }

  // --- tête : stabilisée, regarde les objets proches, regards curieux à l'arrêt ---
  const glance = (1 - m) * sstep(0.4, 0.9, Math.abs(noise1(t * 0.23)));
  const lookAtIt = interact.nearest && m < 0.5 && Math.abs(interact.relYaw) < 1.15 && !aw;
  const headYawTgt = lookAtIt ? interact.relYaw * 0.6
    : glance * noise1(t * 0.31 + 9) * 0.55 - pelvYaw * 0.35;
  anim.headYaw = damp(anim.headYaw, headYawTgt, 4, dt);
  anim.headPitch = damp(anim.headPitch,
    (lookAtIt ? 0.22 : glance * noise1(t * 0.27 + 4) * 0.14) - anim.leanPitch * 1.1 + m * 0.02 + aw * 0.45, 4, dt);
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
  if (e.repeat) return;
  keys[e.code] = true;
  if (e.code === 'KeyM') audio.toggle();
  if (e.code === 'KeyE') { if (vanState.driving) exitDrive(); else tryInteract(); }
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
  pos: new THREE.Vector3(2.0, 0, 4.4),
  vel: new THREE.Vector3(),
  yaw: Math.PI,            // face à la porte du garage
  yawRate: 0,
  speed: 0,
  groundY: 0, onVan: false,
};

// murs du garage en colliders (le passage de la porte s'ouvre avec elle)
const doorBlock = { minX: -2.86, maxX: 2.86, minZ: -7.24, maxZ: -6.9, maxY: 4.1, active: true };
const vanCamCol = { minX: 0, maxX: 0, minZ: 0, maxZ: 0, maxY: 2.6, active: true, noBody: true };
colliders.push(
  { minX: -8.36, maxX: -7.97, minZ: -7.28, maxZ: 7.28, maxY: 4.8 },   // ouest
  { minX: 7.97, maxX: 8.36, minZ: -7.28, maxZ: 7.28, maxY: 4.8 },     // est
  { minX: -8.36, maxX: 8.36, minZ: 6.97, maxZ: 7.32, maxY: 4.8 },     // sud
  { minX: -8.36, maxX: -2.86, minZ: -7.32, maxZ: -6.97, maxY: 4.8 },  // nord, gauche de la porte
  { minX: 2.86, maxX: 8.36, minZ: -7.32, maxZ: -6.97, maxY: 4.8 },    // nord, droite
  doorBlock, vanCamCol,
);

const WORLD = { xMin: -24, xMax: 24, zMin: -36, zMax: 10 };
const _l = { x: 0, z: 0 }, _w = { x: 0, z: 0 };

function resolveCircle(pos, r, minX, maxX, minZ, maxZ) {
  const nx = clamp(pos.x, minX, maxX), nz = clamp(pos.z, minZ, maxZ);
  const dx = pos.x - nx, dz = pos.z - nz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return;
  if (d2 > 1e-8) {
    const d = Math.sqrt(d2), push = (r - d) / d;
    pos.x += dx * push; pos.z += dz * push;
  } else {
    // au cœur de la boîte : expulser par la face la plus proche valide
    const outs = [
      { p: maxX + r - pos.x, ax: 'x', v: maxX + r }, { p: pos.x - (minX - r), ax: 'x', v: minX - r },
      { p: maxZ + r - pos.z, ax: 'z', v: maxZ + r }, { p: pos.z - (minZ - r), ax: 'z', v: minZ - r },
    ].sort((A, B2) => A.p - B2.p);
    const ok = outs.find(o => o.ax === 'x'
      ? (o.v >= WORLD.xMin && o.v <= WORLD.xMax) : (o.v >= WORLD.zMin && o.v <= WORLD.zMax)) || outs[0];
    if (ok.ax === 'x') pos.x = ok.v; else pos.z = ok.v;
  }
}

function collide(pos) {
  const r = CHAR.radius;
  pos.x = clamp(pos.x, WORLD.xMin, WORLD.xMax);
  pos.z = clamp(pos.z, WORLD.zMin, WORLD.zMax);
  // obstacles et murs du monde
  for (const c of colliders) {
    if (c.active === false || c.noBody) continue;
    resolveCircle(pos, r, c.minX, c.maxX, c.minZ, c.maxZ);
  }
  // coque et mobilier du van, dans son repère local (l'intérieur voyage avec lui)
  vanToLocal(pos.x, pos.z, _l);
  if (Math.abs(_l.x) < 1.5 && Math.abs(_l.z) < 3.0) {
    for (const c of VAN.cols) resolveCircle(_l, r, c.x0, c.x1, c.z0, c.z1);
    vanToWorld(_l.x, _l.z, _w);
    pos.x = _w.x; pos.z = _w.z;
  }
}

function updatePlayer(dt) {
  if (vanState.driving) {
    // au volant : Marcel est porté par L'Hirondelle
    vanToWorld(VAN.seat.x, VAN.seat.z, _w);
    player.pos.set(_w.x, VAN.floorY, _w.z);
    player.vel.set(0, 0, 0); player.speed = 0; player.yawRate = 0;
    player.yaw = vanState.yaw + Math.PI;
    player.groundY = VAN.floorY; player.onVan = true;
    marcel.root.position.copy(player.pos);
    marcel.root.rotation.y = player.yaw;
    return 0;
  }
  let axis = keyAxis(), mag = 1;
  if (touch.on && touch.stickId !== null && (touch.ax || touch.az)) {
    mag = Math.min(1, Math.hypot(touch.ax, touch.az));
    if (mag > 0.05) axis = { x: touch.ax / mag, z: touch.az / mag };
    else mag = 1;                                    // déflexion rejetée : ne pas brider le clavier
  }
  if (anim.action || !entered) axis = { x: 0, z: 0 };  // immobile pendant le ramassage / l'écran-titre
  const running = (keys.ShiftLeft || keys.ShiftRight || touch.run) && !anim.action;
  const maxSpeed = (running ? CHAR.runSpeed : CHAR.walkSpeed) * mag;
  // direction voulue, relative à la caméra (l'avant écran est −(sin cy, cos cy))
  const cy = camCtl.yaw;
  const dirX = axis.x * Math.cos(cy) - axis.z * Math.sin(cy);
  const dirZ = -axis.x * Math.sin(cy) - axis.z * Math.cos(cy);
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
  const px = player.pos.x, pz = player.pos.z;
  player.pos.x += player.vel.x * dt;
  player.pos.z += player.vel.z * dt;
  collide(player.pos);
  // la vitesse devient le déplacement effectif : bloqué contre un mur = à l'arrêt,
  // glissade oblique = seule la composante tangentielle anime la foulée
  player.vel.x = (player.pos.x - px) / dt;
  player.vel.z = (player.pos.z - pz) / dt;

  player.speed = Math.hypot(player.vel.x, player.vel.z);
  // orientation : caméra (vue subjective), clé (ramassage), sinon la vitesse
  if (camCtl.distSmooth < 0.8 && !anim.action) {
    player.yaw = dampAngle(player.yaw, camCtl.yaw + Math.PI, 14, dt);
    player.yawRate = damp(player.yawRate, 0, 8, dt);
  } else if (anim.action && anim.action.faceYaw !== undefined) {
    player.yaw = dampAngle(player.yaw, anim.action.faceYaw, 9, dt);
    player.yawRate = damp(player.yawRate, 0, 8, dt);
  } else if (player.speed > 0.15) {
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

  // hauteur du sol : plancher du van, marchepied, ou bitume
  vanToLocal(player.pos.x, player.pos.z, _l);
  player.onVan = Math.abs(_l.x) < VAN.innerX && Math.abs(_l.z) < VAN.innerZ;
  const onStep = !player.onVan && _l.x > 1.11 && _l.x < 1.78 && _l.z > 0.45 && _l.z < 1.55;
  player.groundY = damp(player.groundY, player.onVan ? VAN.floorY : (onStep ? 0.2 : 0), 11, dt);
  player.pos.y = player.groundY;

  marcel.root.position.copy(player.pos);
  marcel.root.rotation.y = player.yaw;
  return accelFwd;
}

/* --- conduite de L'Hirondelle --- */
const vanCorners = [[-1.3, -3.47], [1.3, -3.47], [-1.3, 3.47], [1.3, 3.47],
  [-1.3, 0], [1.3, 0], [0, -3.47], [0, 3.47]];
let camPrevDist = CAM.dist0;
function updateVan(dt) {
  if (vanState.driving) {
    let axis = keyAxis();
    if (touch.on && touch.stickId !== null && (touch.ax || touch.az)) {
      const m = Math.hypot(touch.ax, touch.az);
      if (m > 0.05) axis = { x: touch.ax / m, z: touch.az / m };
    }
    const throttle = axis.z, steer = axis.x;
    vanState.speed += throttle * 3.4 * dt;
    vanState.speed = clamp(vanState.speed, -2.2, 6.0);
    if (!throttle) vanState.speed *= Math.max(0, 1 - 2.2 * dt);
    if (Math.abs(vanState.speed) > 0.03) {
      vanState.yaw -= steer * dt * 1.15 * clamp(Math.abs(vanState.speed) / 2.0, 0, 1) * Math.sign(vanState.speed);
      const nx = vanState.x - Math.sin(vanState.yaw) * vanState.speed * dt;
      const nz = vanState.z - Math.cos(vanState.yaw) * vanState.speed * dt;
      const c = Math.cos(vanState.yaw), sn = Math.sin(vanState.yaw);
      let blocked = false;
      for (const [cx, cz] of vanCorners) {
        const wx = nx + c * cx + sn * cz, wz = nz - sn * cx + c * cz;
        if (wx < WORLD.xMin + 1 || wx > WORLD.xMax - 1 || wz < WORLD.zMin + 1 || wz > WORLD.zMax - 1) { blocked = true; break; }
        for (const cc of colliders) {
          if (cc.active === false || cc.noBody) continue;
          if (wx > cc.minX - 0.05 && wx < cc.maxX + 0.05 && wz > cc.minZ - 0.05 && wz < cc.maxZ + 0.05) { blocked = true; break; }
        }
        if (blocked) break;
      }
      if (blocked) {
        if (Math.abs(vanState.speed) > 0.6) thumpSound();
        vanState.speed *= -0.15;
      } else {
        vanState.x = nx; vanState.z = nz;
        stampTracks();
        // poussiere soulevee par les roues sur la terre
        if (Math.abs(vanState.speed) > 1.4 && vanState.z < -6.9 && Math.random() < 0.5) {
          const side = Math.random() < 0.5 ? -1.06 : 1.06;
          vanToWorld(side, 2.3, _w);
          spawnPuff(_w.x, 0.12, _w.z, 0, 0);
        }
      }
    }
  } else {
    vanState.speed *= Math.max(0, 1 - 5 * dt);
  }
  syncVan();
}
function enterDrive() {
  vanState.driving = true;
  camPrevDist = camCtl.distTarget;
  camCtl.distTarget = 9.0;
  engineStart();
  if (!vanState.driveHint) {
    vanState.driveHint = true;
    toast('Z/S — rouler · Q/D — tourner · E — couper le moteur', 6.5);
  }
}
function exitDrive() {
  vanState.driving = false;
  vanState.speed = 0;
  engineStop();
  camCtl.distTarget = camPrevDist;
  vanToWorld(0.35, -2.1, _w);            // debout dans le couloir de la cabine
  player.pos.set(_w.x, VAN.floorY, _w.z);
  player.yaw = vanState.yaw + Math.PI;
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
  // sur un tap tactile émulé en clic, ne pas capturer le pointeur
  const tryLock = () => {
    if (performance.now() - (touch.lastT || 0) < 700) return;
    if (el.requestPointerLock) el.requestPointerLock();
  };
  enter.addEventListener('click', () => {
    entered = true; audio.start(); tryLock(); enter.classList.add('hidden');
    if (!camCtl.locked) { hint.textContent = 'Clique pour piloter la caméra'; hint.style.opacity = 0.7; }
  });
  enter.addEventListener('touchstart', () => { touch.lastT = performance.now(); }, { passive: true });
  el.addEventListener('click', () => { if (!camCtl.locked) tryLock(); });
  document.addEventListener('pointerlockchange', () => {
    camCtl.locked = document.pointerLockElement === el;
    hint.textContent = camCtl.locked ? 'Échap pour libérer la souris' : 'Clique pour piloter la caméra';
    hint.style.opacity = 0.7;
  });
  // clic dans la fenêtre = capture de la souris ; la caméra ne bouge que capturée
  addEventListener('mousemove', e => {
    if (!camCtl.locked) return;
    camCtl.yaw -= e.movementX * CAM.sens;
    camCtl.pitch = clamp(camCtl.pitch + e.movementY * CAM.sens, CAM.minPitch, CAM.maxPitch);
  });
  addEventListener('wheel', e => {
    camCtl.distTarget = clamp(camCtl.distTarget + Math.sign(e.deltaY) * 0.3, 0.34, CAM.maxDist);
    // en dessous d'un seuil, on bascule franchement en vue à la première personne
    if (camCtl.distTarget < 1.0) camCtl.distTarget = 0.34;
  }, { passive: true });
}

// distance max le long d'un rayon avant de toucher sol / obstacles
function cameraRayLimit(origin, dir, want) {
  let tMax = want;
  // ne jamais passer sous le sol
  if (dir.y < -1e-6) {
    const t = (0.14 - origin.y) / dir.y;
    if (t > 0) tMax = Math.min(tMax, t);
  }
  // ni à travers le plafond du garage quand on est dedans
  if (dir.y > 1e-6 && origin.y < ROOM.h - 0.2 && Math.abs(origin.x) < ROOM.w / 2 && Math.abs(origin.z) < ROOM.d / 2) {
    const t = (ROOM.h - 0.18 - origin.y) / dir.y;
    if (t > 0) tMax = Math.min(tMax, t);
  }
  // obstacles (gonflés) — méthode des « slabs »
  for (const c of colliders) {
    if (c.active === false) continue;
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
  const fp = sstep(1.35, 0.55, camCtl.distSmooth);      // 0 = 3e personne, 1 = 1re personne
  const th = vanState.driving ? 2.45 : lerp(CAM.targetH, 1.6, fp);
  camCtl.target.y = damp(camCtl.target.y, player.pos.y + th, 7, dt);
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
  // proche du personnage, le regard glisse vers l'avant (première personne)
  const lead = Math.max(0, 1.35 - camCtl.distSmooth) * 2.2;
  _v.copy(camCtl.target).addScaledVector(_v2, -lead);
  camera.lookAt(_v);
  // en vue subjective, la tête disparaît et le corps reste
  marcel.B.head.visible = camCtl.distSmooth > 0.62;

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
  musicOn: false, music: null, lastNote: 0,
  toggleMusic() {
    this.start();
    if (!this.ctx) { this.musicOn = !this.musicOn; return; }
    this.musicOn = !this.musicOn;
    if (this.musicOn && !this.music) this.buildMusic();
    if (this.music) {
      const t = this.ctx.currentTime, g = this.music.g.gain;
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);        // ancre : sans elle, la rampe part de la dernière valeur PLANIFIÉE
      g.linearRampToValueAtTime(this.musicOn ? 0.42 : 0.0001, t + 1.1);
    }
  },
  buildMusic() {
    const c = this.ctx;
    const g = c.createGain(); g.gain.value = 0.0001; g.connect(this.master);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 850; lp.connect(g);
    const padG = c.createGain(); padG.gain.value = 0.045; padG.connect(lp);
    [[146.83, -5], [220, 4], [293.66, -2]].forEach(([f, det]) => {
      const o = c.createOscillator(); o.type = 'triangle';
      o.frequency.value = f; o.detune.value = det; o.connect(padG); o.start();
    });
    const dl = c.createDelay(1); dl.delayTime.value = 0.42;
    const fb = c.createGain(); fb.gain.value = 0.3; dl.connect(fb); fb.connect(dl); dl.connect(g);
    // mélodie pentatonique paresseuse, en ré mineur
    const notes = [293.66, 349.23, 392, 440, 523.25, 587.33];
    let idx = 2;
    setInterval(() => {
      if (!this.musicOn || Math.random() < 0.3) return;
      idx = clamp(idx + ((Math.random() * 3) | 0) - 1, 0, notes.length - 1);
      const t = c.currentTime;
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = notes[idx];
      const e = c.createGain(); e.gain.setValueAtTime(0.0008, t);
      e.gain.exponentialRampToValueAtTime(0.055, t + 0.04);
      e.gain.exponentialRampToValueAtTime(0.0006, t + 1.15);
      o.connect(e); e.connect(dl); e.connect(g);
      o.start(t); o.stop(t + 1.25);
      this.lastNote = performance.now();
    }, 620);
    this.music = { g };
  },
  start() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;   // respecter un M pressé avant le clic
      this.master.connect(this.ctx.destination);
      if (this.ctx.state === 'suspended') this.ctx.resume();
      // (pas de nappe continue : l'atelier est silencieux, seuls les gestes sonnent)
    } catch (e) { /* pas de son */ }
  },
  toggle() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
  },
};
function clinkSound() {
  if (!audio.ctx || audio.muted) return;
  const c = audio.ctx, t = c.currentTime;
  [2093, 3136].forEach((f, i) => {
    const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f * (1 + Math.random() * 0.012);
    const g = c.createGain(); g.gain.setValueAtTime(0.06 / (i + 1), t);
    g.gain.exponentialRampToValueAtTime(0.0005, t + 0.18);
    o.connect(g); g.connect(audio.master); o.start(t); o.stop(t + 0.2);
  });
}
function clickSound() {
  if (!audio.ctx || audio.muted) return;
  const c = audio.ctx, t = c.currentTime;
  const o = c.createOscillator(); o.type = 'square'; o.frequency.value = 940;
  const g = c.createGain(); g.gain.setValueAtTime(0.05, t);
  g.gain.exponentialRampToValueAtTime(0.0005, t + 0.04);
  o.connect(g); g.connect(audio.master); o.start(t); o.stop(t + 0.05);
}
function thumpSound() {
  if (!audio.ctx || audio.muted) return;
  const c = audio.ctx, t = c.currentTime;
  const o = c.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(85, t);
  o.frequency.exponentialRampToValueAtTime(45, t + 0.22);
  const g = c.createGain(); g.gain.setValueAtTime(0.16, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
  o.connect(g); g.connect(audio.master); o.start(t); o.stop(t + 0.3);
}
function rumbleSound() {
  if (!audio.ctx || audio.muted) return;
  const c = audio.ctx, t = c.currentTime;
  [52, 66].forEach(f => {
    const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.09, t + 0.3);
    g.gain.linearRampToValueAtTime(0.0001, t + 2.6);
    o.connect(g); g.connect(audio.master); o.start(t); o.stop(t + 2.7);
  });
}
let engineNodes = null;
function engineStart() {
  if (!audio.ctx || engineNodes) return;
  const c = audio.ctx;
  const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 52;
  const o2 = c.createOscillator(); o2.type = 'square'; o2.frequency.value = 26;
  const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 240;
  const g = c.createGain(); g.gain.value = 0.0001;
  o.connect(f); o2.connect(f); f.connect(g); g.connect(audio.master);
  o.start(); o2.start();
  g.gain.linearRampToValueAtTime(0.05, c.currentTime + 0.5);
  engineNodes = { o, o2, g };
}
function engineStop() {
  if (!engineNodes) return;
  const { o, o2, g } = engineNodes, c = audio.ctx;
  g.gain.setValueAtTime(g.gain.value, c.currentTime);
  g.gain.linearRampToValueAtTime(0.0001, c.currentTime + 0.5);
  o.stop(c.currentTime + 0.6); o2.stop(c.currentTime + 0.6);
  engineNodes = null;
}
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

  // action en cours : le ramassage
  if (anim.action) {
    const a = anim.action; a.t += dt;
    if (a.type === 'pickup') {
      if (!a.grabbed && a.t > 0.45) {
        a.grabbed = true; clinkSound();
        a.from = a.item.g.position.clone();
      }
      if (a.grabbed && !a.item.taken) {
        const k = clamp((a.t - 0.45) / 0.32, 0, 1), e = smooth(k);
        _v.set(player.pos.x + Math.sin(player.yaw) * 0.4, 0.52, player.pos.z + Math.cos(player.yaw) * 0.4);
        a.item.g.position.lerpVectors(a.from, _v, e);
        a.item.g.scale.setScalar(Math.max(0.001, 1 - e));
        if (k >= 1) {
          a.item.taken = true; scene.remove(a.item.g); scene.remove(a.item.glint);
          gameState.tools++; updateObjective();
          toast(TOOL_LINES[gameState.tools - 1], 3.8);
        }
      }
      if (a.t >= a.dur) anim.action = null;
    }
  }
  updateInteract();

  updateVan(dt);
  const accelFwd = updatePlayer(dt);
  animate(dt, elapsed, player.speed, player.yawRate, accelFwd);
  updateCamera(dt);

  // clés : scintillement d'appel
  for (const tl of tools) {
    if (tl.taken) continue;
    tl.mat.emissiveIntensity = 0.15 + 0.22 * (0.5 + 0.5 * Math.sin(elapsed * 2.6 + tl.i * 2));
    tl.glint.material.opacity = 0.22 + 0.3 * (0.5 + 0.5 * Math.sin(elapsed * 3.1 + tl.i));
    tl.glint.scale.setScalar(0.12 + 0.05 * Math.sin(elapsed * 2.2 + tl.i * 3));
  }
  // bouffées de poussière
  for (const p of puffs) {
    if (p.life <= 0) continue;
    p.life -= dt;
    p.s.position.x += p.vx * dt; p.s.position.y += p.vy * dt; p.s.position.z += p.vz * dt;
    p.vy *= Math.max(0, 1 - 2 * dt);
    p.s.scale.multiplyScalar(1 + 1.6 * dt);
    p.s.material.opacity = Math.max(0, p.life / 0.55) * 0.4;
  }
  // porte : secousse (verrouillée) ou va-et-vient commandé par le bouton
  const doorTgt = gameState.doorOpen ? 1 : 0;
  if (doorState.shake > 0) {
    doorState.shake -= dt * 1.6;
    anchors.door.position.y = Math.max(0, Math.sin(elapsed * 42) * 0.02 * doorState.shake);
  } else if (doorState.y !== doorTgt) {
    doorState.y += clamp(doorTgt - doorState.y, -dt / 3.2, dt / 3.2);
    doorState.y = clamp(doorState.y, 0, 1);
    const e = smooth(doorState.y);
    anchors.door.position.y = e * 3.55;
    doorGlow.intensity = e * 14;
    doorState.dustT -= dt;
    if (doorState.dustT <= 0 && doorState.y > 0.03 && doorState.y < 0.92) {
      doorState.dustT = 0.12;
      spawnPuff((Math.random() - .5) * 4.6, 0.12 + Math.random() * 0.35, -ROOM.d / 2 + 0.32, 0, 0.3);
    }
    if (doorState.y >= 1 && !doorState.done) {
      doorState.done = true;
      toast('La nuit t’attend. Prends le volant.', 7);
    }
  }
  doorBlock.active = doorState.y < 0.9;
  // phares de L'Hirondelle : appel, ou pleins feux en conduite
  const lensOn = vanState.driving || (vanBlink > 0 && Math.sin(vanBlink * 13) > 0);
  hirondelle.lenses.forEach(l => {
    l.color.setHex(lensOn ? 0xffedc0 : 0x6b5c40);
    l.emissive.setHex(lensOn ? 0xffc36a : 0x241c10);
  });
  hirondelle.beams.forEach(b => b.intensity = damp(b.intensity, lensOn ? 260 : 0, 8, dt));
  if (vanBlink > 0) vanBlink -= dt;
  // collider caméra du van (approximation englobante, inactif quand on est à bord)
  {
    const cA = Math.abs(Math.cos(vanState.yaw)), sA = Math.abs(Math.sin(vanState.yaw));
    const hx = cA * 1.32 + sA * 3.5, hz = sA * 1.32 + cA * 3.5;
    vanCamCol.minX = vanState.x - hx; vanCamCol.maxX = vanState.x + hx;
    vanCamCol.minZ = vanState.z - hz; vanCamCol.maxZ = vanState.z + hz;
    vanCamCol.active = !player.onVan && !vanState.driving;
  }
  // régime moteur
  if (engineNodes) {
    engineNodes.o.frequency.value = 50 + Math.abs(vanState.speed) * 13;
    engineNodes.o2.frequency.value = 25 + Math.abs(vanState.speed) * 6.5;
  }
  // LED du bouton de porte
  anchors.doorLamp.color.setHex(gameState.doorUnlocked ? 0x59d68a : 0x552222);
  // toast
  if (toastTimer > 0) { toastTimer -= dt; if (toastTimer <= 0) toastEl.style.opacity = 0; }
  // LED de la radio, au rythme des notes
  const beat = audio.musicOn ? Math.max(0, 1 - (performance.now() - audio.lastNote) / 450) : 0;
  radioLED.material.color.setRGB(0.2 + beat * 0.8, 0.12 + beat * 0.25, 0.1 + beat * 0.12);

  // poussières qui dérivent
  const pa = dust.geometry.attributes.position;
  for (let i = 0; i < dustN; i++) {
    pa.array[i * 3 + 1] += Math.sin(elapsed * 0.5 + dustSeed[i]) * 0.0004 - 0.0002;
    pa.array[i * 3] += Math.sin(elapsed * 0.3 + dustSeed[i] * 2) * 0.0003;
    if (pa.array[i * 3 + 1] < 0.2) pa.array[i * 3 + 1] = 3.6;
  }
  pa.needsUpdate = true;
  // lumières : état de l'interrupteur + scintillement à peine perceptible
  const flick = Math.sin(elapsed * 13) * 0.014 + noise1(elapsed * 3.1) * 0.012;
  keyLight.intensity = damp(keyLight.intensity, gameState.lightsOn ? 60 + flick * 16 : 0, 5, dt);
  keyLight2.intensity = damp(keyLight2.intensity, gameState.lightsOn ? 48 + flick * 14 : 0, 5, dt);
  keyFill.intensity = damp(keyFill.intensity, gameState.lightsOn ? 8 : 0.4, 5, dt);
  hemi.intensity = damp(hemi.intensity, gameState.lightsOn ? 0.3 : 0.13, 5, dt);
  moon.intensity = damp(moon.intensity, gameState.lightsOn ? 0.5 : 0.85, 5, dt);
  const bulbCol = gameState.lightsOn ? 0xffc078 : 0x2b2b36;
  anchors.bulb.material.color.setHex(bulbCol);
  anchors.bulb2.material.color.setHex(bulbCol);
  const haloOp = 0.3 * Math.max(0, keyLight.intensity / 60);
  bulbHalo.material.opacity = haloOp; bulbHalo2.material.opacity = haloOp;

  renderer.render(scene, camera);
}
requestAnimationFrame(tick);

// petites poignées pour l'outillage (captures, tests)
window.__atelier = {
  player, camCtl, anim, marcel, renderer, gameState, tools, interact, tryInteract, toolSpots, vanState, hirondelle, scene,
  setCam(yaw, pitch, dist) { camCtl.yaw = yaw; camCtl.pitch = pitch; camCtl.distTarget = dist; camCtl.distSmooth = dist; camCtl.dist = dist; },
  warp(x, z, yaw) { player.pos.set(x, 0, z); if (yaw !== undefined) player.yaw = yaw; },
  press(code, v) { keys[code] = v; },
};
