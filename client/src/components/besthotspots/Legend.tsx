import { MARKER_COLORS } from "@/lib/liferColors";

export function Legend() {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs font-medium text-slate-500">
        <span>Fewer lifers</span>
        <span>More</span>
      </div>
      <div
        className="h-2 rounded-full"
        style={{ background: `linear-gradient(to right, ${MARKER_COLORS.join(", ")})` }}
      />
    </div>
  );
}
