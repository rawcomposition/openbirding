const Z = 1.96;
const Z_SQUARED = Z * Z;

export function wilsonLowerBound(observations: number, samples: number): number {
  if (samples <= 0 || observations <= 0) {
    return 0;
  }

  const successes = Math.min(observations, samples);
  const numerator =
    successes + Z_SQUARED / 2 - Z * Math.sqrt((successes * (samples - successes)) / samples + Z_SQUARED / 4);

  return numerator / (samples + Z_SQUARED);
}
