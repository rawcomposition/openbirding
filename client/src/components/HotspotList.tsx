import type { TargetHotspot } from "@/lib/types";
import { cn } from "@/lib/utils";
import HotspotRow from "./HotspotRow";

type Props = {
  hotspots: TargetHotspot[];
  total?: number;
  showDistance?: boolean;
  isLoading?: boolean;
};

const HotspotList = ({ hotspots, total, showDistance, isLoading }: Props) => {
  return (
    <div className="space-y-6">
      <style>
        {`
          .row-number::before {
            content: counter(row-counter) ".";
            counter-increment: row-counter;
          }
        `}
      </style>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Best Hotspots</h2>
          <p className="text-slate-600 mt-1">Showing {total || hotspots.length} results</p>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full" style={{ counterReset: "row-counter" }}>
          <thead className="sticky top-0 bg-slate-50 z-10">
            <tr className="border-b border-slate-200">
              <th className="text-left p-4 text-sm font-medium text-slate-700">Hotspot</th>
              <th className={cn("text-left p-4 text-sm font-medium text-slate-700", "sm:w-xs")}>Frequency</th>
              <th className="text-left p-4 text-sm font-medium text-slate-700 w-0 whitespace-nowrap">
                Adjusted Frequency
              </th>
              {showDistance && (
                <th className="text-left p-4 text-sm font-medium text-slate-700 w-0 whitespace-nowrap">Distance</th>
              )}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <>
                {[...Array(8)].map((_, i) => (
                  <tr key={i} className="border-b border-slate-100">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="h-5 w-5 bg-slate-200 rounded animate-pulse"></div>
                        <div className="h-4 bg-slate-200 rounded w-40 animate-pulse"></div>
                      </div>
                    </td>
                    <td className="p-4 w-0 whitespace-nowrap">
                      <div className="h-4 bg-slate-200 rounded w-8 animate-pulse"></div>
                    </td>
                    <td className="p-4">
                      <div className="h-4 bg-slate-200 rounded w-32 animate-pulse"></div>
                    </td>
                    <td className="p-4 w-0 whitespace-nowrap">
                      <div className="h-4 bg-slate-200 rounded w-12 animate-pulse"></div>
                    </td>
                    {showDistance && (
                      <td className="p-4 w-0 whitespace-nowrap">
                        <div className="h-4 bg-slate-200 rounded w-16 animate-pulse"></div>
                      </td>
                    )}
                    <td className="p-4 w-0 whitespace-nowrap">
                      <div className="h-4 bg-slate-200 rounded w-20 animate-pulse"></div>
                    </td>
                  </tr>
                ))}
              </>
            ) : (
              hotspots.map((hotspot) => <HotspotRow key={hotspot.id} showDistance={showDistance} {...hotspot} />)
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default HotspotList;
