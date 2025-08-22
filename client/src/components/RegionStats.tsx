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
  if (isLoading) {
    return (
      <div className="flex gap-4">
        {[...Array(3)].map((_, i) => (
          <Card key={i} className="bg-white/10 backdrop-blur-sm border-white/20 min-w-[120px]">
            <CardContent className="p-4">
              <div className="animate-pulse">
                <div className="h-4 bg-slate-700 rounded w-16 mb-2"></div>
                <div className="h-6 bg-slate-700 rounded w-12"></div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="flex gap-4">
      <Card className="bg-white/10 backdrop-blur-sm border-white/20 min-w-[120px] py-0">
        <CardContent className="px-4 py-4">
          <div className="text-sm text-gray-300 mb-1">Hotspots</div>
          <div className="text-2xl font-bold text-white">{hotspotCount.toLocaleString()}</div>
        </CardContent>
      </Card>

      <Card className="bg-white/10 backdrop-blur-sm border-white/20 min-w-[120px] py-0">
        <CardContent className="px-4 py-4">
          <div className="text-sm text-gray-300 mb-1">Reviewed</div>
          <div className="text-2xl font-bold text-white">{reviewedHotspotCount.toLocaleString()}</div>
        </CardContent>
      </Card>

      <Card className="bg-white/10 backdrop-blur-sm border-white/20 min-w-[120px] py-0">
        <CardContent className="px-4 py-4">
          <div className="text-sm text-gray-300 mb-1">Open</div>
          <div className="text-2xl font-bold text-blue-400">{openHotspotCount.toLocaleString()}</div>
        </CardContent>
      </Card>
    </div>
  );
};

export default RegionStats;
