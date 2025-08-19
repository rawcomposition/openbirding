import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, MapPin } from "lucide-react";
import type { HotspotsResponse } from "@/lib/types";

const HotspotList = () => {
  const { data, isLoading, error, refetch } = useQuery<HotspotsResponse>({
    queryKey: ["/hotspots"],
    meta: { errorMessage: "Failed to load hotspots" },
  });

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin mb-4" />
        <p className="text-lg">Loading hotspots...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <p className="text-lg text-red-200 mb-4">Error loading hotspots: {error.message}</p>
        <Button onClick={() => refetch()} variant="outline">
          Try Again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-3xl font-bold mb-2">Birding Hotspots</h2>
        <p className="text-lg opacity-90">Found {data?.count} hotspots</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {data?.hotspots.map((hotspot) => (
          <Card
            key={hotspot._id}
            className="bg-white/10 backdrop-blur-sm border-white/20 hover:bg-white/20 transition-colors"
          >
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-xl text-white">{hotspot.name}</CardTitle>
                  <p className="text-sm text-gray-300">{`${hotspot.county}, ${hotspot.state}, ${hotspot.country}`}</p>
                </div>
                <MapPin className="h-6 w-6 text-emerald-300" />
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Badge variant="secondary" className="bg-emerald-500/20 text-emerald-200 border-emerald-400/30">
                  {hotspot.species} species
                </Badge>
                <Badge variant="outline" className="text-gray-300 border-gray-400/30">
                  {hotspot.location?.coordinates?.[1]?.toFixed(4) ?? "N/A"},{" "}
                  {hotspot.location?.coordinates?.[0]?.toFixed(4) ?? "N/A"}
                </Badge>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default HotspotList;
