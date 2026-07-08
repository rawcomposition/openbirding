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

export function quantileStops(breaks: number[]): (number | string)[] {
  const stops: (number | string)[] = [];
  let prev = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < MARKER_COLORS.length; i++) {
    let v = breaks[i] ?? prev + 1;
    if (v <= prev) v = prev + 1;
    stops.push(v, MARKER_COLORS[i]);
    prev = v;
  }
  return stops;
}
