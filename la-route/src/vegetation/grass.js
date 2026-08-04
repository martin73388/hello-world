/**
 * Le tapis : herbe en touffes, fougères et buissons en thin instances autour
 * du joueur. Chaque touffe ondule au vent (déphasée par sa position) et SE
 * COUCHE là où le sol est enfoncé — elle lit le même buffer d'état que les
 * ornières, donc le passage du van laisse un sillon d'herbe écrasée qui se
 * relève avec la guérison du terrain.
 * Le tapis suit le joueur : re-semé en deux phases (positions, puis upload)
 * quand il s'éloigne, comme le patch de déformation.
 */
import '@babylonjs/core/Meshes/thinInstanceMesh.js';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { MaterialPluginBase } from '@babylonjs/core/Materials/materialPluginBase.js';
import { windClock, sunShared } from './wind.js';
import { groundHeight, roadQuery, ROAD_HALF, GARAGE } from '../terrain/road.js';

/**
 * Vent + couchage : un seul plugin pour le tapis. L'amplitude croît avec la
 * hauteur du sommet (le pied reste planté), le couchage lit R (enfoncement)
 * et G (berme) du buffer d'état.
 */
class GrassPlugin extends MaterialPluginBase {
  constructor(material, deformState, opts = {}) {
    super(material, 'Grass', 200, { GRASS: false });
    this._st = deformState;
    this.strength = opts.strength ?? 1;
    this.transl = opts.transl ?? 1.35;               // le brin s'allume à contre-jour
    this._enable(true);
  }
  getClassName() { return 'GrassPlugin'; }
  prepareDefines(defines) { defines.GRASS = true; }
  getSamplers(samplers) { samplers.push('grTex'); }
  getUniforms() {
    return {
      ubo: [
        { name: 'grTime', size: 1, type: 'float' },
        { name: 'grStrength', size: 1, type: 'float' },
        { name: 'grCenter', size: 2, type: 'vec2' },
        { name: 'grSize', size: 1, type: 'float' },
        { name: 'grTransl', size: 1, type: 'float' },
        { name: 'grSun', size: 3, type: 'vec3' },
      ],
      vertex: `#ifdef GRASS
uniform float grTime; uniform float grStrength; uniform vec2 grCenter; uniform float grSize;
#endif`,
      fragment: `#ifdef GRASS
uniform float grTransl; uniform vec3 grSun;
#endif`,
    };
  }
  bindForSubMesh(ubo) {
    const s = this._st;
    ubo.updateFloat('grTime', windClock.t);
    ubo.updateFloat('grStrength', this.strength);
    ubo.updateFloat2('grCenter', s.cx, s.cz);
    ubo.updateFloat('grSize', s.size);
    ubo.updateFloat('grTransl', this.transl);
    ubo.updateFloat3('grSun', sunShared.x, sunShared.y, sunShared.z);
    ubo.setTexture('grTex', s.frontTex);
  }
  getCustomCode(shaderType) {
    if (shaderType === 'fragment') {
      return {
        // Le cœur du rendu d'herbe : à contre-jour, le brin est TRAVERSÉ par
        // la lumière et s'allume en jaune-vert. Le terme monte quand on
        // regarde vers le soleil, et il est le plus fort en haut du brin
        // (la pointe est fine, elle transmet mieux que la base).
        CUSTOM_FRAGMENT_BEFORE_FRAGCOLOR: `
#ifdef GRASS
        vec3 grV = normalize(vEyePosition.xyz - vPositionW);
        float grBack = clamp(dot(grV, normalize(grSun)), 0.0, 1.0);
        // la texture du brin est peinte en dégradé pied sombre → pointe
        // claire : sa luminance EST la hauteur le long du brin, et c'est
        // la pointe, fine, qui transmet le mieux la lumière
        float grUp = dot(baseColor.rgb, vec3(0.33, 0.5, 0.17));
        color.rgb += vec3(0.78, 0.86, 0.30) * pow(grBack, 2.2)
                   * (0.25 + 1.5 * grUp) * grTransl * baseColor.rgb * 2.2;
#endif
`,
      };
    }
    if (shaderType !== 'vertex') return null;
    return {
      // le sampler se déclare ici (comme deformPlugin) : dans le bloc
      // d'uniformes il tombe dans l'UBO et la compilation échoue
      CUSTOM_VERTEX_DEFINITIONS: `
#ifdef GRASS
uniform sampler2D grTex;
#endif
`,
      CUSTOM_VERTEX_UPDATE_POSITION: `
#ifdef GRASS
#ifdef INSTANCES
        vec2 grWp = vec2(world3.x, world3.z);
#else
        vec2 grWp = vec2(0.0);
#endif
        float grH = max(0.0, positionUpdated.y);
        // vent : houle lente + frisson de brin, amplitude ∝ hauteur
        float grPh = dot(grWp, vec2(0.37, 0.29));
        float grG = sin(grTime * 1.15 + grPh) * 0.65 + sin(grTime * 2.7 + grPh * 1.9) * 0.35;
        float grA = grStrength * grH * grH * 0.55;
        positionUpdated.x += (0.81 * grG + sin(grTime * 5.1 + grPh * 3.3) * 0.22) * grA;
        positionUpdated.z += (0.59 * grG + sin(grTime * 4.3 + grPh * 2.7) * 0.22) * grA;
        // couchage : le sol enfoncé plaque la touffe et l'écarte du creux
        vec2 grUv = (grWp - grCenter) / grSize + 0.5;
        if (grUv.x > 0.0 && grUv.x < 1.0 && grUv.y > 0.0 && grUv.y < 1.0) {
          vec2 grD = texture2D(grTex, grUv).rg;
          float grFlat = clamp(grD.x * 9.0, 0.0, 1.0);
          positionUpdated.y -= grH * grFlat * 0.82;               // couchée
          positionUpdated.xz += normalize(grWp - grCenter + vec2(1e-4)) * grH * grFlat * 0.3;
          positionUpdated.y += grD.y;                             // suit la berme
        }
#endif
`,
    };
  }
}

