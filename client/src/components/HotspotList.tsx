import { Input } from "@/components/ui/input";
import type { TargetHotspot } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useState, useMemo } from "react";
import HotspotRow from "./HotspotRow";

type Props = {
  hotspots: TargetHotspot[];
  total?: number;
  showDistance?: boolean;
  isLoading?: boolean;
};

const HotspotList = ({ hotspots, total, showDistance, isLoading }: Props) => {
  const [filter, setFilter] = useState("");

  const filteredHotspots = useMemo(() => {
    if (!filter) return hotspots;
    const lowerFilter = filter.toLowerCase();
    return hotspots.filter((hotspot) => hotspot.name.toLowerCase().includes(lowerFilter));
  }, [hotspots, filter]);

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
          <h2 className="text-2xl font-bold text-slate-900">Hotspots</h2>
          <p className="text-slate-600 mt-1">Found {total || hotspots.length} hotspots</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
          <Input
            type="text"
            placeholder="Search hotspots..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-full sm:w-80"
          />
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
              filteredHotspots.map((hotspot) => (
                <HotspotRow key={hotspot.id} showDistance={showDistance} {...hotspot} />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default HotspotList;
