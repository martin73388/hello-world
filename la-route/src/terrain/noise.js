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

// vent dominant : les formes moyennes et fines s'étirent le long de cet axe
const WIND = { x: 0.85, z: 0.53 };

/** hauteur du sol forestier, sans la route (mètres) */
export function baseHeight(x, z) {
  // grandes ondulations de vallée
  const broad = (fbm(x / 95, z / 95, 3, 2.1, 0.5) - 0.5) * 16;
  // bosses moyennes, cisaillées par le vent
  const wx = x * WIND.x + z * WIND.z, wz = -x * WIND.z + z * WIND.x;
  const medium = (fbm(wx / 21, wz / 34, 3, 2.2, 0.5) - 0.5) * 4.6;
  // litière fine
  const fine = (fbm(x / 5.5, z / 5.5, 2, 2.3, 0.5) - 0.5) * 0.5;
  // la vallée s'incline doucement vers le nord (la route descend)
  return broad + medium + fine - z * 0.012;
}
