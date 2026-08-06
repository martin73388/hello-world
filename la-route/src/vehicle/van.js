/**
 * Le van (M4) — le hero asset. Face avant plate (esprit Estafette), deux tons
 * patinés, lettrage GARAGE MODERNE à l'arrière, chrome, vitres avec intérieur
 * visible, sapin désodorisant à ressort, galerie + jerrican, bavettes, feux.
 * Suspension par roue : le sol est sondé aux 4 coins, la caisse suit en
 * ressort-amortisseur avec roulis/tangage et transfert de masse ; les roues
 * braquent et tournent au rayon correct (jamais de glissement visuel).
 * Repère local : +z avant, +x droite (main gauche Babylon).
 */
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { SpotLight } from '@babylonjs/core/Lights/spotLight.js';

const WHEEL_R = 0.37, TRACK = 0.85, WHEELBASE = 3.2, CLEAR = 0.42;

/**
 * Les cotes de la BAIE latérale, exportées : la carrosserie perce le trou,
 * l'aménagement y fait coulisser la portière. Deux jeux de constantes auraient
 * fini par diverger d'un centimètre, et un centimètre ici c'est soit un jour
 * dans la tôle, soit une porte qui ne ferme plus.
 */
export const BAY_Z0 = -0.95, BAY_Z1 = 0.35;

function paintTexture(scene) {
  const tex = new DynamicTexture('vanPaint', 512, scene, true);
  const g = tex.getContext();
  let seed = 41;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  // Tôle peinte NEUTRE, sans bande de couleur : la livrée deux tons se fait par
  // la teinte du matériau, pas par la texture. Peinte ici, elle se répétait sur
  // chaque caisson — CreateBox plaque l'image entière sur chaque face, si bien
  // qu'en remontant le flanc on lisait rouge, crème, rouge, crème, et que les
  // faces avant et arrière l'étiraient autrement que les flancs. Le van avait
  // l'air d'être deux véhicules superposés.
  g.fillStyle = '#efe9dd'; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 260; i++) {                               // usure, poussière
    const y = rnd() * 512;
    g.fillStyle = 'rgba(96,88,74,.20)';
    g.fillRect(rnd() * 512, y, 2 + rnd() * 9, 1 + rnd() * 3);
  }
  for (const x of [96, 236, 380]) {                             // joints de panneaux
    g.fillStyle = 'rgba(30,18,12,.55)'; g.fillRect(x, 0, 2, 512);
  }
  for (let i = 0; i < 26; i++) {                                // rouille au bas de caisse
    const x = rnd() * 512, y = 440 + rnd() * 66;
    g.fillStyle = 'rgba(74,34,16,.5)';
    g.beginPath(); g.arc(x, y, 2 + rnd() * 6, 0, 7); g.fill();
  }
  tex.update();
  return tex;
}

function rearTexture(scene) {
  const tex = new DynamicTexture('vanRear', { width: 512, height: 256 }, scene, true);
  const g = tex.getContext();
  g.clearRect(0, 0, 512, 256);
  g.font = '700 64px Georgia, serif'; g.textAlign = 'center';
  g.fillStyle = 'rgba(30,16,10,.55)';                           // ombre portée peinte
  g.fillText('GARAGE', 259, 108);
  g.fillText('MODERNE', 259, 188);
  g.fillStyle = 'rgba(238,228,200,.92)';                        // crème signalétique
  g.fillText('GARAGE', 256, 105);
  g.fillText('MODERNE', 256, 185);
  tex.update();
  tex.hasAlpha = true;
  return tex;
}

