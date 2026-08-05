/**
 * Mode capture — F9 sort les trois images de référence en 1440p.
 *
 * Pourquoi ça existe : pour que deux séries soient comparables, il faut que le
 * CADRAGE soit rigoureusement le même — même heure, même météo, même position,
 * même cap, même distance. Refaire ça à la main donne trois images qu'on ne
 * peut pas superposer. F9 pose donc la scène trois fois — plein jour, midi,
 * contre-jour — et rend chaque image en 2560 × 1440 quelle que soit la taille
 * de la fenêtre. Les fichiers tombent dans le dossier de téléchargement sous
 * `laroute-<cadrage>-1440p.png`.
 *
 * POURQUOI ON NE PASSE PLUS PAR CreateScreenshotUsingRenderTarget
 *
 * C'était l'implémentation d'origine, et elle mentait. Cette fonction re-rend
 * la scène dans une cible hors écran via `camera.outputRenderTarget`, et ce
 * chemin-là ne fait PAS passer l'image par la chaîne de post accrochée à la
 * caméra. On récupérait la couleur brute : sans ACES, sans saturation, sans
 * lift, sans quantification rétro — l'étalonnage entier manquait.
 *
 * Mesuré au même cadrage, sur la machine cible :
 *
 *                écran        capture RTT
 *   moyenne      80/104/67    159/165/165
 *   1er centile  30           139
 *   étendue      154          41
 *   saturation   51           7
 *
 * La capture rendait une bouillie grise là où l'écran montre une forêt verte
 * contrastée. Toutes les vérifications « par capture » des passes précédentes
 * — y compris celles soumises à des agents critiques qui ne voyaient QUE
 * l'image — ont jugé cette bouillie.
 *
 * On copie donc le back buffer réel : on redimensionne le tampon de rendu en
 * 1440p, on laisse les passes de post se recaler, et on recopie le canvas tel
 * qu'il est présenté. Ce que la capture montre est ce que le joueur voit —
 * seule propriété qui rende une capture utilisable comme preuve.
 *
 * CONTREPARTIE ASSUMÉE : copier le back buffer exige que l'onglet soit VISIBLE.
 * Masqué, il n'est pas composité, et `drawImage` sur le canvas rend du noir
 * uniforme — une image de 76 ko au lieu de 5 Mo, moyenne (0,0,0). Le chemin
 * hors écran, lui, marchait sans fenêtre au premier plan : il était donc
 * scriptable en aveugle, ce qui explique sans doute qu'on ne se soit jamais
 * demandé ce qu'il rendait vraiment. On préfère une capture vraie qui exige
 * une fenêtre à une capture commode qui ment. Vérifier `document.visibility-
 * State === 'visible'` avant de conclure quoi que ce soit d'une série.
 */

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
export function installCapture(engine, scene, state, weather, setHint) {
  let busy = false;

  /** attend N frames rendues : le tapis d'herbe se re-sème en deux phases et
   * la brume met quelques frames à se caler sur la nouvelle heure */
  const frames = (n) => new Promise((res) => {
    let k = 0;
    const ob = scene.onAfterRenderObservable.add(() => {
      if (++k >= n) { scene.onAfterRenderObservable.remove(ob); res(); }
    });
  });

  /**
   * Rend une frame en 1440p et recopie le back buffer.
   * Le canvas garde sa taille CSS (100 %) : seul le tampon de rendu change,
   * donc la fenêtre ne bouge pas à l'écran pendant la série.
   */
  const shot = async () => {
    const rc = engine.getRenderingCanvas();
    engine.setSize(W, H, true);
    // les passes de post recréent leurs cibles à la taille du moteur : il leur
    // faut quelques frames avant que la chaîne entière soit en 1440p
    await frames(8);
    const data = await new Promise((res) => {
      engine.onEndFrameObservable.addOnce(() => {
        const out = document.createElement('canvas');
        out.width = W; out.height = H;
        out.getContext('2d').drawImage(rc, 0, 0);
        res(out.toDataURL('image/png'));
      });
    });
    engine.resize(true);                 // retour à la taille de la fenêtre
    await frames(2);
    return data;
  };

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
