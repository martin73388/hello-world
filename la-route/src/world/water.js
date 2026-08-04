/**
 * Le gué — un ruisseau qui coupe la route, avec une vraie réflexion.
 * La nappe est plate et horizontale (l'eau l'est toujours) ; elle porte une
 * MirrorTexture basse résolution qui renvoie la forêt et le ciel, deux
 * couches de vaguelettes peintes qui défilent à des vitesses différentes, et
 * un fondu de Fresnel : transparente à la verticale, miroir au rasant.
 * Des nénuphars flottent sur les eaux calmes, des galets tapissent le lit, et
 * de fines éclaboussures marquent le passage du gué.
 */
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color.js';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { ParticleSystem } from '@babylonjs/core/Particles/particleSystem.js';
import { FresnelParameters } from '@babylonjs/core/Materials/fresnelParameters.js';
import '@babylonjs/core/Meshes/thinInstanceMesh.js';
import { height, FORD, fordShape } from '../terrain/road.js';

/** vaguelettes : traits clairs ondulés, façon eau peinte à la main */
function rippleTexture(scene, name, seed, lines, alpha) {
  const S = 256;
  const tex = new DynamicTexture(name, { width: S, height: S }, scene, true);
  const g = tex.getContext();
  g.clearRect(0, 0, S, S);
  let s = seed;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  g.lineCap = 'round';
  for (let i = 0; i < lines; i++) {
    const y = rnd() * S, len = 18 + rnd() * 62, amp = 1.5 + rnd() * 3.5;
    g.strokeStyle = `rgba(255,255,255,${alpha * (0.35 + rnd() * 0.65)})`;
    g.lineWidth = 1 + rnd() * 2.2;
    const x0 = rnd() * S;
    g.beginPath(); g.moveTo(x0, y);
    for (let c = 1; c <= 6; c++) g.lineTo(x0 + (len * c) / 6, y + Math.sin(c * 1.7 + i) * amp);
    g.stroke();
  }
  tex.update();
  tex.hasAlpha = true;
  return tex;
}

/** nénuphar : disque encoché, nervures, liseré sombre */
function padTexture(scene) {
  const S = 128;
  const tex = new DynamicTexture('padTex', { width: S, height: S }, scene, false);
  const g = tex.getContext();
  g.clearRect(0, 0, S, S);
  const c = S / 2, r = S * 0.46;
  g.fillStyle = '#2f5c28';
  g.beginPath();
  g.arc(c, c, r, 0.42, Math.PI * 2 - 0.42);           // l'encoche caractéristique
  g.lineTo(c, c); g.closePath(); g.fill();
  g.strokeStyle = 'rgba(126,166,96,0.55)'; g.lineWidth = 1.6;
  for (let i = 0; i < 9; i++) {                       // nervures en éventail
    const a = 0.5 + (i / 8) * (Math.PI * 2 - 1.0);
    g.beginPath(); g.moveTo(c, c);
    g.lineTo(c + Math.cos(a) * r * 0.93, c + Math.sin(a) * r * 0.93);
    g.stroke();
  }
  g.strokeStyle = 'rgba(22,48,20,0.6)'; g.lineWidth = 2.4;
  g.beginPath(); g.arc(c, c, r - 1, 0.42, Math.PI * 2 - 0.42); g.stroke();
  tex.update();
  tex.hasAlpha = true;
  return tex;
}

const SEG = 26, HALF_LEN = 46;

