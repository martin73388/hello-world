/**
 * Bruit procédural déterministe (aucun Math.random) :
 * value noise bilinéaire + fBm, avec cisaillement directionnel du vent.
 */
function hash(ix, iz) {
  let h = (ix * 374761393 + iz * 668265263) | 0;
  h = (h ^ (h >> 13)) * 1274126177 | 0;
  return ((h ^ (h >> 16)) >>> 0) / 4294967295;
}

function smooth(t) { return t * t * (3 - 2 * t); }

export function vnoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = smooth(x - ix), fz = smooth(z - iz);
  const a = hash(ix, iz), b = hash(ix + 1, iz);
  const c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1);
  return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fz;
}

export function fbm(x, z, octaves, lac, gain) {
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += vnoise(x * freq, z * freq) * amp;
    norm += amp;
    amp *= gain; freq *= lac;
  }
  return sum / norm;
}

/**
 * Bruit à CRÊTES. Le fBm ordinaire fait des bosses molles, toutes semblables,
 * qui de loin lisent comme un matelas. En repliant le bruit sur lui-même —
 * 1 - |2n-1| — les creux deviennent des arêtes : on obtient des croupes et des
 * vallons, c'est-à-dire du relief qu'on peut nommer. Le carré accentue les
 * crêtes et adoucit les fonds, ce qui est le sens d'écoulement d'un terrain
 * réel : les vallées s'évasent, les lignes de partage restent nettes.
 */
export function ridged(x, z, octaves, lac, gain) {
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    const n = 1 - Math.abs(vnoise(x * freq, z * freq) * 2 - 1);
    sum += n * n * amp;
    norm += amp;
    amp *= gain; freq *= lac;
  }
  return sum / norm;
}

// vent dominant : les formes moyennes et fines s'étirent le long de cet axe
const WIND = { x: 0.85, z: 0.53 };

/**
 * Hauteur du sol forestier, sans la route (mètres).
 *
 * Le terrain avait trois octaves et paraissait plat, ce qui n'est pas une
 * contradiction : c'est une affaire d'ÉCHELLE VUE. Les grandes ondulations
 * font seize mètres de creux à crête mais sur quatre-vingt-quinze de long —
 * dans un champ de vision de trente mètres, ça ne fait qu'une pente douce, et
 * une pente uniforme se lit comme un plan. À l'autre bout, l'octave fine ne
 * pesait que cinquante centimètres sur cinq mètres et demi : quatre pour cent
 * de pente, sous le seuil du visible. Entre les deux, rien.
 *
 * Ce qui manquait, c'est l'échelle du REGARD — celle qu'on embrasse d'un coup
 * d'œil et qu'on traverse en dix secondes de marche. On l'ajoute deux fois :
 *   - des CROUPES en bruit à crêtes vers cinquante mètres, qui donnent au
 *     vallon des lignes de partage au lieu d'un fond de cuvette uniforme ;
 *   - des MAMELONS de deux mètres six sur onze mètres, qui font qu'on monte et
 *     qu'on descend en marchant, et sur lesquels la végétation conformée à la
 *     pente a enfin quelque chose à épouser.
 *
 * La grille porte 1,15 m par sommet : onze mètres de longueur d'onde, c'est
 * dix sommets par bosse, largement au-dessus du seuil de restitution. La route
 * échantillonne cette fonction puis lisse : elle ondulera avec le terrain, et
 * ses déblais-remblais se creuseront d'autant.
 */
export function baseHeight(x, z) {
  // grandes ondulations de vallée
  const broad = (fbm(x / 95, z / 95, 3, 2.1, 0.5) - 0.5) * 16;
  // croupes et vallons : les lignes de partage du terrain
  const crest = (ridged(x / 52 + 11.3, z / 52 - 7.1, 2, 2.0, 0.5) - 0.42) * 7.0;
  // bosses moyennes, cisaillées par le vent
  const wx = x * WIND.x + z * WIND.z, wz = -x * WIND.z + z * WIND.x;
  const medium = (fbm(wx / 21, wz / 34, 3, 2.2, 0.5) - 0.5) * 6.2;
  // mamelons : l'échelle de la marche, celle qu'on sent sous les pieds
  const hum = (vnoise(x / 11 + 31.7, z / 11 - 17.3) - 0.5) * 2.6;
  // litière fine
  const fine = (fbm(x / 5.5, z / 5.5, 2, 2.3, 0.5) - 0.5) * 0.9;
  // la vallée s'incline doucement vers le nord (la route descend)
  return broad + crest + medium + hum + fine - z * 0.012;
}
