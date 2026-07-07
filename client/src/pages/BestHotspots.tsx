import { useCallback, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import toast from "react-hot-toast";
import LiferGridMap, { type GridMapHandle, type Bbox } from "@/components/LiferGridMap";
import { mutate } from "@/lib/utils";
import { useBestHotspotsStore, useBestHotspotsSession } from "@/stores/bestHotspotsStore";
import { Sidebar } from "@/components/besthotspots/Sidebar";
import { Legend } from "@/components/besthotspots/Legend";
import { MapCredits } from "@/components/besthotspots/MapCredits";
import type { StatusResponse } from "@/components/besthotspots/types";

const BestHotspots = () => {
  useEffect(() => {
    document.title = "Best Hotspots | OpenBirding";
  }, []);

  const listToken = useBestHotspotsStore((s) => s.listToken);
  const clearLifeList = useBestHotspotsStore((s) => s.clearLifeList);
  const selection = useBestHotspotsSession((s) => s.selection);
  const selectedHotspot = useBestHotspotsSession((s) => s.selectedHotspot);
  const setViewport = useBestHotspotsSession((s) => s.setViewport);
  const setSelectedHotspot = useBestHotspotsSession((s) => s.setSelectedHotspot);
  const toggleCell = useBestHotspotsSession((s) => s.toggleCell);
  const clearSelection = useBestHotspotsSession((s) => s.clearSelection);

  const mapHandle = useRef<GridMapHandle>(null);

  const { error: listError } = useQuery({
    queryKey: [`/lifers/list/${listToken}`],
    enabled: !!listToken,
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });
  useEffect(() => {
    if (listError && /not found/i.test(listError.message)) {
      clearLifeList();
      toast.error("Your saved life list has expired — please upload it again.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listError]);

  const { data: status } = useQuery<StatusResponse>({
    queryKey: ["/lifers/status"],
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });
  const resolutions = status?.resolutions ?? [3, 4];

  const { data: scaleData } = useQuery<{ breaksByRes: Record<number, number[]> }>({
    queryKey: ["lifer-grid-scale", listToken],
    enabled: !!listToken,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    queryFn: () =>
      mutate("POST", "/lifers/grid-scale", { listToken }) as Promise<{ breaksByRes: Record<number, number[]> }>,
  });
  const breaksByRes = scaleData?.breaksByRes ?? null;

  const onViewportChange = useCallback(
    (bbox: Bbox, resolution: number) => setViewport({ bbox, resolution }),
    [setViewport]
  );
  const onMapClick = useCallback(() => setSelectedHotspot(null), [setSelectedHotspot]);

  const handleResolutionChange = (res: number) => {
    const sel = useBestHotspotsSession.getState().selection;
    if (sel && sel.resolution !== res) clearSelection();
  };

  useEffect(() => {
    if (selectedHotspot) mapHandle.current?.flyTo(selectedHotspot.lng, selectedHotspot.lat);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedHotspot?.id]);

  const selectedCells = selection?.cells ?? [];

  return (
    <div className="fixed inset-x-0 bottom-0 top-16 flex overflow-hidden">
      <Sidebar />

      <div className="relative z-0 min-w-0 flex-1">
        <LiferGridMap
          ref={mapHandle}
          listToken={listToken}
          resolutions={resolutions}
          breaksByRes={breaksByRes}
          selectedCells={selectedCells}
          onToggleCell={toggleCell}
          onResolutionChange={handleResolutionChange}
          onViewportChange={onViewportChange}
          onMapClick={onMapClick}
          markerAt={selectedHotspot ? { lng: selectedHotspot.lng, lat: selectedHotspot.lat } : null}
        />

        {listToken && (
          <div className="absolute bottom-3 left-3 z-10 w-44 rounded-lg border border-slate-200 bg-white/90 px-3 py-2 shadow-lg backdrop-blur">
            <Legend />
          </div>
        )}

        <MapCredits />
      </div>
    </div>
  );
};

export default BestHotspots;
