import { Badge } from "@/components/ui/badge";
import { MapPin, ExternalLink, Check, X, HelpCircle } from "lucide-react";
import type { Hotspot } from "@/lib/types";

type Props = {
  hotspots: Hotspot[];
  showCount?: boolean;
};

const HotspotList = ({ hotspots, showCount = true }: Props) => {
  const openGoogleMaps = (lat: number, lng: number) => {
    const url = `https://www.google.com/maps?q=${lat},${lng}&z=15&t=m`;
    window.open(url, "_blank");
  };

  const getOpenAccessIcon = (open: boolean | undefined) => {
    if (open === true) {
      return <Check className="h-4 w-4 text-green-400" />;
    } else if (open === false) {
      return <X className="h-4 w-4 text-red-400" />;
    } else {
      return <HelpCircle className="h-4 w-4 text-gray-400" />;
    }
  };

  return (
    <div className="space-y-4">
      {showCount && <p className="text-gray-300">Found {hotspots.length} hotspots</p>}

      <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/20">
                <th className="text-left p-4 text-sm font-medium text-gray-300">Name</th>
                <th className="text-left p-4 text-sm font-medium text-gray-300">Open Access</th>
                <th className="text-left p-4 text-sm font-medium text-gray-300">Notes</th>
                <th className="text-left p-4 text-sm font-medium text-gray-300">Species</th>
                <th className="text-left p-4 text-sm font-medium text-gray-300">Map</th>
              </tr>
            </thead>
            <tbody>
              {hotspots.map((hotspot, index) => (
                <tr key={hotspot._id} className={index < hotspots.length - 1 ? "border-b border-white/10" : ""}>
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <MapPin className="h-5 w-5 text-emerald-300 flex-shrink-0" />
                      <div>
                        <div className="font-medium text-white">{hotspot.name}</div>
                      </div>
                    </div>
                  </td>
                  <td className="p-4">{getOpenAccessIcon(hotspot.open)}</td>
                  {hotspot.notes && (
                    <td className="p-4">
                      <div className="text-sm text-gray-300 max-w-xs truncate">{hotspot.notes}</div>
                    </td>
                  )}
                  <td className="p-4">
                    <Badge variant="secondary" className="bg-emerald-500/20 text-emerald-200 border-emerald-400/30">
                      {hotspot.species} species
                    </Badge>
                  </td>
                  <td className="p-4">
                    {hotspot.location?.coordinates ? (
                      <button
                        onClick={() => openGoogleMaps(hotspot.location.coordinates[1], hotspot.location.coordinates[0])}
                        className="flex items-center gap-2 text-sm text-emerald-300 hover:text-emerald-200 transition-colors"
                      >
                        <ExternalLink className="h-4 w-4" />
                        View Map
                      </button>
                    ) : (
                      <span className="text-sm text-gray-500">N/A</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default HotspotList;
