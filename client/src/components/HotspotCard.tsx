import { memo } from "react";
import type { TargetHotspot } from "@/lib/types";
import { formatPercentage } from "@/lib/utils";

type HotspotCardProps = TargetHotspot & {
  rank: number;
  showDistance?: boolean;
};

const HotspotCard = memo(
  ({ id, name, region, frequency, score, samples, distance, rank, showDistance }: HotspotCardProps) => {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-4 overflow-hidden">
        <div className="flex gap-3">
          <span className="text-lg font-bold text-emerald-600 flex-shrink-0 w-6">{rank}.</span>
          <div className="flex-1 min-w-0 overflow-hidden">
            <a
              href={`https://ebird.org/hotspot/${id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-slate-900 hover:text-emerald-700 block break-words"
            >
              {name}
            </a>
            {region && <div className="text-sm text-slate-500 break-words">{region}</div>}

            <div className="mt-3 space-y-2">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-slate-500 flex items-center gap-1">Adjusted Frequency</span>
                  <span className="text-base font-semibold text-emerald-700">{formatPercentage(score)}</span>
                </div>
                <div className="bg-gray-100 rounded-full h-2 w-full overflow-hidden">
                  <div className="bg-emerald-600 h-full rounded-full" style={{ width: `${score}%` }} />
                </div>
              </div>

              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">Frequency</span>
                <span className="text-slate-700">
                  <span className="font-medium">{formatPercentage(frequency)}</span>
                  <span className="text-slate-400 ml-1">({samples} checklists)</span>
                </span>
              </div>

              {showDistance && distance !== undefined && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Distance</span>
                  <span className="text-slate-700 font-medium">
                    {distance < 10 ? `${distance.toFixed(1)} km` : `${Math.round(distance)} km`}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }
);

HotspotCard.displayName = "HotspotCard";

export default HotspotCard;