/** LCG déterministe, comme partout dans le projet */
function makeRnd(seed) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/**
 * Touffe : quelques cartes verticales qui s'écartent en éventail. La FORME
 * des brins est peinte dans l'alpha de la texture (découpe, pas fondu : pas
 * de tri de transparence sur 15 000 instances), et le dégradé vertical de la
 * texture éclaircit les pointes — la recette qui fait lire « herbe » plutôt
 * que « triangle vert ».
 */
function tuftGeometry(scene, name, h, w, cards) {
  const pos = [], idx = [], uv = [], nrm = [];
  for (let b = 0; b < cards; b++) {
    const a = (b / cards) * Math.PI + 0.35;
    const dx = Math.cos(a) * w * 0.5, dz = Math.sin(a) * w * 0.5;
    const lean = 0.16 * (b % 2 ? 1 : -1);                       // les cartes s'inclinent
    const o = pos.length / 3;
    pos.push(-dx, 0, -dz, dx, 0, dz,
      dx + dz * lean, h, dz - dx * lean, -dx + dz * lean, h, -dz - dx * lean);
    uv.push(0, 0, 1, 0, 1, 1, 0, 1);
    // normale verticale : l'herbe reçoit la lumière du ciel, pas des flancs
    for (let k = 0; k < 4; k++) nrm.push(0, 1, 0);
    idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
    idx.push(o, o + 2, o + 1, o, o + 3, o + 2);                 // double face
  }
  const m = new Mesh(name, scene);
  const vd = new VertexData();
  vd.positions = pos; vd.indices = idx; vd.normals = nrm; vd.uvs = uv;
  vd.applyToMesh(m);
  return m;
}

/** carte de brins : silhouettes effilées peintes dans l'alpha, pointes claires */
function bladeTexture(scene, name, blades, base, tip, seed) {
  const tex = new DynamicTexture(name, { width: 64, height: 64 }, scene, true);
  const g = tex.getContext();
  g.clearRect(0, 0, 64, 64);
  let s = seed;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < blades; i++) {
    const x0 = 4 + rnd() * 56;                                  // pied du brin
    const bend = (rnd() - 0.5) * 26;                            // courbure
    const top = 6 + rnd() * 22;                                 // hauteur (y bas = pointe)
    const wid = 1.6 + rnd() * 2.2;
    // dégradé pied → pointe : le vert s'éclaircit et jaunit en montant
    const grad = g.createLinearGradient(0, 64, 0, top);
    grad.addColorStop(0, base);
    grad.addColorStop(1, tip);
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(x0 - wid, 64);
    g.quadraticCurveTo(x0 - wid * 0.6 + bend * 0.5, (64 + top) / 2, x0 + bend, top);
    g.quadraticCurveTo(x0 + wid * 0.6 + bend * 0.5, (64 + top) / 2, x0 + wid, 64);
    g.closePath(); g.fill();
  }
  tex.update();
  tex.hasAlpha = true;
  tex.updateSamplingMode(1);                                    // nearest : grain 32 bits
  return tex;
}

