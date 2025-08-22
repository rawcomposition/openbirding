import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import HotspotList from "@/components/HotspotList";
import type { Hotspot } from "@/lib/types";

type PlaceData = {
  coordinates: {
    lat: number;
    lng: number;
  };
  hotspots: Hotspot[];
  count: number;
};

const Place = () => {
  const { placeName, coordinates } = useParams<{ placeName: string; coordinates: string }>();

  const {
    data: placeData,
    isLoading,
    error,
    refetch,
  } = useQuery<PlaceData>({
    queryKey: [`/places/${coordinates}`],
    enabled: !!(placeName && coordinates),
    refetchOnWindowFocus: false,
  });

  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="animate-pulse">
          <div className="h-8 bg-slate-700 rounded w-1/3 mb-4"></div>
          <div className="h-4 bg-slate-700 rounded w-1/2 mb-8"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <Card className="bg-red-900/20 border-red-500/30">
          <CardContent className="space-y-2">
            <p className="text-red-300">Error loading place: {error.message}</p>
            <Button variant="outline" onClick={() => refetch()}>
              Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!placeData) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent>
            <p className="text-slate-300">Place not found</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { coordinates: coords, hotspots } = placeData;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-4">
          <MapPin className="h-6 w-6 text-emerald-400" />
          <h1 className="text-3xl font-bold text-white">{placeName}</h1>
          <Badge variant="secondary" className="bg-blue-600/20 text-blue-300 border-blue-500/30">
            Place
          </Badge>
        </div>
        <p className="text-slate-300 text-lg">
          Coordinates: {coords.lat.toFixed(6)}, {coords.lng.toFixed(6)}
        </p>
        <p className="text-slate-400 text-sm">Showing the closest 200 hotspots</p>
      </div>

      {hotspots && hotspots.length > 0 ? (
        <HotspotList
          hotspots={hotspots}
          queryKey={`/places/${coordinates}`}
          defaultSort={{ id: "distance", desc: false }}
          showDistance={true}
          isLoading={isLoading}
        />
      ) : !isLoading ? (
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent>
            <p className="text-slate-300 text-center">No hotspots found near this location</p>
          </CardContent>
        </Card>
      ) : (
        <HotspotList
          hotspots={[]}
          queryKey={`/places/${coordinates}`}
          defaultSort={{ id: "distance", desc: false }}
          showDistance={true}
          isLoading={isLoading}
        />
      )}
    </div>
  );
};

export default Place;
