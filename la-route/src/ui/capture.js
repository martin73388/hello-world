/**
 * Mode capture — F9 sort les trois images de référence en 1440p.
 *
 * Pourquoi ça existe : le rendu de développement est du WebGL logiciel, plus
 * terne et moins net que la cible WebGPU. Juger la direction artistique
 * suppose donc des captures prises sur la machine du joueur — et pour que
 * deux séries soient comparables, il faut que le CADRAGE soit rigoureusement
 * le même : même heure, même météo, même position, même cap, même distance.
 * Refaire ça à la main donne trois images qu'on ne peut pas superposer.
 *
 * F9 pose donc la scène trois fois — plein jour, midi, contre-jour — et rend
 * chaque image en 2560 × 1440 quelle que soit la taille de la fenêtre, via
 * une cible de rendu dédiée. Les fichiers tombent dans le dossier de
 * téléchargement sous `laroute-<cadrage>-1440p.png`.
 */
import { Tools } from '@babylonjs/core/Misc/tools.js';
// effet de bord : c'est ce module qui greffe CreateScreenshotUsingRenderTarget
// sur Tools. Sans lui, Babylon lève « ScreenshotTools needs to be imported ».
import '@babylonjs/core/Misc/screenshotTools.js';

/** Les trois cadrages. Toute modification casse la comparabilité des séries
 * déjà prises : on ajoute, on ne change pas. */
export const FRAMINGS = [
  { key: 'plein-jour', t: 0.42, x: 10, z: -30, yaw: 1.2, pitch: -0.5, d: 8 },
  { key: 'midi', t: 0.5, x: 16, z: -14, yaw: 0.9, pitch: -0.16, d: 9 },
  { key: 'contre-jour', t: 0.75, x: 10, z: -30, yaw: 1.2, pitch: -0.22, d: 8 },
];

const W = 2560, H = 1440;

/**
 * @param download  false pour récupérer les data-URL au lieu de télécharger
 *                  (c'est ce que fait le test de bout en bout)
 */
export function installCapture(engine, scene, camera, state, weather, setHint) {
  let busy = false;

  /** attend N frames rendues : le tapis d'herbe se re-sème en deux phases et
   * la brume met quelques frames à se caler sur la nouvelle heure */
  const frames = (n) => new Promise((res) => {
    let k = 0;
    const ob = scene.onAfterRenderObservable.add(() => {
      if (++k >= n) { scene.onAfterRenderObservable.remove(ob); res(); }
    });
  });

  const shot = () => new Promise((res) => {
    Tools.CreateScreenshotUsingRenderTarget(engine, camera, { width: W, height: H },
      (data) => res(data), 'image/png', 1, true);
  });

  async function run(download = true) {
    if (busy) return [];
    busy = true;
    const wasDrive = state.drive;
    const keep = { px: state.px, pz: state.pz, tx: state.tx, tz: state.tz,
      yaw: state.camYaw, pitch: state.camPitch, dist: state.dist, dt: state.distTarget };
    const out = [];
    try {
      for (const f of FRAMINGS) {
        if (setHint) setHint('capture ' + f.key + '…');
        weather.setTime(f.t);
        weather.setWeather('clair', true);
        if (!wasDrive) {
          state.px = f.x; state.pz = f.z; state.tx = f.x; state.tz = f.z;
        }
        state.camYaw = f.yaw; state.camPitch = f.pitch;
        state.dist = f.d; state.distTarget = f.d;
        await frames(30);                   // le temps que tapis et brume suivent
        const data = await shot();
        out.push({ key: f.key, data });
        if (download) {
          const a = document.createElement('a');
          a.href = data;
          a.download = 'laroute-' + f.key + '-1440p.png';
          a.click();
        }
      }
    } finally {
      if (!wasDrive) { state.px = keep.px; state.pz = keep.pz; state.tx = keep.tx; state.tz = keep.tz; }
      state.camYaw = keep.yaw; state.camPitch = keep.pitch;
      state.dist = keep.dist; state.distTarget = keep.dt;
      busy = false;
      if (setHint) setHint('trois captures 1440p enregistrées');
    }
    return out;
  }

  window.addEventListener('keydown', (e) => {
    if (e.code === 'F9') { e.preventDefault(); run(true); }
  });

  return { run, framings: FRAMINGS };
}
