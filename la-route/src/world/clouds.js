/**
 * Les nuages — des CARTES en billboard, comme les faisaient les consoles 32
 * bits : une trentaine de quads dispersés sur un anneau très large autour du
 * joueur, chacun portant un cumulus peint (grappe de disques éclairés par le
 * haut, ventre gris-bleu). Ils tournent toujours face à la caméra, dérivent
 * avec le vent et suivent le joueur en gardant leur parallaxe.
 *
 * Pourquoi pas un dôme texturé : le ciel en occupe déjà un, et à 700 m de
 * distance la précision du depth buffer ne sépare plus les deux surfaces —
 * les nuages disparaissaient derrière le ciel. Des cartes bien plus proches
 * (250 à 400 m) n'ont pas ce problème.
 */
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { MaterialPluginBase } from '@babylonjs/core/Materials/materialPluginBase.js';
import { sunShared } from '../vegetation/wind.js';
import '@babylonjs/core/Meshes/thinInstanceMesh.js';

/**
 * Éclairage de nuage en impostor : le volume est SIMULÉ dans le fragment au
 * lieu d'être peint une fois pour toutes. On ré-échantillonne l'alpha du
 * cumulus décalé VERS LE SOLEIL, en trois pas de plus en plus longs : la
 * somme approxime l'épaisseur de matière traversée par la lumière avant
 * d'atteindre ce fragment. Beaucoup de matière → ventre sombre ; peu →
 * bord allumé. C'est la recette classique des nuages en cartes, et elle
 * donne ce que la silhouette peinte ne pouvait pas : l'ombrage TOURNE avec
 * le soleil au fil de la journée, et le bord tourné vers lui s'embrase au
 * couchant sans qu'on ait à repeindre quoi que ce soit.
 * Aucun sampler à déclarer : on réutilise celui de l'opacité, déjà lié.
 */
class CloudPlugin extends MaterialPluginBase {
  constructor(material) {
    super(material, 'Cloud', 220, { CLOUD: false });
    this.sunU = 0; this.sunV = 1;
    this.dens = 2.6;
    this.shade = [0.42, 0.47, 0.60];
    this.rim = [0.3, 0.26, 0.2];
    this._enable(true);
  }
  getClassName() { return 'CloudPlugin'; }
  prepareDefines(defines) { defines.CLOUD = true; }
  getUniforms() {
    return {
      ubo: [
        { name: 'clSunUV', size: 2, type: 'vec2' },
        { name: 'clDens', size: 1, type: 'float' },
        { name: 'clShade', size: 3, type: 'vec3' },
        { name: 'clRim', size: 3, type: 'vec3' },
      ],
      fragment: `#ifdef CLOUD
uniform vec2 clSunUV; uniform float clDens; uniform vec3 clShade; uniform vec3 clRim;
#endif`,
    };
  }
  bindForSubMesh(ubo) {
    ubo.updateFloat2('clSunUV', this.sunU, this.sunV);
    ubo.updateFloat('clDens', this.dens);
    ubo.updateFloat3('clShade', this.shade[0], this.shade[1], this.shade[2]);
    ubo.updateFloat3('clRim', this.rim[0], this.rim[1], this.rim[2]);
  }
  getCustomCode(shaderType) {
    if (shaderType !== 'fragment') return null;
    return {
      CUSTOM_FRAGMENT_BEFORE_FRAGCOLOR: `
#if defined(CLOUD) && defined(OPACITY)
        vec2 clStep = clSunUV * 0.05;
        float clT = texture2D(opacitySampler, vOpacityUV + clStep).a * 0.5
                  + texture2D(opacitySampler, vOpacityUV + clStep * 2.3).a * 0.32
                  + texture2D(opacitySampler, vOpacityUV + clStep * 4.4).a * 0.18;
        float clLit = exp(-clT * clDens);
        color.rgb *= mix(clShade, vec3(1.0), clLit);
        color.rgb += clRim * pow(clLit, 3.0);
#endif
`,
    };
  }
}

const TW = 256, TH = 128;

/** un cumulus peint : grappe de disques, sommet blanc, ventre gris-bleu */
function cumulusTexture(scene, name, seed) {
  const tex = new DynamicTexture(name, { width: TW, height: TH }, scene, false);
  const g = tex.getContext();
  g.clearRect(0, 0, TW, TH);
  let s = seed;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const puffs = 16 + Math.floor(rnd() * 12);
  for (let i = 0; i < puffs; i++) {
    const t = i / (puffs - 1) - 0.5;
    // silhouette : base plate en bas, bosses arrondies vers le haut
    const r = (16 + rnd() * 26) * (1 - Math.abs(t) * 0.6);
    const px = TW * 0.5 + t * TW * 0.78 + (rnd() - 0.5) * 14;
    const py = TH * 0.72 - Math.max(0, 1 - Math.abs(t) * 2.0) * r * 0.85
      - rnd() * 10;
    // le dégradé est décalé vers le haut : le soleil vient d'en haut, le
    // ventre reste dans l'ombre du nuage — c'est ce qui donne le volume
    const gr = g.createRadialGradient(px, py - r * 0.45, r * 0.1, px, py, r);
    gr.addColorStop(0, 'rgba(255,255,255,0.98)');
    gr.addColorStop(0.5, 'rgba(240,243,250,0.9)');
    gr.addColorStop(0.82, 'rgba(186,198,216,0.55)');
    gr.addColorStop(1, 'rgba(164,178,200,0)');
    g.fillStyle = gr;
    g.beginPath(); g.arc(px, py, r, 0, 7); g.fill();
  }
  tex.update();
  tex.hasAlpha = true;
  return tex;
}

