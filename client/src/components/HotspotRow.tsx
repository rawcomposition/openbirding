import { useState, useEffect, memo } from "react";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, Check, X, HelpCircle } from "lucide-react";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useHotspotActions, useEditMode } from "@/lib/hotspotStore";

interface HotspotRowProps {
  name: string;
  open?: boolean;
  notes?: string;
  species: number;
  lat: number;
  lng: number;
}

const HotspotRow = memo(({ name, open, notes, species, lat, lng }: HotspotRowProps) => {
  const isEditMode = useEditMode();
  const { addChange, removeChange } = useHotspotActions();
  const [localOpen, setLocalOpen] = useState<boolean | undefined>(open);
  const [localNotes, setLocalNotes] = useState<string>(notes || "");

  useEffect(() => {
    setLocalOpen(open);
    setLocalNotes(notes || "");
  }, [open, notes]);

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

  const handleOpenChange = (value: string) => {
    const boolValue = value === "true" ? true : value === "false" ? false : undefined;
    setLocalOpen(boolValue);

    if (boolValue !== open) {
      addChange(name, "open", boolValue);
    } else {
      removeChange(name);
    }
  };

  const handleNotesChange = (value: string) => {
    setLocalNotes(value);
  };

  const handleNotesBlur = () => {
    if (localNotes !== (notes || "")) {
      addChange(name, "notes", localNotes);
    } else {
      removeChange(name);
    }
  };

  return (
    <tr className="border-b border-white/10">
      <td className="p-4">
        <div className="flex items-center gap-3">
          <span className="h-5 w-5 flex items-center justify-center font-bold text-emerald-300 flex-shrink-0 row-number"></span>
          <div>
            <div className="font-medium text-white">{name}</div>
          </div>
        </div>
      </td>

      <td className="p-4">
        {isEditMode ? (
          <Select
            value={localOpen === undefined ? "unknown" : localOpen.toString()}
            onChange={(e) => handleOpenChange(e.target.value)}
            options={[
              { value: "true", label: "Yes" },
              { value: "false", label: "No" },
              { value: "unknown", label: "Unknown" },
            ]}
            className="w-32 bg-white/10 border-white/20 text-white"
          />
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
            className="min-h-[60px] max-h-[120px] min-w-[200px] md:min-w-[300px] bg-white/10 border-white/20 text-white resize-none"
            rows={2}
            placeholder="Add notes..."
          />
        ) : notes ? (
          <div className="text-sm text-gray-300 max-w-xs truncate">{notes}</div>
        ) : null}
      </td>

      <td className="p-4">
        <Badge
          variant="secondary"
          className="bg-emerald-500/20 text-emerald-200 border-emerald-400/30 whitespace-nowrap"
        >
          {species} species
        </Badge>
      </td>

      {!isEditMode && (
        <td className="p-4">
          {lat && lng ? (
            <button
              onClick={() => openGoogleMaps(lat, lng)}
              className="flex items-center gap-2 text-sm text-emerald-300 hover:text-emerald-200 transition-colors whitespace-nowrap"
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