export function buildVan(scene, shadows, ground) {
  const root = new TransformNode('vanRoot', scene);
  const body = new TransformNode('vanBody', scene);
  body.parent = root;

  /* ---- matériaux ---- */
  // Une seule tôle, deux teintes : la livrée d'un camping-car se lit en bandes
  // horizontales franches, et c'est la TEINTE du matériau qui les porte. La
  // texture reste neutre et partagée, donc le grain et les joints de panneaux
  // sont continus d'un caisson à l'autre.
  const paintTex = paintTexture(scene);
  const mkPaint = (name, r, g, b) => {
    const m = new StandardMaterial(name, scene);
    m.diffuseTexture = paintTex;
    m.diffuseColor = new Color3(r, g, b);
    m.specularColor = new Color3(0.32, 0.3, 0.26);              // vernis fatigué
    m.specularPower = 42;
    return m;
  };
  const paintLo = mkPaint('vanPaintLo', 0.54, 0.27, 0.19);      // rouge brique
  const paintHi = mkPaint('vanPaintHi', 0.85, 0.81, 0.71);      // crème patinée
  const chrome = new StandardMaterial('vanChrome', scene);
  chrome.diffuseColor = new Color3(0.38, 0.4, 0.44);
  chrome.specularColor = new Color3(0.95, 0.95, 0.98);
  chrome.specularPower = 96;
  const dark = new StandardMaterial('vanDark', scene);
  dark.diffuseColor = new Color3(0.09, 0.09, 0.1);
  dark.specularColor = new Color3(0.05, 0.05, 0.05);
  const glass = new StandardMaterial('vanGlass', scene);
  glass.diffuseColor = new Color3(0.3, 0.42, 0.46);
  glass.specularColor = new Color3(1, 1, 1);
  glass.specularPower = 128;
  glass.alpha = 0.38;
  const inn = new StandardMaterial('vanInn', scene);
  inn.diffuseColor = new Color3(0.3, 0.24, 0.18);
  inn.specularColor = new Color3(0.03, 0.03, 0.03);
  const lampOn = new StandardMaterial('vanLamp', scene);
  lampOn.emissiveColor = new Color3(0.9, 0.82, 0.55);
  lampOn.diffuseColor = new Color3(0.4, 0.36, 0.2);
  const tail = new StandardMaterial('vanTail', scene);
  tail.emissiveColor = new Color3(0.45, 0.06, 0.04);
  tail.diffuseColor = new Color3(0.3, 0.05, 0.04);

  const meshes = [];
  const box = (name, w, h, d, x, y, z, mat) => {
    const m = MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, scene);
    m.position.set(x, y, z); m.material = mat; m.parent = body; meshes.push(m);
    return m;
  };

  /* ---- caisse ---- */
  // La caisse est faite de trois caissons empilés, et la peinture est une
  // livrée DEUX TONS : crème en haut, jonc chromé, rouge brique en bas. Or
  // CreateBox plaque la texture entière sur CHAQUE face — chaque caisson
  // recevait donc son propre exemplaire de la livrée. En remontant le flanc on
  // lisait rouge, crème, rouge, crème : la ligne de séparation apparaissait
  // deux fois, aux mauvais endroits, et les faces avant et arrière l'étiraient
  // autrement que les flancs. Le van avait l'air d'être deux véhicules
  // superposés.
  //
  // La livrée vient donc de la TEINTE des matériaux (paintLo / paintHi), pas de
  // la texture, qui ne porte plus que la tôle. Le grain et les joints de
  // panneaux restent continus d'un caisson à l'autre puisqu'elle est partagée,
  // et le jonc chromé matérialise la ligne de séparation à la bonne hauteur.
  const vLower = box('vLower', 2.0, 1.02, 5.2, 0, 1.04, 0, paintLo);
  const vUpper = box('vUpper', 1.96, 0.95, 5.2, 0, 2.02, 0, paintHi);
  box('vRoof', 1.84, 0.1, 5.02, 0, 2.54, 0, paintHi);

  /**
   * Les caissons de caisse sont des boîtes PLEINES, et la cellule habitable les
   * traverse : elle va de 0,52 à 2,37, quand vLower occupe 0,53→1,55 et vUpper
   * 1,545→2,495. Vues de l'intérieur, la plupart de leurs faces sont éliminées
   * au dos — mais pas toutes. Debout dans le van, l'œil est à 2,1 m, donc
   * AU-DESSUS du dessus de vLower : cette face-là est vue de face et barre le
   * salon d'un plancher fantôme à hauteur de hanche. Symétriquement, le dessous
   * de vUpper pose un faux plafond au même endroit. Le joueur les a vus tout de
   * suite : « il y a un sol en trop dans le van, il coupe la zone en 2 ».
   *
   * On retire donc ces deux faces. Elles ne manquent nulle part ailleurs : le
   * dessus de vLower est couvert par vUpper, le dessous de vUpper par vLower, et
   * le jonc chromé habille la jonction vue du dehors.
   *
   * On sélectionne par la NORMALE plutôt que par un indice de face : l'ordre des
   * faces d'un CreateBox est une convention interne, et parier sur une
   * convention a déjà coûté cher sur ce véhicule.
   */
  const dropFace = (m, nx, ny, nz) => {
    const nrm = m.getVerticesData('normal');
    const idx = m.getIndices();
    const keep = [];
    for (let i = 0; i < idx.length; i += 3) {
      const a = idx[i] * 3;
      if (nrm[a] * nx + nrm[a + 1] * ny + nrm[a + 2] * nz < 0.9) {
        keep.push(idx[i], idx[i + 1], idx[i + 2]);
      }
    }
    m.setIndices(keep);
  };
  dropFace(vLower, 0, 1, 0);            // le plancher fantôme à 1,55
  dropFace(vUpper, 0, -1, 0);           // le plafond fantôme au même plan

  /* ---- LA BAIE : une vraie ouverture dans le flanc gauche ----
   * La portière coulissait déjà, mais derrière elle il n'y avait RIEN à
   * traverser : la caisse est une boîte pleine, et on ouvrait la porte sur de
   * la tôle. Il faut donc percer le flanc.
   *
   * On retire la face -x des deux caissons, puis on remonte le flanc autour du
   * trou. Les deux caissons n'ayant pas la même largeur (1,00 en bas, 0,98 en
   * haut), chaque panneau est posé au plan de SON caisson : le décrochement
   * reste celui de la carrosserie d'origine.
   *
   * La baie va du plancher (0,53) au linteau (2,30), soit 1,77 m de haut sur
   * 1,30 m de large — les cotes de la portière, qui la couvre exactement quand
   * elle est fermée. */
  const BZ0 = BAY_Z0, BZ1 = BAY_Z1, BTOP = 2.30, LT = 0.02;
  dropFace(vLower, -1, 0, 0);
  dropFace(vUpper, -1, 0, 0);
  // bas de caisse, de part et d'autre de la baie
  box('vFlkLoR', LT, 1.02, BZ0 + 2.6, -1.0 + LT / 2, 1.04, (-2.6 + BZ0) / 2, paintLo);
  box('vFlkLoF', LT, 1.02, 2.6 - BZ1, -1.0 + LT / 2, 1.04, (BZ1 + 2.6) / 2, paintLo);
  // haut de caisse, idem, plus le linteau au-dessus de l'ouverture
  box('vFlkHiR', LT, 0.95, BZ0 + 2.6, -0.98 + LT / 2, 2.02, (-2.6 + BZ0) / 2, paintHi);
  box('vFlkHiF', LT, 0.95, 2.6 - BZ1, -0.98 + LT / 2, 2.02, (BZ1 + 2.6) / 2, paintHi);
  box('vFlkHiT', LT, 2.495 - BTOP, BZ1 - BZ0, -0.98 + LT / 2,
    (BTOP + 2.495) / 2, (BZ0 + BZ1) / 2, paintHi);
  // montants et seuil : la baie a un encadrement, sinon la tranche de la tôle
  // se lit comme une découpe au cutter
  box('vBaieMr', 0.05, BTOP - 0.53, 0.05, -1.01, (0.53 + BTOP) / 2, BZ0 + 0.025, chrome);
  box('vBaieMf', 0.05, BTOP - 0.53, 0.05, -1.01, (0.53 + BTOP) / 2, BZ1 - 0.025, chrome);
  box('vBaieSeuil', 0.06, 0.05, BZ1 - BZ0, -1.01, 0.555, (BZ0 + BZ1) / 2, chrome);
  // Jonc chromé à la jonction des deux teintes. Il n'est pas décoratif : les
  // deux caissons ont la MÊME profondeur et le même centre en z, donc leurs
  // faces avant et arrière sont rigoureusement coplanaires et se disputaient le
  // pixel. Le jonc déborde de deux centimètres tout autour et couvre la couture.
  box('vTrim', 2.04, 0.07, 5.24, 0, 1.55, 0, chrome);
  box('vBumpF', 2.06, 0.17, 0.14, 0, 0.62, 2.66, chrome);
  box('vBumpR', 2.06, 0.17, 0.14, 0, 0.62, -2.66, chrome);
  // vitres : pare-brise, portes cabine, flanc arrière, portes arrière
  const ws = box('vWs', 1.68, 0.62, 0.02, 0, 2.12, 2.615, glass);
  ws.rotation.x = -0.1;
  box('vWinL', 0.02, 0.5, 0.78, -0.992, 2.1, 1.62, glass);
  box('vWinR', 0.02, 0.5, 0.78, 0.992, 2.1, 1.62, glass);
  // Pas de custode à gauche : l'emplacement est occupé par la BAIE
  // COULISSANTE. La vitre qui s'y trouvait appartenait à la caisse et non à la
  // portière — donc elle ne coulissait pas avec elle : portière fermée elle
  // doublait la vitre de portière (deux plans alpha à 13 mm, le flanc gauche
  // sortait plus sombre que le droit), et portière ouverte elle restait
  // suspendue en travers de l'ouverture, un mètre de verre en plein passage.
  // La portière a sa propre vitre, viPorteVitre.
  box('vWinR2', 0.02, 0.44, 1.0, 0.992, 2.08, -0.4, glass);
  box('vWinB', 1.3, 0.4, 0.02, 0, 2.12, -2.615, glass);
  // lettrage arrière
  // face avant d'un plan Babylon = -z : à l'arrière, elle regarde déjà dehors
  const rp = MeshBuilder.CreatePlane('vSign', { width: 1.5, height: 0.75 }, scene);
  rp.position.set(0, 1.45, -2.625);
  const rm = new StandardMaterial('vSignM', scene);
  rm.diffuseTexture = rearTexture(scene);
  rm.diffuseTexture.hasAlpha = true; rm.useAlphaFromDiffuseTexture = true;
  rm.specularColor = new Color3(0, 0, 0);
  rp.material = rm; rp.parent = body; meshes.push(rp);
  // phares, feux, rétros, bavettes
  box('vHlL', 0.26, 0.26, 0.06, -0.62, 1.42, 2.62, lampOn);
  box('vHlR', 0.26, 0.26, 0.06, 0.62, 1.42, 2.62, lampOn);
  box('vTlL', 0.14, 0.3, 0.05, -0.85, 1.5, -2.62, tail);
  box('vTlR', 0.14, 0.3, 0.05, 0.85, 1.5, -2.62, tail);
  box('vMirL', 0.05, 0.2, 0.14, -1.1, 2.06, 2.35, chrome);
  box('vMirR', 0.05, 0.2, 0.14, 1.1, 2.06, 2.35, chrome);
  box('vFlapFL', 0.26, 0.3, 0.03, -TRACK, 0.42, WHEELBASE / 2 - 0.48, dark);
  box('vFlapFR', 0.26, 0.3, 0.03, TRACK, 0.42, WHEELBASE / 2 - 0.48, dark);
  box('vFlapRL', 0.26, 0.3, 0.03, -TRACK, 0.42, -WHEELBASE / 2 - 0.48, dark);
  box('vFlapRR', 0.26, 0.3, 0.03, TRACK, 0.42, -WHEELBASE / 2 - 0.48, dark);
  // galerie + jerrican sanglé
  for (const [x, z] of [[-0.75, 1.9], [0.75, 1.9], [-0.75, -1.9], [0.75, -1.9]]) {
    box('vRl' + x + z, 0.06, 0.12, 0.06, x, 2.64, z, dark);
  }
  box('vRailL', 0.06, 0.06, 4.0, -0.75, 2.72, 0, chrome);
  box('vRailR', 0.06, 0.06, 4.0, 0.75, 2.72, 0, chrome);
  box('vCross1', 1.56, 0.05, 0.06, 0, 2.72, 1.1, chrome);
  box('vCross2', 1.56, 0.05, 0.06, 0, 2.72, -1.1, chrome);
  // jerrican COUCHÉ sur la galerie : debout, son sommet (3,63 m au sol)
  // ne passait pas l'ouverture de la porte du garage (3,5 m)
  const jc = box('vJerry', 0.42, 0.2, 0.46, 0.3, 2.85, -1.1, new StandardMaterial('vJerryM', scene));
  jc.material.diffuseColor = new Color3(0.18, 0.26, 0.16);
  jc.material.specularColor = new Color3(0.08, 0.08, 0.08);
  box('vStrap', 0.44, 0.03, 0.5, 0.3, 2.96, -1.1, dark);
  /* ---- intérieur visible ---- */
  box('vDash', 1.8, 0.15, 0.5, 0, 1.72, 2.28, inn);
  box('vSeatL', 0.55, 0.14, 0.55, -0.52, 1.32, 1.7, inn);
  box('vSeatLb', 0.55, 0.6, 0.13, -0.52, 1.66, 1.44, inn);
  box('vSeatR', 0.55, 0.14, 0.55, 0.52, 1.32, 1.7, inn);
  box('vSeatRb', 0.55, 0.6, 0.13, 0.52, 1.66, 1.44, inn);
  // vBed et vKitch ont été RETIRÉS : c'étaient les silhouettes que van.js
  // posait à l'époque où la cellule n'était qu'un décor vu par les vitres.
  // Depuis que vanInterior.js meuble pour de vrai, elles traversaient le
  // mobilier — le témoin de couchette dépassait de 23 cm au-dessus du matelas,
  // celui de kitchenette de 42 cm au-dessus du plan de travail, à travers
  // l'évier, l'étagère et les tranches des livres. Tout ça dans l'axe de la
  // baie coulissante, donc vu en permanence. La cabine, elle, garde ses
  // sièges et son tablier : vanInterior ne modélise rien en avant de la
  // cloison.
  const wheelT = MeshBuilder.CreateTorus('vWheelT', { diameter: 0.4, thickness: 0.045, tessellation: 18 }, scene);
  wheelT.position.set(-0.52, 1.78, 2.12); wheelT.rotation.x = Math.PI / 2 - 0.5;
  wheelT.material = dark; wheelT.parent = body; meshes.push(wheelT);
  /* ---- phares : vraies SpotLights + cônes de brume (interaction 1) ---- */
  const beams = [];
  const coneMat = new StandardMaterial('vBeamM', scene);
  coneMat.emissiveColor = new Color3(0.9, 0.8, 0.55);
  coneMat.diffuseColor = new Color3(0, 0, 0);
  coneMat.alpha = 0;
  coneMat.backFaceCulling = false;
  coneMat.disableLighting = true;
  coneMat.alphaMode = 1;                              // additif : le faisceau s'ajoute
  for (const lx of [-0.62, 0.62]) {
    const spot = new SpotLight('vSpot' + lx, new Vector3(lx, 1.42, 2.7),
      new Vector3(lx * 0.04, -0.17, 1), 1.0, 8, scene);
    spot.diffuse = new Color3(1, 0.85, 0.6);
    spot.specular = new Color3(0.6, 0.55, 0.4);
    spot.range = 32;
    spot.intensity = 0;
    spot.setEnabled(false);
    spot.parent = body;
    const cone = MeshBuilder.CreateCylinder('vBeam' + lx,
      { diameterTop: 3.2, diameterBottom: 0.2, height: 9, tessellation: 14, cap: 0 }, scene);
    cone.rotation.x = Math.PI / 2 - 0.05;                       // +y local → +z avant
    cone.position.set(lx, 1.1, 2.6 + 4.4);
    cone.material = coneMat;
    cone.parent = body;
    cone.isPickable = false;
    beams.push(spot);
  }
  let litFrac = 0, litOn = false;

  /* ---- sapin désodorisant à ressort ---- */
  const fresh = new TransformNode('vFresh', scene);
  fresh.parent = body; fresh.position.set(0.28, 2.36, 2.5);
  const cord = MeshBuilder.CreateCylinder('vCord', { diameter: 0.008, height: 0.1 }, scene);
  cord.position.y = -0.05; cord.material = dark; cord.parent = fresh;
  const pine = MeshBuilder.CreateDisc('vPine', { radius: 0.055, tessellation: 3 }, scene);
  pine.position.y = -0.15; pine.rotation.z = Math.PI;           // pointe en haut
  const pm = new StandardMaterial('vPineM', scene);
  pm.diffuseColor = new Color3(0.2, 0.5, 0.24);
  pm.emissiveColor = new Color3(0.05, 0.12, 0.06);
  pm.backFaceCulling = false;
  pine.material = pm; pine.parent = fresh;

  /* ---- roues ---- */
  const wheels = [];
  const corners = [
    [-TRACK, WHEELBASE / 2, true], [TRACK, WHEELBASE / 2, true],
    [-TRACK, -WHEELBASE / 2, false], [TRACK, -WHEELBASE / 2, false],
  ];
  for (const [wx, wz, steer] of corners) {
    const hub = new TransformNode('vWheelHub', scene);
    hub.parent = root; hub.position.set(wx, WHEEL_R, wz);
    const spin = new TransformNode('vWheelSpin', scene);
    spin.parent = hub;
    const tire = MeshBuilder.CreateCylinder('vTire', { diameter: WHEEL_R * 2, height: 0.26, tessellation: 18 }, scene);
    tire.rotation.z = Math.PI / 2; tire.material = dark; tire.parent = spin;
    const cap = MeshBuilder.CreateCylinder('vCap', { diameter: 0.3, height: 0.28, tessellation: 12 }, scene);
    cap.rotation.z = Math.PI / 2; cap.material = chrome; cap.parent = spin;
    meshes.push(tire, cap);
    wheels.push({ hub, spin, wx, wz, steer, y: 0 });
  }

  for (const m of meshes) { shadows.addShadowCaster(m); m.receiveShadows = true; }

  /* ---- dynamique ---- */
  const st = {
    x: 1.2, z: 36.6, yaw: Math.PI, speed: 0, steerA: 0,  // garé dans le garage
    vx: 0, vz: 0, odo: 0,                              // vélocité réelle, odomètre
    bodyY: 0, pitch: 0, roll: 0, fresh: { x: 0, z: 0, vx: 0, vz: 0 },
    lastAcc: 0,
  };

  // scratch réutilisé (consommer le résultat avant l'appel suivant)
  const wheelOut = { x: 0, z: 0 };
  function wheelWorld(w) {
    const c = Math.cos(st.yaw), s = Math.sin(st.yaw);
    wheelOut.x = st.x + w.wx * c + w.wz * s;
    wheelOut.z = st.z - w.wx * s + w.wz * c;
    return wheelOut;
  }

  function update(dt, input, blocked) {
    /* conduite : couple, freinage, traînée — lourd et analogique */
    const off = input.offroad ? 0.55 : 0;
    const drag = 0.45 + Math.abs(st.speed) * (0.32 + off) + st.speed * st.speed * 0.012;
    let acc = 0;
    if (input.throttle > 0) acc = st.speed >= 0 ? 4.6 * (1 - Math.abs(st.speed) / 13) : 8.5;
    else if (input.throttle < 0) acc = st.speed > 0.3 ? -8.5 : -2.4;
    acc *= Math.abs(input.throttle);
    st.speed += (acc - Math.sign(st.speed) * drag) * dt;
    if (Math.abs(st.speed) < 0.04 && input.throttle === 0) st.speed = 0;
    st.speed = Math.max(-3.2, Math.min(12.5, st.speed));
    // direction : pleine à l'arrêt, resserrée à vitesse
    const maxSteer = 0.52 / (1 + Math.abs(st.speed) * 0.16);
    st.steerA += (input.steer * maxSteer - st.steerA) * Math.min(1, 8 * dt);
    st.yaw += st.steerA * (st.speed / WHEELBASE) * dt * 1.35;
    // adhérence finie : la vélocité réelle rejoint l'axe du van avec du
    // retard — douce glisse dans l'épingle, plus marquée sur la terre
    const grip = input.offroad ? 2.6 : 6.5;
    const gk = Math.min(1, grip * dt);
    st.vx += (Math.sin(st.yaw) * st.speed - st.vx) * gk;
    st.vz += (Math.cos(st.yaw) * st.speed - st.vz) * gk;
    const nx = st.x + st.vx * dt;
    const nz = st.z + st.vz * dt;
    if (blocked && blocked(nx, nz)) { st.speed *= -0.2; st.vx *= -0.2; st.vz *= -0.2; }
    else { st.x = nx; st.z = nz; }
    st.odo += Math.abs(st.speed) * dt;

    /* suspension : sol sondé sous chaque roue (+ tôle ondulée sur le gravier
     * de la chaussée : broutement haute fréquence indexé sur l'odomètre) */
    const washA = (!input.offroad && Math.abs(st.speed) > 3)
      ? 0.017 * Math.min(1, Math.abs(st.speed) / 7) : 0;
    let gsum = 0;
    for (const w of wheels) {
      const p = wheelWorld(w);
      const gy = ground(p.x, p.z)
        + washA * Math.sin(st.odo * 8.6 + w.wx * 3.7 + w.wz * 1.9);
      w.y += (gy - w.y) * Math.min(1, 16 * dt);                 // détente visible
      gsum += w.y;
    }
    const gMean = gsum / 4;
    const gF = (wheels[0].y + wheels[1].y) / 2, gR = (wheels[2].y + wheels[3].y) / 2;
    const gL = (wheels[0].y + wheels[2].y) / 2, gRt = (wheels[1].y + wheels[3].y) / 2;
    const accNow = (acc - st.lastAcc) * 0.5 + acc * 0.5;
    st.lastAcc = acc;
    const pitchT = -Math.atan2(gF - gR, WHEELBASE) - accNow * 0.0075;
    const rollT = Math.atan2(gRt - gL, TRACK * 2) - st.steerA * st.speed * 0.012;
    st.pitch += (pitchT - st.pitch) * Math.min(1, 6 * dt);
    st.roll += (rollT - st.roll) * Math.min(1, 6 * dt);
    const prevBodyY = st.bodyY;
    st.bodyY += (gMean + CLEAR - st.bodyY) * Math.min(1, 7 * dt);

    root.position.set(st.x, 0, st.z);
    root.rotation.y = st.yaw;
    body.position.y = st.bodyY;
    body.rotation.x = st.pitch;
    body.rotation.z = st.roll;
    for (const w of wheels) {
      w.hub.position.y = w.y + WHEEL_R;
      w.hub.rotation.y = w.steer ? st.steerA : 0;
      w.spin.rotation.x += (st.speed / WHEEL_R) * dt;
    }
    /* le sapin encaisse les bosses et les à-coups */
    const bump = (st.bodyY - prevBodyY) / Math.max(dt, 1e-3);
    const f = st.fresh;
    f.vx += (-f.x * 34 - f.vx * 3.2 + st.pitch * 6 - bump * 1.6) * dt;
    f.vz += (-f.z * 34 - f.vz * 3.2 + st.roll * 8 + st.steerA * st.speed * 0.24) * dt;
    f.x += f.vx * dt; f.z += f.vz * dt;
    fresh.rotation.x = Math.max(-0.9, Math.min(0.9, f.x));
    fresh.rotation.z = Math.max(-0.9, Math.min(0.9, f.z));

    /* phares : montée/descente en fondu, cônes gonflés par la brume/pluie.
     * Les spots éteints sont DÉSACTIVÉS : ils ne comptent plus dans le
     * quota de lumières simultanées des matériaux. */
    litFrac += ((litOn ? 1 : 0) - litFrac) * Math.min(1, 2.6 * dt);
    const beamsOn = litFrac > 0.01;
    for (const s of beams) {
      if (s.isEnabled() !== beamsOn) s.setEnabled(beamsOn);
      s.intensity = litFrac * 34;   // assez pour la route, pas pour blanchir la forêt
    }
    coneMat.alpha = litFrac * (0.045 + (input.mist || 0) * 0.075);
    lampOn.emissiveColor.set(0.35 + 0.65 * litFrac * 1.4, 0.3 + 0.55 * litFrac * 1.3, 0.2 + 0.4 * litFrac);
  }

  function setLights(on) { litOn = on; }
  /** coupure sèche (warm-up) : pas de fondu résiduel à la levée du boot */
  function snapLightsOff() {
    litOn = false; litFrac = 0;
    for (const s of beams) { s.intensity = 0; s.setEnabled(false); }
    coneMat.alpha = 0;
    lampOn.emissiveColor.set(0.35, 0.3, 0.2);
  }

  // amorce : la suspension se pose avant la première frame visible
  for (let i = 0; i < 30; i++) update(0.1, { throttle: 0, steer: 0, offroad: false }, null);

  return { root, body, st, wheels, wheelWorld, update, setLights, snapLightsOff, lightsOn: () => litOn };
}
