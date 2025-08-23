import { useQuery } from "@tanstack/react-query";
import type { Hotspot } from "@/lib/types";
import Spinner from "@/components/ui/spinner";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { ExternalLink, Bird, Calendar, Globe, Navigation } from "lucide-react";

interface HotspotDetailsProps {
  hotspotId: string | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

const HotspotDetails = ({ hotspotId, isOpen, onOpenChange }: HotspotDetailsProps) => {
  const { data: selectedHotspot, isLoading: isLoadingHotspot } = useQuery<Hotspot>({
    queryKey: ["/get-hotspot", { locationId: hotspotId }],
    enabled: !!hotspotId,
  });

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange} modal={false}>
      <SheetContent side="right" className="w-full sm:max-w-lg bg-white text-gray-900">
        <SheetHeader>
          <SheetTitle className="text-left">
            {isLoadingHotspot ? (
              <div className="flex items-center gap-2">
                <Spinner size="sm" />
                <span>Loading...</span>
              </div>
            ) : (
              selectedHotspot?.name || "Hotspot Details"
            )}
          </SheetTitle>
          <SheetDescription className="text-left">
            {selectedHotspot && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Bird className="h-4 w-4" />
                <span>{selectedHotspot.species} species</span>
              </div>
            )}
          </SheetDescription>
        </SheetHeader>

        {selectedHotspot && (
          <div className="mt-6 space-y-6">
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <Globe className="h-5 w-5 text-gray-600" />
                <div className="flex-1">
                  <p className="font-medium text-gray-900">Access Status</p>
                  <p className="text-sm text-gray-600">
                    {selectedHotspot.open === true
                      ? "Open Access"
                      : selectedHotspot.open === false
                      ? "Not Open Access"
                      : "Not Reviewed"}
                  </p>
                </div>
              </div>

              {selectedHotspot.notes && (
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="font-medium text-gray-900 mb-2">Notes</p>
                  <p className="text-sm text-gray-600">{selectedHotspot.notes}</p>
                </div>
              )}
              <div className="flex gap-3">
                <a
                  href={`https://ebird.org/hotspot/${selectedHotspot._id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-between p-3 bg-green-50 hover:bg-green-100 rounded-lg transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-green-600 rounded-lg flex items-center justify-center">
                      <span className="text-white font-bold text-lg leading-none -mt-px">e</span>
                    </div>
                    <div>
                      <p className="font-medium text-green-900">View on eBird</p>
                    </div>
                  </div>
                  <ExternalLink className="h-4 w-4 text-green-600" />
                </a>

                <a
                  href={`https://www.google.com/maps?q=${selectedHotspot.location.coordinates[1]},${selectedHotspot.location.coordinates[0]}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-between p-3 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
                      <Navigation className="h-4 w-4 text-white" />
                    </div>
                    <div>
                      <p className="font-medium text-blue-900">Get Directions</p>
                    </div>
                  </div>
                  <ExternalLink className="h-4 w-4 text-blue-500" />
                </a>
              </div>

              {selectedHotspot.updatedAt && (
                <div className="flex items-center gap-2 text-xs text-gray-500 pt-4 border-t">
                  <Calendar className="h-3 w-3" />
                  <span>Last updated: {new Date(selectedHotspot.updatedAt).toLocaleDateString()}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};

export default HotspotDetails;
