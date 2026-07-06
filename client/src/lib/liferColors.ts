// Diverging "few → many targets" ramp (grey → teal → lime → yellow → red),
// shared by the map's hex fill and the panel legend.
export const MARKER_COLORS = [
  "#bcbcbc",
  "#8f9ca0",
  "#9bc4cf",
  "#aaddeb",
  "#c7e466",
  "#eaeb1f",
  "#fac500",
  "#e57701",
  "#ce0d02",
  "#ad0002",
];

/** Colour stops for a MapLibre `interpolate` expression keyed on normalised t (0..1). */
export function rampStops(): (number | string)[] {
  const stops: (number | string)[] = [];
  const n = MARKER_COLORS.length;
  MARKER_COLORS.forEach((c, i) => {
    stops.push(i / (n - 1), c);
  });
  return stops;
}