const N = 26;

export function buildClouds(scene) {
  // trois silhouettes différentes, réparties sur les cartes
  const texes = [
    cumulusTexture(scene, 'cumulus0', 17),
    cumulusTexture(scene, 'cumulus1', 91),
    cumulusTexture(scene, 'cumulus2', 233),
  ];
  const banks = [];
  const state = [];                                  // {ang, dist, y, w, h, kind}
  let s = 7;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < N; i++) {
    state.push({
      ang: rnd() * Math.PI * 2,
      dist: 420 + rnd() * 380,
      y: 150 + rnd() * 180,
      w: 190 + rnd() * 260,
      kind: i % 3,
      drift: 0.0032 + rnd() * 0.0026,
    });
  }

  const mats = [];
  for (let k = 0; k < 3; k++) {
    const plane = MeshBuilder.CreatePlane('cloudBank' + k, { width: 1, height: 1 }, scene);
    const mat = new StandardMaterial('cloudBankM' + k, scene);
    mat.emissiveTexture = texes[k];
    mat.opacityTexture = texes[k];
    mat.diffuseColor = new Color3(0, 0, 0);
    mat.specularColor = new Color3(0, 0, 0);
    mat.disableLighting = true;
    mat.fogEnabled = false;
    mat.backFaceCulling = false;
    mat.emissiveColor = new Color3(1, 1, 1);
    plane.material = mat;
    plane.applyFog = false;
    plane.isPickable = false;
    plane.alwaysSelectAsActiveMesh = true;           // suit le joueur : pas de culling
    plane.alphaIndex = 5 + k;                        // derrière tout le reste
    plane.receiveShadows = false;
    mat.cloudLight = new CloudPlugin(mat);           // le volume, pas la peinture
    const count = state.filter((c) => c.kind === k).length;
    banks.push({ plane, mat, buf: new Float32Array(count * 16), idx: [] });
    mats.push(mat);
  }
  for (let i = 0; i < N; i++) banks[state[i].kind].idx.push(i);
  for (const b of banks) b.plane.thinInstanceSetBuffer('matrix', b.buf, 16, false);

  const q = new Quaternion(), sc = new Vector3(), tr = new Vector3(), m = new Matrix();
  const tint = new Color3(1, 1, 1);

  /**
   * @param sunY   hauteur du soleil (−1 … 1) : teinte et luminosité
   * @param cloudy couverture 0 … 1 : opacité et nombre visible
   * @param camX/camZ  position du joueur
   * @param camYaw     cap de la caméra (les cartes lui font face)
   */
  function update(dt, sunY, cloudy, camX, camZ, camYaw) {
    const day = Math.min(1, Math.max(0, (sunY + 0.1) / 0.32));
    const high = Math.min(1, Math.max(0, (sunY - 0.15) / 0.42));
    // bleu d'encre la nuit → ocre au ras → blanc franc à midi
    tint.r = 0.17 + day * (1.0 - 0.17);
    tint.g = 0.2 + day * (0.74 + high * 0.26 - 0.2);
    tint.b = 0.34 + day * (0.56 + high * 0.44 - 0.34);
    const vis = 0.55 + 0.45 * cloudy;
    // les cartes font toujours face à la caméra (billboard sur l'axe Y)
    const yaw = camYaw + Math.PI;
    Quaternion.RotationYawPitchRollToRef(yaw, 0, 0, q);
    // direction du soleil PROJETÉE dans l'espace UV de la carte : le +x local
    // d'un billboard de lacet `yaw` pointe vers (cos yaw, 0, −sin yaw), et le
    // +v est simplement la verticale. sunShared va DU soleil vers la scène,
    // on la retourne pour viser la lumière.
    const sx = -sunShared.x * Math.cos(yaw) + sunShared.z * Math.sin(yaw);
    const sy = -sunShared.y;
    const sl = Math.hypot(sx, sy) || 1;
    // le ventre s'assombrit quand le soleil est haut, le nuage s'embrase au ras
    const graze = 1 - Math.min(1, Math.max(0, (sunY - 0.02) / 0.5));

    for (const b of banks) {
      b.mat.emissiveColor.copyFrom(tint);
      b.mat.alpha = vis;
      const cl = b.mat.cloudLight;
      cl.sunU = sx / sl; cl.sunV = sy / sl;
      cl.dens = 2.2 + 1.6 * day;
      cl.shade[0] = 0.40 + 0.16 * graze;
      cl.shade[1] = 0.45 + 0.10 * graze;
      cl.shade[2] = 0.60 - 0.06 * graze;
      cl.rim[0] = (0.10 + 0.42 * graze) * day;
      cl.rim[1] = (0.09 + 0.26 * graze) * day;
      cl.rim[2] = (0.10 + 0.10 * graze) * day;
      for (let j = 0; j < b.idx.length; j++) {
        const c = state[b.idx[j]];
        c.ang += c.drift * dt;                       // la nappe tourne au vent
        sc.set(c.w, c.w * 0.5, 1);
        tr.set(camX + Math.cos(c.ang) * c.dist, c.y, camZ + Math.sin(c.ang) * c.dist);
        Matrix.ComposeToRef(sc, q, tr, m);
        m.copyToArray(b.buf, j * 16);
      }
      b.plane.thinInstanceBufferUpdated('matrix');
    }
  }

  return { update, banks };
}
