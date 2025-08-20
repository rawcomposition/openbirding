import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin } from "lucide-react";
import type { Hotspot } from "@/lib/types";

type Props = {
  hotspots: Hotspot[];
  showCount?: boolean;
};

const HotspotList = ({ hotspots, showCount = true }: Props) => {
  return (
    <div className="space-y-6">
      <div>{showCount && <p className="text-gray-300">Found {hotspots.length} hotspots</p>}</div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {hotspots.map((hotspot) => (
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
