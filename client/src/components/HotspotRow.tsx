import { useState, useEffect, memo } from "react";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, Check, X, HelpCircle } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { useEditActions, useEditMode } from "@/lib/editStore";
import { useModalStore } from "@/lib/modalStore";
import InputOpenAccess from "@/components/InputOpenAccess";
import { NOTES_CHARACTER_LIMIT } from "@/lib/config";

type HotspotRowProps = {
  id: string;
  name: string;
  open: boolean | null;
  notes: string | null;
  species: number;
  lat: number;
  lng: number;
  distance?: number;
  showDistance?: boolean;
};

const HotspotRow = memo(({ id, name, open, notes, species, lat, lng, distance, showDistance }: HotspotRowProps) => {
  const isEditMode = useEditMode();
  const { addChange } = useEditActions();
  const { openModal } = useModalStore();
  const [localOpen, setLocalOpen] = useState<boolean | null>(open);
  const [localNotes, setLocalNotes] = useState<string>(notes || "");

  useEffect(() => {
    setLocalOpen(open);
    setLocalNotes(notes || "");
  }, [open, notes]);

  useEffect(() => {
    if (!isEditMode) {
      setLocalOpen(open);
      setLocalNotes(notes || "");
    }
  }, [isEditMode, open, notes]);

  const openGoogleMaps = (lat: number, lng: number) => {
    const url = `https://www.google.com/maps?q=${lat},${lng}&z=15&t=m`;
    window.open(url, "_blank");
  };

  const getOpenAccessIcon = (open: boolean | null) => {
    if (open === true) {
      return <Check className="h-4 w-4 text-green-400" />;
    } else if (open === false) {
      return <X className="h-4 w-4 text-red-400" />;
    } else {
      return <HelpCircle className="h-4 w-4 text-gray-400" />;
    }
  };

  const handleOpenChange = (value: boolean | null) => {
    setLocalOpen(value);

    addChange(id, "open", value, open);
  };

  const handleNotesChange = (value: string) => {
    setLocalNotes(value);
  };

  const handleNotesBlur = () => {
    addChange(id, "notes", localNotes, notes || "");
  };

  return (
    <tr className="border-b border-white/10">
      <td className="p-4">
        <div className="flex items-center gap-3">
          <span className="h-5 w-5 flex items-center justify-center font-bold text-emerald-300 flex-shrink-0 row-number"></span>
          <div>
            <div
              className="font-medium text-white cursor-pointer hover:text-emerald-200 transition-colors"
              onClick={() => openModal(id)}
            >
              {name}
            </div>
            {isEditMode && (
              <div className="flex gap-4 mt-1">
                {lat && lng && (
                  <a
                    href={`https://www.google.com/maps?q=${lat},${lng}&z=15&t=m`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-emerald-300 hover:text-emerald-200 transition-colors"
                  >
                    <ExternalLink className="h-3 w-3" />
                    View Map
                  </a>
                )}
                <a
                  href={`https://ebird.org/hotspot/${id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-emerald-300 hover:text-emerald-200 transition-colors"
                >
                  <ExternalLink className="h-3 w-3" />
                  eBird
                </a>
              </div>
            )}
          </div>
        </div>
      </td>

      <td className="p-4 w-0 whitespace-nowrap">
        {isEditMode ? (
          <InputOpenAccess value={localOpen} onChange={handleOpenChange} size="sm" />
        ) : (
          getOpenAccessIcon(open)
        )}
      </td>

      <td className="p-4">
        {isEditMode ? (
          <Textarea
            value={localNotes}
            onChange={(e) => handleNotesChange(e.target.value)}
            onBlur={handleNotesBlur}
            className="min-h-[60px] max-h-[120px] min-w-[200px] md:min-w-[300px] bg-white/10 border-white/20 text-white resize-none text-[15px]"
            rows={2}
            placeholder="Add notes..."
            maxLength={NOTES_CHARACTER_LIMIT}
          />
        ) : notes ? (
          <div className="text-sm text-gray-300 max-w-xs">{notes}</div>
        ) : null}
      </td>

      <td className="p-4 w-0 whitespace-nowrap">
        <Badge
          variant="secondary"
          className="bg-emerald-500/20 text-emerald-200 border-emerald-400/30 whitespace-nowrap"
        >
          {species}
        </Badge>
      </td>

      {showDistance && (
        <td className="p-4 w-0 whitespace-nowrap">
          {distance !== undefined ? (
            <span className="text-sm text-gray-300">
              {distance < 10 ? `${distance.toFixed(1)} km` : `${Math.round(distance)} km`}
            </span>
          ) : (
            <span className="text-sm text-gray-500">-</span>
          )}
        </td>
      )}

      {!isEditMode && (
        <td className="p-4 w-0 whitespace-nowrap">
          {lat && lng ? (
            <button
              onClick={() => openGoogleMaps(lat, lng)}
              className="flex items-center gap-2 text-sm text-emerald-300 hover:text-emerald-200 transition-colors whitespace-nowrap cursor-pointer"
            >
              <ExternalLink className="h-4 w-4" />
              View Map
            </button>
          ) : (
            <span className="text-sm text-gray-500">N/A</span>
          )}
        </td>
      )}
    </tr>
  );
});

HotspotRow.displayName = "HotspotRow";

export default HotspotRow;
