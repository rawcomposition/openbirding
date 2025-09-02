import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import HotspotList from "@/components/HotspotList";
import RegionList from "@/components/RegionList";
import RegionStats from "@/components/RegionStats";
import Breadcrumb from "@/components/Breadcrumb";
import type { Hotspot, Region as RegionType } from "@/lib/types";

const Region = () => {
  const { regionCode } = useParams<{ regionCode: string }>();

  const {
    data: region,
    error,
    refetch,
    isLoading: isLoadingRegion,
  } = useQuery<RegionType>({
    queryKey: [`/regions/${regionCode}`],
    enabled: !!regionCode,
    refetchOnWindowFocus: false,
  });

  const { data: hotspots, isLoading: isLoadingHotspots } = useQuery<{ hotspots: Hotspot[]; count: number }>({
    queryKey: [`/hotspots/by-region/${regionCode}`],
    enabled: !!regionCode && !!region && !region.hasChildren,
    refetchOnWindowFocus: false,
  });

  if (error) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <Card className="bg-red-900/20 border-red-500/30">
          <CardContent className="space-y-2">
            <p className="text-red-300">Error loading region: {error.message}</p>
            <Button variant="outline" onClick={() => refetch()}>
              Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoadingRegion) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="animate-pulse">
          <div className="h-8 bg-slate-700 rounded w-1/3 mb-4"></div>
          <div className="h-4 bg-slate-700 rounded w-1/2 mb-8"></div>
        </div>
      </div>
    );
  }

  if (!region) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent>
            <p className="text-slate-300">Region not found</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {regionCode !== "world" && <Breadcrumb items={region.parents} />}

      <div className="mb-8">
        <div className="flex flex-col md:flex-row gap-4 items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <MapPin className="h-6 w-6 text-emerald-400" />
              <h1 className="text-3xl font-bold text-white">{region.name}</h1>
              <Badge variant="secondary" className="bg-blue-600/20 text-blue-300 border-blue-500/30">
                Region
              </Badge>
            </div>
          </div>
          <RegionStats regionCode={regionCode!} />
        </div>
      </div>

      {region.hasChildren ? (
        <RegionList
          regionCode={regionCode!}
          defaultSort={regionCode === "world" ? { id: "openHotspotCount", desc: true } : undefined}
        />
      ) : (
        <>
          {hotspots?.hotspots && hotspots.hotspots.length > 0 ? (
            <HotspotList
              hotspots={hotspots.hotspots}
              queryKey={`/hotspots/by-region/${regionCode}`}
              total={hotspots.count}
              isLoading={isLoadingHotspots}
            />
          ) : !isLoadingHotspots ? (
            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent>
                <p className="text-slate-300 text-center">No hotspots found in this region</p>
              </CardContent>
            </Card>
          ) : (
            <HotspotList hotspots={[]} queryKey={`/hotspots/by-region/${regionCode}`} isLoading={isLoadingHotspots} />
          )}
        </>
      )}
    </div>
  );
};

export default Region;
