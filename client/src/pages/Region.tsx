import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import HotspotList from "@/components/HotspotList";
import RegionList from "@/components/RegionList";
import type { Hotspot } from "@/lib/types";

type Region = {
  _id: string;
  name: string;
  isCountry?: boolean;
  hasChildren?: boolean;
};

const Region = () => {
  const { regionCode } = useParams<{ regionCode: string }>();

  const {
    data: region,
    isLoading: isLoadingRegion,
    error,
    refetch,
  } = useQuery<Region>({
    queryKey: [`/regions/${regionCode}`],
    enabled: !!regionCode,
    refetchOnWindowFocus: false,
  });

  const { data: hotspots, isLoading: isLoadingHotspots } = useQuery<{ hotspots: Hotspot[]; count: number }>({
    queryKey: [`/regions/${regionCode}/hotspots`],
    enabled: !!regionCode && !!region && !region?.hasChildren,
    refetchOnWindowFocus: false,
  });

  if (isLoadingRegion || isLoadingHotspots) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="animate-pulse">
          <div className="h-8 bg-slate-700 rounded w-1/3 mb-4"></div>
          <div className="h-4 bg-slate-700 rounded w-1/2 mb-8"></div>
          <div className="flex flex-col gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-12 bg-slate-700 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

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
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-4">
          <MapPin className="h-6 w-6 text-emerald-400" />
          <h1 className="text-3xl font-bold text-white">{region.name}</h1>
          <Badge variant="secondary" className="bg-blue-600/20 text-blue-300 border-blue-500/30">
            Region
          </Badge>
        </div>
        <p className="text-slate-300 text-lg">Region Code: {regionCode}</p>
      </div>

      {region.hasChildren ? (
        <RegionList regionCode={regionCode!} />
      ) : regionCode && hotspots?.hotspots && hotspots.hotspots.length > 0 ? (
        <HotspotList
          hotspots={hotspots.hotspots}
          queryKey={`/regions/${regionCode}/hotspots`}
          total={hotspots.count}
          isLoading={isLoadingHotspots}
        />
      ) : (
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent>
            <p className="text-slate-300 text-center">No hotspots found in this region</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default Region;
