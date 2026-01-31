import { memo } from "react";
import type { TargetHotspot } from "@/lib/types";
import { formatPercentage } from "@/lib/utils";

type HotspotRowProps = TargetHotspot & {
  showDistance?: boolean;
};

const HotspotRow = memo(({ id, name, region, frequency, score, samples, distance, showDistance }: HotspotRowProps) => {
  return (
    <tr className="border-b border-slate-100">
      <td className="p-4">
        <div className="flex items-center gap-3">
          <span className="h-5 w-5 flex items-center justify-center font-bold text-emerald-600 flex-shrink-0 row-number"></span>
          <div>
            <a
              href={`https://ebird.org/hotspot/${id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium"
            >
              {name}
            </a>
            {region && <div className="text-sm text-slate-500">{region}</div>}
          </div>
        </div>
      </td>

      <td className="p-4">
        <span className="text-md font-medium text-slate-600">{formatPercentage(frequency)}</span>{" "}
        <span className="text-xs text-slate-500">
          of <span className="font-medium text-slate-600">{samples}</span> checklists
        </span>
      </td>

      <td className="p-4 w-0 whitespace-nowrap">
        <span className="text-md font-medium text-slate-600">{formatPercentage(score)}</span>
        <div className="bg-gray-100 rounded-xs p-1 w-full relative overflow-hidden">
          <div className="bg-emerald-600 h-2 rounded-xs absolute top-0 left-0" style={{ width: `${score}%` }}></div>
        </div>
      </td>

      {showDistance && (
        <td className="p-4 w-0 whitespace-nowrap">
          {distance !== undefined ? (
            <span className="text-sm text-slate-700">
              {distance < 10 ? `${distance.toFixed(1)} km` : `${Math.round(distance)} km`}
            </span>
          ) : (
            <span className="text-sm text-slate-500">-</span>
          )}
        </td>
      )}
    </tr>
  );
});

HotspotRow.displayName = "HotspotRow";

export default HotspotRow;
