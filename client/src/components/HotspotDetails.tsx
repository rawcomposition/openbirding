import { useQuery } from "@tanstack/react-query";
import type { Hotspot } from "@/lib/types";
import Spinner from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { ExternalLink, Bird, Calendar, Navigation, CheckCircle, XCircle, HelpCircle, Pencil } from "lucide-react";
import { useModalStore } from "@/lib/modalStore";

const HotspotDetails = () => {
  const { isOpen, hotspotId, closeModal } = useModalStore();

  const { data: selectedHotspot, isLoading: isLoadingHotspot } = useQuery<Hotspot>({
    queryKey: [`/hotspots/${hotspotId}`],
    enabled: !!hotspotId,
  });

  return (
    <Sheet open={isOpen} onOpenChange={closeModal} modal={false}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-lg bg-white text-gray-900"
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
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
              <span className="flex items-center gap-2 text-sm text-gray-600">
                <Bird className="h-4 w-4" />
                <span>{selectedHotspot.species} species</span>
              </span>
            )}
          </SheetDescription>
        </SheetHeader>

        {selectedHotspot && (
          <div className="mt-6 space-y-6">
            <div className="space-y-4">
              <div className="p-3 bg-gray-50 rounded-lg relative">
                <Button variant="ghost" size="sm" className="absolute top-2 right-2 h-auto px-2 py-1">
                  <Pencil className="size-3 mr-px" />
                  Edit
                </Button>
                <div className="flex items-center gap-3">
                  {selectedHotspot.open === true ? (
                    <>
                      <CheckCircle className="text-blue-600" />
                      <span className="text-base font-medium text-gray-900">Open Access</span>
                    </>
                  ) : selectedHotspot.open === false ? (
                    <>
                      <XCircle className="text-red-600" />
                      <span className="text-base font-medium text-gray-900">Not Open Access</span>
                    </>
                  ) : (
                    <>
                      <HelpCircle className="text-gray-400" />
                      <span className="text-base font-medium text-gray-900">Not Reviewed</span>
                    </>
                  )}
                </div>
                {selectedHotspot.notes && (
                  <div className="mt-3 pt-3 border-t border-gray-200">
                    <p className="text-sm text-gray-800">{selectedHotspot.notes}</p>
                  </div>
                )}
                {selectedHotspot.updatedAt && (
                  <div className="mt-3">
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <Calendar className="h-3 w-3" />
                      <span>Last updated: {new Date(selectedHotspot.updatedAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-2">
                <h3 className="text-sm font-medium text-gray-700 mb-3">External Links</h3>
                <div className="flex flex-wrap gap-4">
                  <a
                    href={`https://ebird.org/hotspot/${selectedHotspot.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-blue-800 hover:text-blue-900 hover:underline transition-colors"
                  >
                    <ExternalLink className="h-4 w-4" />
                    <span className="text-sm">View on eBird</span>
                  </a>

                  <a
                    href={`https://www.google.com/maps?q=${selectedHotspot.lat},${selectedHotspot.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-blue-800 hover:text-blue-900 hover:underline transition-colors"
                  >
                    <Navigation className="h-4 w-4" />
                    <span className="text-sm">Get Directions</span>
                  </a>
                </div>
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};

export default HotspotDetails;
