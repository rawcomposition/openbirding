import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Bird } from "lucide-react";

interface Bird {
  id: string;
  name: string;
  scientificName: string;
  family: string;
  habitat: string;
  imageUrl?: string;
}

interface BirdsResponse {
  birds: Bird[];
  count: number;
}

const fetchBirds = async (): Promise<BirdsResponse> => {
  const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:3000";
  const response = await fetch(`${apiUrl}/api/birds`);
  if (!response.ok) {
    throw new Error("Failed to fetch birds");
  }
  return response.json();
};

const BirdList = () => {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["birds"],
    queryFn: fetchBirds,
  });

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin mb-4" />
        <p className="text-lg">Loading birds...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <p className="text-lg text-red-200 mb-4">Error loading birds: {error.message}</p>
        <Button onClick={() => refetch()} variant="outline">
          Try Again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-3xl font-bold mb-2">Bird Species</h2>
        <p className="text-lg opacity-90">Found {data?.count} species</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {data?.birds.map((bird) => (
          <Card
            key={bird.id}
            className="bg-white/10 backdrop-blur-sm border-white/20 hover:bg-white/20 transition-colors"
          >
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-xl text-white">{bird.name}</CardTitle>
                  <p className="text-sm text-gray-300 italic">{bird.scientificName}</p>
                </div>
                <Bird className="h-6 w-6 text-blue-300" />
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Badge variant="secondary" className="bg-blue-500/20 text-blue-200 border-blue-400/30">
                  {bird.family}
                </Badge>
              </div>
              <p className="text-sm text-gray-200">
                <span className="font-medium">Habitat:</span> {bird.habitat}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default BirdList;
