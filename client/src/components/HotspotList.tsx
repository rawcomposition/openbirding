import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, MapPin } from "lucide-react";

type Hotspot = {
  id: string;
  name: string;
  location: string;
  description: string;
  habitat: string;
  imageUrl?: string;
};

type HotspotsResponse = {
  hotspots: Hotspot[];
  count: number;
};

const fetchHotspots = async (): Promise<HotspotsResponse> => {
  const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:3000";
  const response = await fetch(`${apiUrl}/api/hotspots`);
  if (!response.ok) {
    throw new Error("Failed to fetch hotspots");
  }
  return response.json();
};

const HotspotList = () => {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["hotspots"],
    queryFn: fetchHotspots,
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
            key={hotspot.id}
            className="bg-white/10 backdrop-blur-sm border-white/20 hover:bg-white/20 transition-colors"
          >
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-xl text-white">{hotspot.name}</CardTitle>
                  <p className="text-sm text-gray-300">{hotspot.location}</p>
                </div>
                <MapPin className="h-6 w-6 text-emerald-300" />
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Badge variant="secondary" className="bg-emerald-500/20 text-emerald-200 border-emerald-400/30">
                  {hotspot.habitat}
                </Badge>
              </div>
              <p className="text-sm text-gray-200">{hotspot.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default HotspotList;
