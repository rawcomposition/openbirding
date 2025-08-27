import { Card, CardContent } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";

interface RegionStatsProps {
  regionCode: string;
}

interface RegionStatsData {
  hotspotCount: number;
  openHotspotCount: number;
  reviewedHotspotCount: number;
}

const RegionStats = ({ regionCode }: RegionStatsProps) => {
  const { data: stats, isLoading } = useQuery<RegionStatsData>({
    queryKey: [`/regions/${regionCode}/stats`],
    refetchOnWindowFocus: false,
  });

  const hotspotCount = stats?.hotspotCount || 0;
  const openHotspotCount = stats?.openHotspotCount || 0;
  const reviewedHotspotCount = stats?.reviewedHotspotCount || 0;

  return (
    <div className="flex gap-4">
      <Card className="bg-white/10 backdrop-blur-sm border-white/20 min-w-[120px] py-0">
        <CardContent className="p-4">
          <div className="text-sm text-gray-300 mb-1">Hotspots</div>
          <div className="text-2xl font-bold text-white">{isLoading ? "..." : hotspotCount.toLocaleString()}</div>
        </CardContent>
      </Card>

      <Card className="bg-white/10 backdrop-blur-sm border-white/20 min-w-[120px] py-0">
        <CardContent className="p-4">
          <div className="text-sm text-gray-300 mb-1">Reviewed</div>
          <div className="text-2xl font-bold text-white">
            {isLoading ? "..." : reviewedHotspotCount.toLocaleString()}
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white/10 backdrop-blur-sm border-white/20 min-w-[120px] py-0">
        <CardContent className="p-4">
          <div className="text-sm text-gray-300 mb-1">Open</div>
          <div className="text-2xl font-bold text-blue-400">
            {isLoading ? "..." : openHotspotCount.toLocaleString()}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default RegionStats;