/** brins fleuris : tiges vertes surmontées de corolles claires */
function flowerTexture(scene, name, seed) {
  const tex = new DynamicTexture(name, { width: 64, height: 64 }, scene, true);
  const g = tex.getContext();
  g.clearRect(0, 0, 64, 64);
  let s = seed;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const petals = ['#f2e9c8', '#e8c46a', '#d9a0b8', '#efe3ea'];
  for (let i = 0; i < 9; i++) {
    const x0 = 6 + rnd() * 52, top = 8 + rnd() * 20, bend = (rnd() - 0.5) * 14;
    g.strokeStyle = '#3d5a1c'; g.lineWidth = 1.4;                // la tige
    g.beginPath(); g.moveTo(x0, 64);
    g.quadraticCurveTo(x0 + bend * 0.4, (64 + top) / 2, x0 + bend, top + 3);
    g.stroke();
    g.fillStyle = petals[(i + seed) % petals.length];            // la corolle
    const cx = x0 + bend, cy = top;
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      g.beginPath();
      g.ellipse(cx + Math.cos(a) * 2.1, cy + Math.sin(a) * 2.1, 1.9, 1.4, a, 0, 7);
      g.fill();
    }
    g.fillStyle = '#c98f2a';
    g.beginPath(); g.arc(cx, cy, 1.2, 0, 7); g.fill();
  }
  tex.update();
  tex.hasAlpha = true;
  tex.updateSamplingMode(1);
  return tex;
}

const R = 34;              // rayon du tapis autour du joueur (dense au près)
const RESEED = 7;          // au-delà, on re-sème

