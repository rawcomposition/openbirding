import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, Bird, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";

type Hotspot = {
  _id: string;
  name: string;
  region: string;
  species: number;
  location: {
    type: "Point";
    coordinates: [number, number];
  };
  updatedAt: Date;
  tags?: string[];
};

type Region = {
  _id: string;
  name: string;
  isCountry?: boolean;
};

const Region = () => {
  const { regionCode } = useParams<{ regionCode: string }>();
  const navigate = useNavigate();

  const {
    data: region,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["region", regionCode],
    queryFn: async () => {
      const response = await fetch(`/api/regions/${regionCode}`);
      if (!response.ok) {
        throw new Error("Failed to fetch region");
      }
      return response.json() as Promise<Region>;
    },
    enabled: !!regionCode,
  });

  const { data: hotspots } = useQuery({
    queryKey: ["region-hotspots", regionCode],
    queryFn: async () => {
      const response = await fetch(`/api/regions/${regionCode}/hotspots`);
      if (!response.ok) {
        throw new Error("Failed to fetch region hotspots");
      }
      return response.json() as Promise<{ hotspots: Hotspot[] }>;
    },
    enabled: !!regionCode,
  });

  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="animate-pulse">
          <div className="h-8 bg-slate-700 rounded w-1/3 mb-4"></div>
          <div className="h-4 bg-slate-700 rounded w-1/2 mb-8"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-48 bg-slate-700 rounded"></div>
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
          {region.isCountry && (
            <Badge variant="secondary" className="bg-emerald-600/20 text-emerald-300 border-emerald-500/30">
              Country
            </Badge>
          )}
        </div>
        <p className="text-slate-300 text-lg">Region Code: {regionCode}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {hotspots?.hotspots?.map((hotspot: Hotspot) => (
          <Card key={hotspot._id} className="bg-slate-800/50 border-slate-700 hover:bg-slate-700/50 transition-colors">
            <CardHeader>
              <CardTitle className="text-white text-lg">{hotspot.name}</CardTitle>
              <CardDescription className="text-slate-300">
                <div className="flex items-center gap-2">
                  <Bird className="h-4 w-4" />
                  <span>{hotspot.species} species</span>
                </div>
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <Calendar className="h-4 w-4" />
                <span>Updated {new Date(hotspot.updatedAt).toLocaleDateString()}</span>
              </div>
              {hotspot.tags && hotspot.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-3">
                  {hotspot.tags.map((tag: string) => (
                    <Badge key={tag} variant="outline" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {(!hotspots || hotspots.hotspots.length === 0) && (
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="pt-6">
            <p className="text-slate-300 text-center">No hotspots found in this region</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default Region;
