import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin } from "lucide-react";
import HotspotList from "@/components/HotspotList";
import SpeciesSearch from "@/components/SpeciesSearch";
import { RegionFilter } from "@/components/filters/RegionFilter";
import { MonthFilter } from "@/components/filters/MonthFilter";
import { MinObservationsFilter } from "@/components/filters/MinObservationsFilter";
import { useBirdFinderStore } from "@/stores/birdFinderStore";
import { pointInPolygon } from "@/lib/geo";
import type { TargetHotspot } from "@/lib/types";

const BirdFinder = () => {
  useEffect(() => {
    document.title = "Bird Finder | OpenBirding";
  }, []);
  const { species, month, minObservations, region, customArea } = useBirdFinderStore();

  const buildQueryUrl = () => {
    const params = new URLSearchParams();
    if (month != null) {
      params.set("month", String(month));
    }
    if (minObservations != null) {
      params.set("minObservations", String(minObservations));
    }
    if (region?.regionCode) {
      params.set("region", region.regionCode);
    }
    if (customArea) {
      const { minLng, minLat, maxLng, maxLat } = customArea.bbox;
      params.set("bbox", `${minLng},${minLat},${maxLng},${maxLat}`);
    }
    const queryString = params.toString();
    return `/targets/hotspots/${species?.code}${queryString ? `?${queryString}` : ""}`;
  };

  const { data, isLoading: isLoadingHotspots } = useQuery<{ hotspots: TargetHotspot[]; citation?: string }>({
    queryKey: [buildQueryUrl()],
    enabled: !!species?.code,
    refetchOnWindowFocus: false,
  });

  const filteredHotspots = useMemo(() => {
    if (!data?.hotspots) return [];
    if (!customArea) return data.hotspots;
    return data.hotspots.filter((h) => pointInPolygon([h.lng, h.lat], customArea.polygon));
  }, [data?.hotspots, customArea]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-6 flex-wrap">
          <MapPin className="h-6 w-6 text-emerald-600" />
          <h1 className="text-3xl font-bold text-slate-900">Bird Finder</h1>
          <Badge variant="secondary" className="bg-blue-100 text-blue-800 border-blue-200">
            Experimental
          </Badge>
        </div>

        <div className="max-w-xl mb-3 mt-12">
          <SpeciesSearch />
        </div>

        <div className="flex flex-wrap gap-2">
          <RegionFilter />
          <MonthFilter />
          <MinObservationsFilter />
        </div>
      </div>

      {!species?.code ? (
        <Card className="bg-slate-50 border-slate-200">
          <CardContent>
            <p className="text-slate-700 text-center">Search for a species to find the best hotspots</p>
          </CardContent>
        </Card>
      ) : filteredHotspots.length > 0 ? (
        <>
          <HotspotList hotspots={filteredHotspots} total={filteredHotspots.length} isLoading={isLoadingHotspots} />
          {data?.citation && <p className="mt-6 text-xs text-slate-500 max-w-2xl">{data.citation}</p>}
        </>
      ) : isLoadingHotspots ? (
        <HotspotList hotspots={[]} isLoading={isLoadingHotspots} />
      ) : (
        <Card className="bg-slate-50 border-slate-200">
          <CardContent>
            <p className="text-slate-700 text-center">No hotspots found for this species</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default BirdFinder;
