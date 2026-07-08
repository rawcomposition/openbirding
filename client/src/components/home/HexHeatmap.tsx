import { MARKER_COLORS } from "@/lib/liferColors";

const LEVELS = [0, 2, 4, 6, 7, 9].map((i) => MARKER_COLORS[i]);

const MAX_LEVEL = LEVELS.length - 1;
const MIN_OPACITY = 0.4;
const MAX_OPACITY = 0.78;
const levelOpacity = (level: number) => MIN_OPACITY + (level / MAX_LEVEL) * (MAX_OPACITY - MIN_OPACITY);

const INTENSITY = [
  [0, 0, 1, 1, 0, 0],
  [0, 1, 2, 2, 1, 0],
  [1, 2, 3, 5, 3, 1],
  [0, 2, 4, 5, 3, 0],
  [0, 1, 2, 2, 1, 0],
];

const R = 26;
const WIDTH = Math.sqrt(3) * R;
const ROW_STEP = 1.5 * R;

const hexPoints = (cx: number, cy: number) =>
  Array.from({ length: 6 }, (_, i) => {
    const angle = (Math.PI / 180) * (60 * i - 90);
    return `${(cx + R * Math.cos(angle)).toFixed(2)},${(cy + R * Math.sin(angle)).toFixed(2)}`;
  }).join(" ");

const HexHeatmap = ({ className }: { className?: string }) => {
  const cells = INTENSITY.flatMap((row, r) =>
    row.map((level, c) => ({
      key: `${r}-${c}`,
      cx: R + c * WIDTH + (r % 2 ? WIDTH / 2 : 0),
      cy: R + r * ROW_STEP,
      level,
    }))
  );

  const maxCx = Math.max(...cells.map((cell) => cell.cx));
  const maxCy = Math.max(...cells.map((cell) => cell.cy));

  return (
    <svg
      viewBox={`0 0 ${maxCx + R} ${maxCy + R}`}
      className={className}
      role="img"
      aria-label="A honeycomb heatmap highlighting where the most new life birds can be found"
    >
      {cells.map((cell) => (
        <polygon
          key={cell.key}
          points={hexPoints(cell.cx, cell.cy)}
          fill={LEVELS[cell.level]}
          fillOpacity={levelOpacity(cell.level)}
          stroke="#ffffff"
          strokeWidth={2}
        />
      ))}
    </svg>
  );
};

export default HexHeatmap;