export function plantGrass(scene, deformState, opts = {}) {
  const N_GRASS = opts.grass ?? 15000;
  const N_FERN = opts.ferns ?? 900;
  const N_BUSH = opts.bushes ?? 240;

  const mk = (name, mesh, color, strength, tex) => {
    const mat = new StandardMaterial(name + 'M', scene);
    mat.diffuseColor = color;
    mat.specularColor = new Color3(0.02, 0.03, 0.02);
    mat.backFaceCulling = false;
    if (tex) {
      mat.diffuseTexture = tex;
      mat.useAlphaFromDiffuseTexture = true;
      mat.diffuseTexture.hasAlpha = true;
      // découpe franche plutôt que fondu : aucun tri de transparence
      mat.needAlphaTesting = () => true;
      mat.needAlphaBlending = () => false;
    }
    new GrassPlugin(mat, deformState, { strength });
    mesh.material = mat;
    mesh.receiveShadows = true;
    mesh.alwaysSelectAsActiveMesh = true;                        // suit le joueur
    mesh.isPickable = false;
    return mat;
  };

  // trois strates d'herbe : le tapis ras, les hautes tiges qui montent à
  // mi-cuisse, et les roseaux des creux — c'est la VARIÉTÉ de hauteur qui
  // fait la prairie, pas la densité d'une seule espèce
  const grass = tuftGeometry(scene, 'grassTuft', 0.34, 0.24, 3);
  mk('grass', grass, new Color3(1, 1, 1), 1.0,
    bladeTexture(scene, 'bladeTex', 26, '#38571a', '#a8bd66', 13));
  const tall = tuftGeometry(scene, 'tallTuft', 0.92, 0.34, 4);
  mk('tall', tall, new Color3(1, 1, 1), 1.25,
    bladeTexture(scene, 'tallTex', 16, '#42611d', '#c6cf72', 29));
  const reed = tuftGeometry(scene, 'reedTuft', 1.35, 0.22, 3);
  mk('reed', reed, new Color3(1, 1, 1), 1.5,
    bladeTexture(scene, 'reedTex', 9, '#4a5c22', '#d8cf84', 53));
  const flower = tuftGeometry(scene, 'flowerTuft', 0.42, 0.26, 3);
  mk('flower', flower, new Color3(1, 1, 1), 1.1,
    flowerTexture(scene, 'flowerTex', 91));
  const fern = tuftGeometry(scene, 'fernTuft', 0.58, 0.85, 4);
  mk('fern', fern, new Color3(1, 1, 1), 0.55,
    bladeTexture(scene, 'fernTex', 14, '#22400f', '#5a8029', 71));
  const bush = MeshBuilder.CreateSphere('bush', { diameter: 1.25, segments: 5 }, scene);
  bush.bakeCurrentTransformIntoVertices();
  mk('bush', bush, new Color3(0.19, 0.26, 0.13), 0.3);

  const N_TALL = opts.tall ?? 4200;
  const N_REED = opts.reeds ?? 1100;
  const N_FLOW = opts.flowers ?? 900;
  const bufG = new Float32Array(N_GRASS * 16);
  const bufF = new Float32Array(N_FERN * 16);
  const bufB = new Float32Array(N_BUSH * 16);
  const bufT = new Float32Array(N_TALL * 16);
  const bufR = new Float32Array(N_REED * 16);
  const bufW = new Float32Array(N_FLOW * 16);

  /** écrit une matrice TRS (rotation Y seule) à plat, colonne-major */
  function writeM(buf, i, x, y, z, sx, sy, ry) {
    const c = Math.cos(ry) * sx, s = Math.sin(ry) * sx;
    const o = i * 16;
    buf[o] = c; buf[o + 1] = 0; buf[o + 2] = -s; buf[o + 3] = 0;
    buf[o + 4] = 0; buf[o + 5] = sy; buf[o + 6] = 0; buf[o + 7] = 0;
    buf[o + 8] = s; buf[o + 9] = 0; buf[o + 10] = c; buf[o + 11] = 0;
    buf[o + 12] = x; buf[o + 13] = y; buf[o + 14] = z; buf[o + 15] = 1;
  }

  /** semis déterministe : la graine dérive de la cellule, donc une même
   * zone repousse toujours identique quand on revient dessus */
  function sow(cx, cz) {
    const rnd = makeRnd(97 + Math.round(cx * 7.3) * 131 + Math.round(cz * 7.3) * 17 || 97);
    let gi = 0, fi = 0, bi = 0;
    for (let i = 0; i < N_GRASS * 2 && gi < N_GRASS; i++) {
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * R;
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      const rq = roadQuery(x, z);
      if (rq.dist < ROAD_HALF + 0.35) continue;                  // pas sur la chaussée
      if (Math.abs(x - GARAGE.x) < GARAGE.hw + 1 && z > GARAGE.z0 - 2 && z < GARAGE.z1) continue;
      // plus rase sur le talus, plus haute dans le sous-bois
      const lush = 0.6 + Math.min(1, rq.dist / 14) * 0.55;
      const s = (0.7 + rnd() * 0.6) * lush;
      writeM(bufG, gi++, x, groundHeight(x, z) - 0.04, z, s, s * (0.75 + rnd() * 0.7), rnd() * 3.14);
    }
    for (; gi < N_GRASS; gi++) writeM(bufG, gi, 0, -999, 0, 0, 0, 0);

    for (let i = 0; i < N_FERN * 4 && fi < N_FERN; i++) {
      const a = rnd() * Math.PI * 2, r = 4 + Math.sqrt(rnd()) * (R - 4);
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      if (roadQuery(x, z).dist < ROAD_HALF + 2.2) continue;      // la fougère fuit la route
      const s = 0.7 + rnd() * 0.75;
      writeM(bufF, fi++, x, groundHeight(x, z) - 0.05, z, s, s * (0.8 + rnd() * 0.5), rnd() * 3.14);
    }
    for (; fi < N_FERN; fi++) writeM(bufF, fi, 0, -999, 0, 0, 0, 0);

    // hautes tiges : en touffes, jamais uniformes — elles font la prairie
    let ti = 0, ri = 0, wi = 0;
    for (let i = 0; i < N_TALL * 3 && ti < N_TALL; i++) {
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * R;
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      const rq = roadQuery(x, z);
      if (rq.dist < ROAD_HALF + 1.6) continue;
      const s = 0.62 + rnd() * 0.75;
      writeM(bufT, ti++, x, groundHeight(x, z) - 0.05, z, s, s * (0.75 + rnd() * 0.6), rnd() * 3.14);
    }
    for (; ti < N_TALL; ti++) writeM(bufT, ti, 0, -999, 0, 0, 0, 0);
    // roseaux : seulement dans les creux, là où l'eau stagnerait
    for (let i = 0; i < N_REED * 8 && ri < N_REED; i++) {
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * R;
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      const rq = roadQuery(x, z);
      if (rq.dist < ROAD_HALF + 3) continue;
      const gy = groundHeight(x, z);
      // un creux local : le sol descend par rapport à ses voisins
      const low = (groundHeight(x + 3, z) + groundHeight(x - 3, z)
        + groundHeight(x, z + 3) + groundHeight(x, z - 3)) / 4 - gy;
      if (low < 0.12) continue;
      const s = 0.7 + rnd() * 0.6;
      writeM(bufR, ri++, x, gy - 0.05, z, s, s * (0.8 + rnd() * 0.55), rnd() * 3.14);
    }
    for (; ri < N_REED; ri++) writeM(bufR, ri, 0, -999, 0, 0, 0, 0);
    // fleurs : en petites colonies, dans les zones ouvertes
    for (let i = 0; i < N_FLOW * 4 && wi < N_FLOW; i++) {
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * R;
      const bx = cx + Math.cos(a) * r, bz = cz + Math.sin(a) * r;
      const n = 3 + Math.floor(rnd() * 7);                        // la colonie
      for (let k = 0; k < n && wi < N_FLOW; k++) {
        const x = bx + (rnd() - 0.5) * 2.6, z = bz + (rnd() - 0.5) * 2.6;
        if (roadQuery(x, z).dist < ROAD_HALF + 1.2) continue;
        const s = 0.7 + rnd() * 0.6;
        writeM(bufW, wi++, x, groundHeight(x, z) - 0.03, z, s, s, rnd() * 3.14);
      }
    }
    for (; wi < N_FLOW; wi++) writeM(bufW, wi, 0, -999, 0, 0, 0, 0);

    for (let i = 0; i < N_BUSH * 6 && bi < N_BUSH; i++) {
      const a = rnd() * Math.PI * 2, r = 6 + Math.sqrt(rnd()) * (R - 6);
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      if (roadQuery(x, z).dist < ROAD_HALF + 3.5) continue;
      const s = 0.55 + rnd() * 0.8;
      writeM(bufB, bi++, x, groundHeight(x, z) - 0.35 * s, z, s, s * (0.6 + rnd() * 0.35), rnd() * 3.14);
    }
    for (; bi < N_BUSH; bi++) writeM(bufB, bi, 0, -999, 0, 0, 0, 0);
  }

  let cx = 0, cz = 20;
  sow(cx, cz);
  grass.thinInstanceSetBuffer('matrix', bufG, 16, false);
  fern.thinInstanceSetBuffer('matrix', bufF, 16, false);
  bush.thinInstanceSetBuffer('matrix', bufB, 16, false);
  tall.thinInstanceSetBuffer('matrix', bufT, 16, false);
  reed.thinInstanceSetBuffer('matrix', bufR, 16, false);
  flower.thinInstanceSetBuffer('matrix', bufW, 16, false);

  // re-semis en 2 phases (CPU lourd, upload léger) — étalé sur 2 frames
  let phase = 0, tx = 0, tz = 0;
  function tick(px, pz) {
    if (phase === 0) {
      if (Math.hypot(px - cx, pz - cz) > RESEED) { tx = px; tz = pz; phase = 1; }
      return;
    }
    if (phase === 1) { sow(tx, tz); phase = 2; return; }
    grass.thinInstanceBufferUpdated('matrix');
    fern.thinInstanceBufferUpdated('matrix');
    bush.thinInstanceBufferUpdated('matrix');
    tall.thinInstanceBufferUpdated('matrix');
    reed.thinInstanceBufferUpdated('matrix');
    flower.thinInstanceBufferUpdated('matrix');
    cx = tx; cz = tz; phase = 0;
  }

  return { tick, meshes: [grass, tall, reed, flower, fern, bush] };
}
