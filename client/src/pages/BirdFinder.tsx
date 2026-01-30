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
import type { TargetHotspot } from "@/lib/types";

const BirdFinder = () => {
  const { species } = useBirdFinderStore();

  const { data, isLoading: isLoadingHotspots } = useQuery<{ hotspots: TargetHotspot[] }>({
    queryKey: [`/targets/hotspots/${species?.code}`],
    enabled: !!species?.code,
    refetchOnWindowFocus: false,
  });

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-6">
          <MapPin className="h-6 w-6 text-emerald-600" />
          <h1 className="text-3xl font-bold text-slate-900">Bird Finder</h1>
          <Badge variant="secondary" className="bg-blue-100 text-blue-800 border-blue-200">
            Experimental
          </Badge>
        </div>

        <div className="max-w-md mb-3">
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
      ) : data?.hotspots && data.hotspots.length > 0 ? (
        <HotspotList hotspots={data.hotspots} total={data.hotspots.length} isLoading={isLoadingHotspots} />
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
