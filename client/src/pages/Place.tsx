import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, Map } from "lucide-react";
import { Button } from "@/components/ui/button";
import HotspotList from "@/components/HotspotList";
import { useEditMode } from "@/lib/editStore";
import type { Hotspot } from "@/lib/types";

const Place = () => {
  const { placeName, coordinates } = useParams<{ placeName: string; coordinates: string }>();
  const isEditMode = useEditMode();

  const {
    data: hotspots,
    isLoading,
    error,
    refetch,
  } = useQuery<Hotspot[]>({
    queryKey: [`/hotspots/nearby/${coordinates}`],
    enabled: !!(placeName && coordinates),
    refetchOnWindowFocus: false,
  });

  if (error) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <Card className="bg-red-50 border-red-200">
          <CardContent className="space-y-2">
            <p className="text-red-700">Error loading place: {error.message}</p>
            <Button variant="outline" onClick={() => refetch()}>
              Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!hotspots?.length && !isLoading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <Card className="bg-slate-50 border-slate-200">
          <CardContent>
            <p className="text-slate-700">No hotspots found</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-4">
          <MapPin className="h-6 w-6 text-emerald-600" />
          <h1 className="text-3xl font-bold text-slate-900">{placeName}</h1>
          <Badge variant="secondary" className="bg-blue-100 text-blue-800 border-blue-200">
            Place
          </Badge>
          {isEditMode ? (
            <Button variant="outline" size="sm" className="ml-auto" disabled>
              <Map className="h-4 w-4 mr-1" />
              View Map
            </Button>
          ) : (
            <Button asChild variant="outline" size="sm" className="ml-auto">
              <Link to={`/map?lat=${coordinates?.split(",")[0]}&lng=${coordinates?.split(",")[1]}&zoom=12`}>
                <Map className="h-4 w-4 mr-1" />
                View Map
              </Link>
            </Button>
          )}
        </div>
        <p className="text-slate-600 mb-4">Showing the closest 200 hotspots</p>
      </div>

      {hotspots && hotspots.length > 0 ? (
        <HotspotList
          hotspots={hotspots}
          queryKey={`/hotspots/nearby/${coordinates}`}
          defaultSort={{ id: "distance", desc: false }}
          showDistance={true}
          isLoading={isLoading}
        />
      ) : !isLoading ? (
        <Card className="bg-slate-50 border-slate-200">
          <CardContent>
            <p className="text-slate-700 text-center">No hotspots found near this location</p>
          </CardContent>
        </Card>
      ) : (
        <HotspotList
          hotspots={[]}
          queryKey={`/hotspots/nearby/${coordinates}`}
          defaultSort={{ id: "distance", desc: false }}
          showDistance={true}
          isLoading={isLoading}
        />
      )}
    </div>
  );
};

export default Place;
