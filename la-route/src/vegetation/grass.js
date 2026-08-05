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
import { windClock, sunShared, hazeShared } from './wind.js';
import { Matrix } from '@babylonjs/core/Maths/math.vector.js';
import { addBentCard, cardAcc, accToMesh } from './bentCard.js';
import { groundHeight, roadQuery, ROAD_HALF, GARAGE, FORD, fordShape } from '../terrain/road.js';

/**
 * Dans le lit du ruisseau ? L'herbe n'y pousse pas. FORD était importé ici
 * depuis le début et n'a jamais servi : le tapis se semait donc EN TRAVERS
 * du gué, et les touffes debout sous la nappe translucide faisaient des
 * paquets bleus à bords francs de part et d'autre du courant. La marge
 * évite aussi les brins qui percent la surface au ras de la berge.
 */
function inStream(x, z) {
  const dx = x - FORD.x, dz = z - FORD.z;
  const along = dx * FORD.nx + dz * FORD.nz;
  if (Math.abs(along) > FORD.halfLen) return false;
  const sh = fordShape(along / FORD.halfLen);
  const across = dx * FORD.tx + dz * FORD.tz - sh.wob;
  return Math.abs(across) < sh.half + 0.55;
}

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
    this.transl = opts.transl ?? 1.05;               // le brin s'allume à contre-jour
    this.abax = opts.abax ?? 0;                      // face abaxiale : cartes larges seulement
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
        { name: 'grAbax', size: 1, type: 'float' },
        { name: 'grSun', size: 3, type: 'vec3' },
        { name: 'grAmb', size: 3, type: 'vec3' },
      ],
      vertex: `#ifdef GRASS
uniform float grTime; uniform float grStrength; uniform vec2 grCenter; uniform float grSize;
#endif`,
      fragment: `#ifdef GRASS
uniform float grTransl; uniform float grAbax; uniform vec3 grSun; uniform vec3 grAmb;
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
    ubo.updateFloat('grAbax', this.abax);
    ubo.updateFloat3('grSun', sunShared.x, sunShared.y, sunShared.z);
    ubo.updateFloat3('grAmb', hazeShared.ar, hazeShared.ag, hazeShared.ab);
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
        // La caméra orbite derrière le joueur et traverse le tapis : une
        // touffe à un mètre de l'œil barre la moitié de l'écran d'un aplat
        // vert, et ce sont les captures 1440p qui l'ont rendu criant. On
        // FOND donc le tapis à l'approche de l'œil. La dissolution est
        // TRAMÉE et non un fondu alpha : on est en découpe franche, un
        // fondu imposerait un tri de transparence sur 23 000 instances.
        float grEye = length(vEyePosition.xyz - vPositionW);
        float grFade = smoothstep(0.7, 1.55, grEye);   // bande courte : le moucheté ne doit pas gagner l'image
        float grDith = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
        if (grDith > grFade) discard;
        vec3 grV = normalize(vEyePosition.xyz - vPositionW);
        vec3 grN = normalize(vNormalW);
        // Lobe COURBÉ par la normale (PORTAGE 1.5), même formulation que
        // wind.js. Le dot(V, soleil) pur éteignait net un brin vu de profil ;
        // en courbant le vecteur, une feuille de profil transmet encore.
        // Les cartes du tapis portent une normale VERTICALE : la courbure
        // incline donc le lobe vers le ciel, ce qui est exactement le trajet
        // de la lumière qui traverse une touffe par le dessus.
        vec3 grHs = normalize(normalize(grSun) + grN * 0.6);
        float grBack = clamp(dot(grV, grHs), 0.0, 1.0);
        // la texture du brin est peinte en dégradé pied sombre → pointe
        // claire : sa luminance EST la hauteur le long du brin, et c'est
        // la pointe, fine, qui transmet le mieux la lumière
        float grUp = dot(baseColor.rgb, vec3(0.33, 0.5, 0.17));
        // variance par touffe (PORTAGE 1.5) : le contre-jour n'est pas une
        // nappe égale, chaque touffe transmet différemment
        float grVar = 0.6 + 0.8 * fract(sin(dot(floor(vPositionW.xz * 0.9), vec2(37.719, 61.313))) * 43758.5453);
        color.rgb += vec3(0.78, 0.86, 0.30) * pow(grBack, 2.2)
                   * (0.25 + 1.5 * grUp) * grTransl * baseColor.rgb * 2.2 * grVar;
        // Face abaxiale (PORTAGE 1.5) — réservée aux cartes LARGES : on voit
        // le dessous d'une palme de fougère, mat et plus pâle, jamais celui
        // d'un brin. grAbax vaut 0 sur les strates de brins, et le terme
        // disparaît alors complètement.
        if (grAbax > 0.0 && !gl_FrontFacing) {
          color.rgb = mix(color.rgb,
            vec3(dot(color.rgb, vec3(0.35, 0.5, 0.15))) * vec3(0.84, 0.96, 0.8), grAbax);
        }
        // plancher d'éclairage : la carte a une normale VERTICALE, donc au
        // soleil rasant N·L tombe à zéro et le brin devient noir. Une herbe
        // réelle capte toujours un peu de ciel. Le plancher SUIT l'ambiante
        // du moment (le même que le décor) — constant, il faisait luire
        // l'herbe en plein milieu de la nuit.
        color.rgb += baseColor.rgb * vDiffuseColor.rgb * grAmb * 1.05;
        // occlusion de contact (PORTAGE 1.4) : le pied du brin est enfoui
        // dans le couvert, la pointe voit le ciel. grUp est déjà la hauteur
        // le long du brin (luminance peinte pied sombre → pointe claire) —
        // une seule multiplication, et le tapis cesse de flotter sur le sol.
        color.rgb *= 0.58 + 0.72 * grUp;
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
  // PAS de mipmaps : le moyennage de l'alpha ferait passer des cartes
  // entières au test de découpe (blocs verts flottants). Le scintillement
  // à distance est assumé — il est même dans l'esprit 32 bits.
  const tex = new DynamicTexture(name, { width: 64, height: 64 }, scene, false);
  const g = tex.getContext();
  g.clearRect(0, 0, 64, 64);
  let s = seed;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < blades; i++) {
    const x0 = 4 + rnd() * 56;                                  // pied du brin
    const bend = (rnd() - 0.5) * 26;                            // courbure
    const top = 6 + rnd() * 22;                                 // hauteur (y bas = pointe)
    const wid = 0.9 + rnd() * 1.5;      // brins fins : vus de près, larges ils font des planches
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


/** fronde SEULE, peinte LE LONG de u (pied à gauche, pointe à droite) :
 * rachis central et paires de folioles décroissantes. Elle habille la carte
 * courbée de la rosette — l'arc n'est plus peint, il est dans la géométrie. */
function frondCardTexture(scene, name, seed) {
  // PAS de mipmaps : même règle que tout le tapis.
  const W = 128, H = 64;
  const tex = new DynamicTexture(name, { width: W, height: H }, scene, false);
  const g = tex.getContext();
  g.clearRect(0, 0, W, H);
  let s = seed;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const mid = H / 2;
  g.strokeStyle = '#1e3a0c'; g.lineWidth = 2.2;
  g.beginPath(); g.moveTo(2, mid); g.lineTo(W - 3, mid); g.stroke();
  const n = 13;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const x = 4 + t * (W - 10);
    const fl = (15 + rnd() * 6) * (1 - t * 0.72);       // foliole, décroît
    const ang = 0.9 - t * 0.25;                          // se couche vers la pointe
    g.fillStyle = t > 0.55 ? '#55801f' : '#2c4a12';
    for (let sg = -1; sg <= 1; sg += 2) {
      g.beginPath();
      g.ellipse(x + Math.cos(ang) * 2, mid + sg * (fl * 0.52 + 1.5),
        fl * 0.62, fl * 0.24, sg * ang * 0.55, 0, 7);
      g.fill();
    }
  }
  tex.update();
  tex.hasAlpha = true;
  tex.updateSamplingMode(1);
  return tex;
}

/**
 * Rosette de fougère : sept frondes en cartes COURBÉES qui partent du pied,
 * montent, s'arquent et retombent — l'arc est dans la géométrie, la découpe
 * en folioles dans l'alpha. C'est l'archétype de la référence : une masse
 * presque horizontale qui ferme le premier plan.
 */
function fernGeometry(scene, name) {
  const acc = cardAcc();
  let s = 23;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const N = 7;
  for (let k = 0; k < N; k++) {
    const yaw = (k / N) * Math.PI * 2 + (rnd() - 0.5) * 0.5;
    const len = 0.62 + rnd() * 0.3;
    const m = Matrix.RotationZ((rnd() - 0.5) * 0.2)
      .multiply(Matrix.RotationX(-(0.52 + rnd() * 0.22)))   // l'attache vise le ciel
      .multiply(Matrix.RotationY(yaw))
      .multiply(Matrix.Translation(0, 0.05, 0));
    addBentCard(acc, m, {
      len, hw: 0.16 + rnd() * 0.05,
      bend: 1.05 + rnd() * 0.35,                            // monte puis retombe
      sag: 0.06, twist: (rnd() - 0.5) * 0.3,
      cup: 0.3, relax: 0.5, roll: 0.08,
      ripple: 0.08, tilt: (rnd() - 0.5) * 0.14,
      asym: 0.05, nick: 0, phase: rnd() * 6.28,
      steps: 3, nu: 2, uvSwap: true,
    });
  }
  return accToMesh(scene, name, acc);
}

/** brins fleuris : tiges vertes surmontées de corolles claires */
function flowerTexture(scene, name, seed) {
  // PAS de mipmaps : le moyennage de l'alpha ferait passer des cartes
  // entières au test de découpe (blocs verts flottants). Le scintillement
  // à distance est assumé — il est même dans l'esprit 32 bits.
  const tex = new DynamicTexture(name, { width: 64, height: 64 }, scene, false);
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
  const N_FERN = opts.ferns ?? 1500;
  const N_BUSH = opts.bushes ?? 240;

  const mk = (name, mesh, color, strength, tex, transl, abax) => {
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
    new GrassPlugin(mat, deformState, { strength, transl, abax });
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
    bladeTexture(scene, 'bladeTex', 26, '#2c4a13', '#7ea23a', 13));
  const tall = tuftGeometry(scene, 'tallTuft', 0.86, 0.3, 4);
  mk('tall', tall, new Color3(1, 1, 1), 1.25,
    bladeTexture(scene, 'tallTex', 34, '#355516', '#93b243', 29));
  const reed = tuftGeometry(scene, 'reedTuft', 1.05, 0.2, 3);
  mk('reed', reed, new Color3(1, 1, 1), 1.5,
    bladeTexture(scene, 'reedTex', 22, '#405219', '#b3ac57', 53));
  const flower = tuftGeometry(scene, 'flowerTuft', 0.42, 0.26, 3);
  mk('flower', flower, new Color3(1, 1, 1), 1.1,
    flowerTexture(scene, 'flowerTex', 91));
  // la fougère est LARGE et basse : c'est elle qui fait la masse sombre du
  // premier plan, pas une touffe d'herbe de plus
  const fern = fernGeometry(scene, 'fernTuft');
  // translucidité modérée : la palme est LARGE, au réglage des brins fins
  // elle s'embrasait toute entière et flottait comme un néon vert
  // et c'est la SEULE strate assez large pour que sa face abaxiale veuille
  // dire quelque chose : on voit le dessous d'une palme, jamais celui d'un brin
  mk('fern', fern, new Color3(1, 1, 1), 0.4,
    frondCardTexture(scene, 'fernTex', 71), 0.5, 0.3);
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

  /**
   * Écrit une matrice TRS à plat, colonne-major (PORTAGE 1.3 : stand + bulk).
   *
   * `conform` est la part de la pente que la plante épouse : 0 = toujours à
   * l'aplomb, 1 = perpendiculaire au sol. Une touffe d'herbe pousse vers la
   * lumière mais suit largement son talus (0,9) ; un buisson ligneux se
   * redresse (0,5). Sans ce terme, tout le tapis d'un remblai est planté à la
   * verticale et le talus lit comme une brosse — c'est le premier symptôme que
   * la référence n'a pas.
   *
   * La pente vient de deux différences avant sur `groundHeight` (deux
   * échantillons de plus par instance, pas quatre : on cherche une inclinaison,
   * pas une normale exacte). Elle se mesure depuis `gy`, la VRAIE hauteur du
   * sol — pas depuis `y`, qui porte déjà l'enfoncement de la plante. L'écart
   * paraît minime, mais le buisson s'enfonce de 0,35 × son échelle : mesurée
   * depuis `y`, sa pente serait fausse de trente degrés, tous les buissons
   * penchant dans la même direction.
   *
   * `bulk` : sx et sz sont tirés indépendamment, donc la touffe cesse d'avoir
   * une empreinte circulaire — deux voisines de même graine n'ont plus le même
   * rapport largeur/profondeur.
   */
  const D = 0.6;                                    // portée des différences
  /** ±15 % sur un axe horizontal — le « bulk » du PORTAGE 1.3 */
  const BULK = (rnd) => 0.85 + rnd() * 0.3;
  function writeM(buf, i, x, y, z, sx, sy, ry, conform = 0, sz = sx, gy = y) {
    const o = i * 16;
    let ux = 0, uy = 1, uz = 0;
    if (conform > 0) {
      // pente locale, ramenée à la fraction voulue
      ux = -((groundHeight(x + D, z) - gy) / D) * conform;
      uz = -((groundHeight(x, z + D) - gy) / D) * conform;
      const inv = 1 / Math.hypot(ux, 1, uz);
      ux *= inv; uy = inv; uz *= inv;
    }
    // axe X : le cap voulu, redressé perpendiculairement à l'axe Y conformé
    const cx = Math.cos(ry), cz = -Math.sin(ry);
    const d = cx * ux + cz * uz;
    let ax = cx - ux * d, ay = -uy * d, az = cz - uz * d;
    const ai = 1 / Math.hypot(ax, ay, az);
    ax *= ai; ay *= ai; az *= ai;
    // axe Z = X × Y (main gauche) — à plat, on retrouve exactement (sin,0,cos)
    const bx = ay * uz - az * uy, by = az * ux - ax * uz, bz = ax * uy - ay * ux;
    buf[o] = ax * sx; buf[o + 1] = ay * sx; buf[o + 2] = az * sx; buf[o + 3] = 0;
    buf[o + 4] = ux * sy; buf[o + 5] = uy * sy; buf[o + 6] = uz * sy; buf[o + 7] = 0;
    buf[o + 8] = bx * sz; buf[o + 9] = by * sz; buf[o + 10] = bz * sz; buf[o + 11] = 0;
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
      if (inStream(x, z)) continue;
      // plus rase sur le talus, plus haute dans le sous-bois
      const lush = 0.6 + Math.min(1, rq.dist / 14) * 0.55;
      const s = (0.7 + rnd() * 0.6) * lush;
      const gy = groundHeight(x, z);
      writeM(bufG, gi++, x, gy - 0.04, z, s * BULK(rnd), s * (0.75 + rnd() * 0.7),
        rnd() * 3.14, 0.9, s * BULK(rnd), gy);
    }
    for (; gi < N_GRASS; gi++) writeM(bufG, gi, 0, -999, 0, 0, 0, 0);

    for (let i = 0; i < N_FERN * 4 && fi < N_FERN; i++) {
      const a = rnd() * Math.PI * 2, r = 4 + Math.sqrt(rnd()) * (R - 4);
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      if (roadQuery(x, z).dist < ROAD_HALF + 2.2) continue;      // la fougère fuit la route
      if (inStream(x, z)) continue;
      const s = 0.7 + rnd() * 0.75;
      const gy = groundHeight(x, z);
      writeM(bufF, fi++, x, gy - 0.05, z, s * BULK(rnd), s * (0.8 + rnd() * 0.5),
        rnd() * 3.14, 0.7, s * BULK(rnd), gy);
    }
    for (; fi < N_FERN; fi++) writeM(bufF, fi, 0, -999, 0, 0, 0, 0);

    // hautes tiges : en touffes, jamais uniformes — elles font la prairie
    let ti = 0, ri = 0, wi = 0;
    for (let i = 0; i < N_TALL * 3 && ti < N_TALL; i++) {
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * R;
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      const rq = roadQuery(x, z);
      if (rq.dist < ROAD_HALF + 1.6) continue;
      if (inStream(x, z)) continue;
      const s = 0.62 + rnd() * 0.75;
      const gy = groundHeight(x, z);
      writeM(bufT, ti++, x, gy - 0.05, z, s * BULK(rnd), s * (0.75 + rnd() * 0.6),
        rnd() * 3.14, 0.85, s * BULK(rnd), gy);
    }
    for (; ti < N_TALL; ti++) writeM(bufT, ti, 0, -999, 0, 0, 0, 0);
    // roseaux : seulement dans les creux, là où l'eau stagnerait
    for (let i = 0; i < N_REED * 8 && ri < N_REED; i++) {
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * R;
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      const rq = roadQuery(x, z);
      if (rq.dist < ROAD_HALF + 3) continue;
      if (inStream(x, z)) continue;                              // le roseau borde l'eau, il n'y pousse pas
      const gy = groundHeight(x, z);
      // un creux local : le sol descend par rapport à ses voisins
      const low = (groundHeight(x + 3, z) + groundHeight(x - 3, z)
        + groundHeight(x, z + 3) + groundHeight(x, z - 3)) / 4 - gy;
      if (low < 0.12) continue;
      const s = 0.7 + rnd() * 0.6;
      // le roseau est raide et pousse dans un creux : il se redresse plus que
      // l'herbe, sinon il se couche vers le fond de la cuvette
      writeM(bufR, ri++, x, gy - 0.05, z, s * BULK(rnd), s * (0.8 + rnd() * 0.55),
        rnd() * 3.14, 0.45, s * BULK(rnd), gy);
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
        if (inStream(x, z)) continue;
        const s = 0.7 + rnd() * 0.6;
        const gy = groundHeight(x, z);
        writeM(bufW, wi++, x, gy - 0.03, z, s * BULK(rnd), s,
          rnd() * 3.14, 0.8, s * BULK(rnd), gy);
      }
    }
    for (; wi < N_FLOW; wi++) writeM(bufW, wi, 0, -999, 0, 0, 0, 0);

    for (let i = 0; i < N_BUSH * 6 && bi < N_BUSH; i++) {
      const a = rnd() * Math.PI * 2, r = 6 + Math.sqrt(rnd()) * (R - 6);
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      if (roadQuery(x, z).dist < ROAD_HALF + 3.5) continue;
      if (inStream(x, z)) continue;
      const s = 0.55 + rnd() * 0.8;
      const gy = groundHeight(x, z);
      // ligneux : il se redresse (PORTAGE 1.3 donne 0,5 au buisson)
      writeM(bufB, bi++, x, gy - 0.35 * s, z, s * BULK(rnd), s * (0.6 + rnd() * 0.35),
        rnd() * 3.14, 0.5, s * BULK(rnd), gy);
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