export function buildWater(scene, refs = {}) {
  // la géométrie du gué vient de road.js : c'est height() qui creuse le lit,
  // ici on ne fait que poser la nappe, les galets et les nénuphars dessus
  const WY = FORD.y;
  const nx = FORD.nx, nz = FORD.nz;
  const S = { x: FORD.x, z: FORD.z, y: FORD.y, tx: FORD.tx, tz: FORD.tz };

  /* ---- la nappe ---- */
  const NV = (SEG + 1) * 2;
  const pos = new Float32Array(NV * 3);
  const uv = new Float32Array(NV * 2);
  const nrm = new Float32Array(NV * 3);
  const idx = new Uint32Array(SEG * 6);
  const halfAt = [];
  let p = 0, u = 0, k = 0;
  for (let i = 0; i <= SEG; i++) {
    const t = (i / SEG - 0.5) * 2;
    const along = t * HALF_LEN;
    const sh = fordShape(t);                        // même profil que le lit creusé
    const wob = sh.wob, half = sh.half;
    halfAt.push({ along, wob, half });
    const cx = FORD.x + nx * along + S.tx * wob;
    const cz = FORD.z + nz * along + S.tz * wob;
    for (const sgn of [-1, 1]) {
      pos[p] = cx + S.tx * sgn * half; pos[p + 1] = WY; pos[p + 2] = cz + S.tz * sgn * half;
      nrm[p] = 0; nrm[p + 1] = 1; nrm[p + 2] = 0;
      p += 3;
      uv[u++] = (sgn + 1) * 0.5; uv[u++] = i * 0.6;
    }
    if (i < SEG) {
      const a = i * 2;
      idx[k++] = a; idx[k++] = a + 1; idx[k++] = a + 2;
      idx[k++] = a + 1; idx[k++] = a + 3; idx[k++] = a + 2;
    }
  }
  const surf = new Mesh('waterSurf', scene);
  const vd = new VertexData();
  vd.positions = pos; vd.indices = idx; vd.normals = nrm; vd.uvs = uv;
  vd.applyToMesh(surf);
  surf.isPickable = false;

  /* ---- matériau : eau stylisée à Fresnel ----
   * Pas de MirrorTexture : une passe de réflexion coûte une seconde caméra,
   * dépend du contenu de sa renderList et se comporte mal sur certains
   * pilotes. À la place, le reflet est SIMULÉ — l'eau vire à la couleur du
   * ciel au rasant (Fresnel sur l'émissif) et garde son fond vert sombre à
   * la verticale, exactement ce que fait l'œil sur une eau calme. */
  const mat = new StandardMaterial('waterM', scene);
  mat.diffuseColor = new Color3(0.06, 0.13, 0.14);    // fond d'eau sombre
  mat.specularColor = new Color3(0.7, 0.75, 0.8);     // le soleil s'y allume
  mat.specularPower = 220;
  mat.emissiveColor = new Color3(0.2, 0.31, 0.43);    // teinte de ciel, mutée
  mat.alpha = 0.9;
  mat.backFaceCulling = false;
  // au rasant l'eau devient ciel ; à la verticale on voit le fond
  mat.emissiveFresnelParameters = new FresnelParameters();
  mat.emissiveFresnelParameters.bias = 0.02;
  mat.emissiveFresnelParameters.power = 4.0;
  mat.emissiveFresnelParameters.leftColor = Color3.White();
  mat.emissiveFresnelParameters.rightColor = Color3.Black();
  // et elle s'opacifie au rasant : de face on voit les galets du lit
  mat.opacityFresnelParameters = new FresnelParameters();
  mat.opacityFresnelParameters.bias = 0.3;
  mat.opacityFresnelParameters.power = 2.4;
  surf.material = mat;

  // deux couches de vaguelettes à vitesses différentes : le courant
  const rip1 = rippleTexture(scene, 'rip1', 13, 150, 0.5);
  const rip2 = rippleTexture(scene, 'rip2', 71, 90, 0.32);
  rip1.uScale = 3; rip1.vScale = 6;
  rip2.uScale = 5; rip2.vScale = 11;

  // le voile d'écume : un second plan très légèrement au-dessus
  const foam = surf.clone('waterFoam');
  foam.position.y += 0.014;
  const fmat = new StandardMaterial('waterFoamM', scene);
  fmat.emissiveTexture = rip2;
  fmat.opacityTexture = rip2;
  fmat.diffuseColor = new Color3(0, 0, 0);
  fmat.specularColor = new Color3(0, 0, 0);
  fmat.disableLighting = true;
  fmat.emissiveColor = new Color3(0.8, 0.88, 0.94);
  fmat.alpha = 0.42;
  fmat.backFaceCulling = false;
  foam.material = fmat;
  foam.isPickable = false;

  // et une couche de rides plus lentes sur l'eau elle-même
  const rid = surf.clone('waterRipples');
  rid.position.y += 0.007;
  const rmat = new StandardMaterial('waterRipM', scene);
  rmat.emissiveTexture = rip1;
  rmat.opacityTexture = rip1;
  rmat.diffuseColor = new Color3(0, 0, 0);
  rmat.specularColor = new Color3(0, 0, 0);
  rmat.disableLighting = true;
  rmat.emissiveColor = new Color3(0.5, 0.66, 0.74);
  rmat.alpha = 0.3;
  rmat.backFaceCulling = false;
  rid.material = rmat;
  rid.isPickable = false;

  /* ---- galets du lit et des berges ---- */
  const peb = MeshBuilder.CreateIcoSphere('pebbles', { radius: 0.16, subdivisions: 1 }, scene);
  const pmat = new StandardMaterial('pebM', scene);
  pmat.diffuseColor = new Color3(0.34, 0.34, 0.32);
  pmat.specularColor = new Color3(0.22, 0.24, 0.26);  // mouillés, donc brillants
  pmat.specularPower = 48;
  peb.material = pmat;
  peb.isPickable = false;
  let s2 = 29;
  const rnd = () => (s2 = (s2 * 16807) % 2147483647) / 2147483647;
  const NP = 260;
  const pbuf = new Float32Array(NP * 16);
  const q = new Quaternion(), sc = new Vector3(), tr = new Vector3(), m = new Matrix();
  for (let i = 0; i < NP; i++) {
    const seg = halfAt[Math.floor(rnd() * halfAt.length)];
    const side = (rnd() - 0.5) * 2 * (seg.half + 1.5);
    const cx = FORD.x + nx * (seg.along + (rnd() - 0.5) * 3) + S.tx * (seg.wob + side);
    const cz = FORD.z + nz * (seg.along + (rnd() - 0.5) * 3) + S.tz * (seg.wob + side);
    const sz = 0.5 + rnd() * 1.3;
    sc.set(sz, sz * (0.4 + rnd() * 0.3), sz);
    Quaternion.RotationYawPitchRollToRef(rnd() * 6.3, (rnd() - 0.5) * 0.4, 0, q);
    tr.set(cx, Math.min(WY - 0.02, height(cx, cz)) + 0.02, cz);
    Matrix.ComposeToRef(sc, q, tr, m);
    m.copyToArray(pbuf, i * 16);
  }
  peb.thinInstanceSetBuffer('matrix', pbuf, 16, true);

  /* ---- nénuphars : sur les eaux calmes, loin du gué ---- */
  const pad = MeshBuilder.CreateGround('lilypads', { width: 1, height: 1 }, scene);
  const padMat = new StandardMaterial('padM', scene);
  const ptex = padTexture(scene);
  padMat.diffuseTexture = ptex;
  padMat.useAlphaFromDiffuseTexture = true;
  padMat.diffuseTexture.hasAlpha = true;
  padMat.needAlphaTesting = () => true;
  padMat.needAlphaBlending = () => false;
  padMat.specularColor = new Color3(0.12, 0.14, 0.1);
  padMat.backFaceCulling = false;
  pad.material = padMat;
  pad.isPickable = false;
  pad.receiveShadows = true;
  const NL = 46;
  const lbuf = new Float32Array(NL * 16);
  let li = 0;
  for (let i = 0; i < NL * 6 && li < NL; i++) {
    const seg = halfAt[Math.floor(rnd() * halfAt.length)];
    // jamais dans le gué lui-même : l'eau y est brassée
    if (Math.abs(seg.along) < 9) continue;
    const side = (rnd() - 0.5) * 1.5 * seg.half;
    const cx = FORD.x + nx * (seg.along + (rnd() - 0.5) * 2.5) + S.tx * (seg.wob + side);
    const cz = FORD.z + nz * (seg.along + (rnd() - 0.5) * 2.5) + S.tz * (seg.wob + side);
    const sz = 0.5 + rnd() * 0.55;
    sc.set(sz, 1, sz);
    Quaternion.RotationYawPitchRollToRef(rnd() * 6.3, 0, 0, q);
    tr.set(cx, WY + 0.02, cz);
    Matrix.ComposeToRef(sc, q, tr, m);
    m.copyToArray(lbuf, li * 16);
    li++;
  }
  for (; li < NL; li++) {                             // slots inutilisés, échelle 0
    sc.set(0, 0, 0); Quaternion.RotationYawPitchRollToRef(0, 0, 0, q); tr.set(0, -999, 0);
    Matrix.ComposeToRef(sc, q, tr, m); m.copyToArray(lbuf, li * 16);
  }
  pad.thinInstanceSetBuffer('matrix', lbuf, 16, true);

  /* ---- éclaboussures au gué ---- */
  const sprayTex = new DynamicTexture('sprayTex', 64, scene, false);
  {
    const g = sprayTex.getContext();
    const gr = g.createRadialGradient(32, 32, 1, 32, 32, 30);
    gr.addColorStop(0, 'rgba(255,255,255,.95)');
    gr.addColorStop(0.5, 'rgba(228,240,246,.4)');
    gr.addColorStop(1, 'rgba(210,230,240,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(32, 32, 30, 0, 7); g.fill();
    sprayTex.update(); sprayTex.hasAlpha = true;
  }
  const spray = new ParticleSystem('waterSpray', 90, scene);
  spray.particleTexture = sprayTex;
  spray.emitter = new Vector3(FORD.x, WY + 0.03, FORD.z);
  spray.minEmitBox = new Vector3(-2.4, 0, -2.4);
  spray.maxEmitBox = new Vector3(2.4, 0.05, 2.4);
  spray.minLifeTime = 0.5; spray.maxLifeTime = 1.1;
  spray.minSize = 0.05; spray.maxSize = 0.16;
  spray.addColorGradient(0, new Color4(0.9, 0.95, 1, 0));
  spray.addColorGradient(0.2, new Color4(0.9, 0.95, 1, 0.7));
  spray.addColorGradient(1, new Color4(0.85, 0.92, 1, 0));
  spray.minEmitPower = 0.5; spray.maxEmitPower = 1.4;
  spray.direction1 = new Vector3(-0.4, 1, -0.4);
  spray.direction2 = new Vector3(0.4, 2, 0.4);
  spray.gravity = new Vector3(0, -3.5, 0);
  spray.blendMode = ParticleSystem.BLENDMODE_STANDARD;
  spray.emitRate = 7;                                 // clapot permanent du gué
  spray.start();

  /** le point est-il dans l'eau ? (pour la gerbe des roues) */
  function isWet(x, z) {
    const dx = x - FORD.x, dz = z - FORD.z;
    const along = dx * nx + dz * nz;
    if (Math.abs(along) > HALF_LEN) return false;
    const sh = fordShape(along / HALF_LEN);
    const across = dx * S.tx + dz * S.tz;
    return Math.abs(across - sh.wob) < sh.half;
  }

  /** la teinte du reflet suit le ciel : ocre au couchant, bleu à midi */
  const skyTint = new Color3(0.32, 0.46, 0.6);

  function update(dt, sunY) {
    rip1.vOffset -= dt * 0.12;                        // le courant descend
    rip1.uOffset += dt * 0.017;
    rip2.vOffset -= dt * 0.21;
    rip2.uOffset -= dt * 0.026;
    if (sunY !== undefined) {
      // l'eau reflète le ciel du moment : sombre la nuit, bleue à midi
      const d = Math.min(1, Math.max(0, (sunY + 0.08) / 0.3));
      skyTint.copyFromFloats(0.03 + d * 0.17, 0.05 + d * 0.26, 0.09 + d * 0.34);
      mat.emissiveColor.copyFrom(skyTint);
      fmat.alpha = 0.16 + d * 0.3;
      rmat.alpha = 0.1 + d * 0.24;
    }
  }

  return { FORD, isWet, update, surf };
}
