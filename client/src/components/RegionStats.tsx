import { Card, CardContent } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { MapPin, CheckCircle, Eye } from "lucide-react";

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

  const openPercentage = hotspotCount > 0 ? Math.round((openHotspotCount / hotspotCount) * 100) : 0;
  const reviewedPercentage = hotspotCount > 0 ? Math.round((reviewedHotspotCount / hotspotCount) * 100) : 0;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <Card className="bg-gradient-to-br from-slate-50 to-white border-slate-200">
        <CardContent className="px-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-slate-600 mb-1">Total Hotspots</div>
              <div className="text-3xl font-bold text-slate-900">
                {isLoading ? "..." : hotspotCount.toLocaleString()}
              </div>
            </div>
            <div className="p-3 bg-slate-100 rounded-full">
              <MapPin className="h-6 w-6 text-slate-600" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-gradient-to-br from-emerald-50/60 to-white border-emerald-200">
        <CardContent className="px-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-emerald-700 mb-1">Open Access</div>
              <div className="text-3xl font-bold text-emerald-600">
                {isLoading ? "..." : openHotspotCount.toLocaleString()}
              </div>
              <div className="text-xs text-emerald-600 mt-1">{openPercentage}% of total</div>
            </div>
            <div className="p-3 bg-emerald-100 rounded-full">
              <CheckCircle className="h-6 w-6 text-emerald-600" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-gradient-to-br from-blue-50/60 to-white border-blue-200">
        <CardContent className="px-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-blue-700 mb-1">Reviewed</div>
              <div className="text-3xl font-bold text-blue-600">
                {isLoading ? "..." : reviewedHotspotCount.toLocaleString()}
              </div>
              <div className="text-xs text-blue-600 mt-1">{reviewedPercentage}% of total</div>
            </div>
            <div className="p-3 bg-blue-100 rounded-full">
              <Eye className="h-6 w-6 text-blue-600" />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default RegionStats;
