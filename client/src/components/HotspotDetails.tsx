import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import type { Hotspot } from "@/lib/types";
import Spinner from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import {
  ExternalLink,
  Bird,
  Calendar,
  Navigation,
  CheckCircle,
  XCircle,
  HelpCircle,
  Pencil,
  Save,
  X,
} from "lucide-react";
import { useModalStore } from "@/lib/modalStore";
import { useAuthStore } from "@/lib/authStore";
import { useLoginRedirect } from "@/hooks/useLoginRedirect";
import { Textarea } from "@/components/ui/textarea";
import { mutate } from "@/lib/utils";
import toast from "react-hot-toast";
import InputOpenAccess from "@/components/InputOpenAccess";
import { NOTES_CHARACTER_LIMIT } from "@/lib/config";

const HotspotDetails = () => {
  const { isOpen, hotspotId, closeModal } = useModalStore();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const { redirectToLogin } = useLoginRedirect();
  const [localOpen, setLocalOpen] = useState<boolean | null>(null);
  const [localNotes, setLocalNotes] = useState<string>("");
  const [isEditing, setIsEditing] = useState(false);

  const { data: selectedHotspot, isLoading: isLoadingHotspot } = useQuery<Hotspot>({
    queryKey: [`/hotspots/${hotspotId}`],
    enabled: !!hotspotId,
  });

  useEffect(() => {
    if (selectedHotspot) {
      setLocalOpen(selectedHotspot.open);
      setLocalNotes(selectedHotspot.notes || "");
    }
  }, [selectedHotspot]);

  const saveChangesMutation = useMutation({
    mutationFn: async (changes: Array<{ id: string; open?: boolean | null; notes?: string }>) => {
      return mutate("PUT", "/hotspots/bulk-update", changes);
    },
    onSuccess: () => {
      toast.success("Changes saved successfully!");
      setIsEditing(false);
      queryClient.invalidateQueries({ queryKey: [`/hotspots/${hotspotId}`] });
      queryClient.invalidateQueries({ queryKey: ["/hotspots/within-bounds"] });
      queryClient.invalidateQueries({ queryKey: ["/hotspots/by-region"] });
      queryClient.invalidateQueries({ queryKey: ["/hotspots/nearby"] });
    },
    onError: (error) => {
      toast.error(`Failed to save changes: ${error.message}`);
    },
  });

  const handleOpenChange = (value: boolean | null) => {
    setLocalOpen(value);
  };

  const handleNotesChange = (value: string) => {
    setLocalNotes(value);
  };

  const handleSaveChanges = () => {
    const changes = [{ id: hotspotId!, open: localOpen, notes: localNotes }];
    saveChangesMutation.mutate(changes);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setLocalOpen(selectedHotspot?.open || null);
    setLocalNotes(selectedHotspot?.notes || "");
  };

  const handleEditClick = () => {
    if (!user) {
      redirectToLogin();
      return;
    }
    setIsEditing(true);
  };

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
                {!isEditing ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="absolute top-2 right-2 h-auto px-2 py-1"
                    onClick={handleEditClick}
                  >
                    <Pencil className="size-3 mr-px" />
                    Edit
                  </Button>
                ) : null}

                {!isEditing ? (
                  <>
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
                  </>
                ) : (
                  <>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Open Access</label>
                        <InputOpenAccess value={localOpen} onChange={handleOpenChange} size="md" theme="light" />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Notes</label>
                        <Textarea
                          value={localNotes}
                          onChange={(e) => handleNotesChange(e.target.value)}
                          className="min-h-[80px] bg-white border-gray-300 text-gray-900 resize-none"
                          placeholder="Add notes about this hotspot..."
                          rows={3}
                          maxLength={NOTES_CHARACTER_LIMIT}
                        />
                        <div className="flex gap-2 mt-3">
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={handleSaveChanges}
                            disabled={saveChangesMutation.isPending}
                          >
                            <Save className="size-4" />
                            {saveChangesMutation.isPending ? "Saving..." : "Save"}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-auto px-3 py-2 text-gray-700 hover:text-gray-800"
                            onClick={handleCancelEdit}
                          >
                            <X className="size-4" />
                            Cancel
                          </Button>
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {!isEditing && selectedHotspot.updatedAt && (
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
