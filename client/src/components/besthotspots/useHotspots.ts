import { useMemo } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { latLngToCell, cellToBoundary } from "h3-js";
import { mutate } from "@/lib/utils";
import { useBestHotspotsStore, useBestHotspotsSession } from "@/stores/bestHotspotsStore";
import type { Bbox } from "@/components/LiferGridMap";
import type { HotspotItem, HotspotResponse } from "@/components/besthotspots/types";

const HOTSPOT_LIMIT = 100;

/**
 * Union bounding box over a set of H3 cells. Cell sets straddling the
 * antimeridian are unwrapped and returned in the crossing form
 * (minLng > maxLng), which the server's bbox filter understands.
 */
function cellsBbox(cells: string[]): Bbox | null {
  const lngs: number[] = [];
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const h of cells) {
    const ring = cellToBoundary(h, true) as [number, number][];
    for (const [lng, lat] of ring) {
      lngs.push(lng);
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
  }
  if (lngs.length === 0) return null;
  let minLng = Math.min(...lngs);
  let maxLng = Math.max(...lngs);
  if (maxLng - minLng > 180) {
    const shifted = lngs.map((l) => (l < 0 ? l + 360 : l));
    const wrapLng = (l: number) => (l > 180 ? l - 360 : l);
    minLng = wrapLng(Math.min(...shifted));
    maxLng = wrapLng(Math.max(...shifted));
  }
  return { minLng, minLat, maxLng, maxLat };
}

export function useHotspots() {
  const listToken = useBestHotspotsStore((s) => s.listToken);
  const frequency = useBestHotspotsStore((s) => s.frequency);
  const minChecklists = useBestHotspotsStore((s) => s.minChecklists);
  const selection = useBestHotspotsSession((s) => s.selection);
  const viewport = useBestHotspotsSession((s) => s.viewport);

  const scope = useMemo<{ kind: "hex" | "view"; bbox: Bbox | null } | null>(() => {
    if (selection && selection.cells.length) return { kind: "hex", bbox: cellsBbox(selection.cells) };
    if (viewport) return { kind: "view", bbox: viewport.bbox };
    return null;
  }, [selection, viewport]);

  const bboxKey = (b: Bbox) => [b.minLng, b.minLat, b.maxLng, b.maxLat].map((v) => v.toFixed(3)).join(",");
  const scopeKey =
    scope?.kind === "hex"
      ? `hex:${selection?.cells.join(",")}`
      : scope?.bbox
        ? `view:${bboxKey(scope.bbox)}`
        : "none";

  const query = useQuery<HotspotResponse>({
    queryKey: ["lifer-hotspots", scopeKey, frequency, minChecklists, listToken],
    enabled: !!listToken && !!scope?.bbox,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
    queryFn: () =>
      mutate("POST", "/lifers/hotspots", {
        listToken,
        frequency,
        minChecklists,
        limit: HOTSPOT_LIMIT,
        bbox: scope!.bbox,
      }) as Promise<HotspotResponse>,
  });

  const hotspots = useMemo<HotspotItem[]>(() => {
    const items = query.data?.items ?? [];
    if (scope?.kind === "hex" && selection) {
      const set = new Set(selection.cells);
      return items.filter((h) => set.has(latLngToCell(h.lat, h.lng, selection.resolution)));
    }
    return items;
  }, [query.data, scope, selection]);

  return { ...query, hotspots, scopeKind: scope?.kind ?? null };
}
