import { useQuery } from "@tanstack/react-query";
import { Hexagon, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { mutate } from "@/lib/utils";
import { useBestHotspotsStore, useBestHotspotsSession } from "@/stores/bestHotspotsStore";
import type { CellInfo } from "@/components/besthotspots/types";

export function SelectedCellsCard() {
  const selection = useBestHotspotsSession((s) => s.selection);
  const listToken = useBestHotspotsStore((s) => s.listToken);
  const clearSelection = useBestHotspotsSession((s) => s.clearSelection);
  const selectedCells = selection?.cells ?? [];

  const { data: cellsData } = useQuery<{ cells: CellInfo[] }>({
    queryKey: ["lifer-cells", selection?.resolution, selectedCells.join(","), listToken],
    enabled: !!listToken && !!selection && selectedCells.length > 0,
    refetchOnWindowFocus: false,
    queryFn: () =>
      mutate("POST", "/lifers/cells", {
        listToken,
        resolution: selection!.resolution,
        cells: selection!.cells,
      }) as Promise<{ cells: CellInfo[] }>,
  });

  if (selectedCells.length === 0) return null;

  const count = selectedCells.length;
  const cellsInfo = cellsData?.cells ?? null;

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-base font-medium text-amber-900">
          <Hexagon className="h-4 w-4" />
          {count === 1 ? "Selected area" : `${count} areas selected`}
        </span>
        <Button
          variant="ghost"
          size="xs"
          onClick={clearSelection}
          className="bg-white text-amber-800 shadow-sm hover:bg-amber-100 hover:text-amber-900"
        >
          <X className="size-3.5" /> Clear
        </Button>
      </div>
      {cellsInfo && cellsInfo.length > 0 && (() => {
        const total = cellsInfo.reduce(
          (a, c) => ({
            lifers: a.lifers + c.lifers,
            totalSpecies: a.totalSpecies + c.totalSpecies,
            samples: a.samples + c.samples,
            namedHotspots: a.namedHotspots + c.namedHotspots,
          }),
          { lifers: 0, totalSpecies: 0, samples: 0, namedHotspots: 0 }
        );
        return (
          <div className="mt-1.5 border-t border-amber-200/70 pt-1.5 text-sm text-amber-900">
            <span className="font-semibold">
              {total.lifers.toLocaleString()} possible lifer{total.lifers === 1 ? "" : "s"}
            </span>
            <span className="text-amber-800/80">
              {" "}
              · {total.totalSpecies.toLocaleString()} species · {total.samples.toLocaleString()} checklists
            </span>
            {total.namedHotspots === 0 && (
              <div className="text-xs italic text-amber-700/90">
                No eBird hotspots here — sightings come from personal locations.
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
