import { useState, useEffect, memo } from "react";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, Check, X, HelpCircle } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useEditActions, useEditMode } from "@/lib/editStore";

type HotspotRowProps = {
  id: string;
  name: string;
  open: boolean | null;
  notes?: string;
  species: number;
  lat: number;
  lng: number;
  distance?: number;
  showDistance?: boolean;
};

const HotspotRow = memo(({ id, name, open, notes, species, lat, lng, distance, showDistance }: HotspotRowProps) => {
  const isEditMode = useEditMode();
  const { addChange, removeChange } = useEditActions();
  const [localOpen, setLocalOpen] = useState<boolean | null>(open);
  const [localNotes, setLocalNotes] = useState<string>(notes || "");

  useEffect(() => {
    setLocalOpen(open);
    setLocalNotes(notes || "");
  }, [open, notes]);

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

  const handleOpenChange = (value: string) => {
    const boolValue = value === "true" ? true : value === "false" ? false : null;
    setLocalOpen(boolValue);

    if (boolValue !== open) {
      addChange(id, "open", boolValue);
    } else {
      removeChange(id);
    }
  };

  const handleNotesChange = (value: string) => {
    setLocalNotes(value);
  };

  const handleNotesBlur = () => {
    if (localNotes !== (notes || "")) {
      addChange(id, "notes", localNotes);
    } else {
      removeChange(id);
    }
  };

  return (
    <tr className="border-b border-white/10">
      <td className="p-4">
        <div className="flex items-center gap-3">
          <span className="h-5 w-5 flex items-center justify-center font-bold text-emerald-300 flex-shrink-0 row-number"></span>
          <div>
            <div className="font-medium text-white">{name}</div>
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
          <RadioGroup
            value={localOpen === null ? "unknown" : localOpen.toString()}
            onValueChange={handleOpenChange}
            className="flex gap-4"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="true" id={`open-yes-${id}`} />
              <label htmlFor={`open-yes-${id}`} className="text-sm text-slate-200 cursor-pointer">
                Yes
              </label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="false" id={`open-no-${id}`} />
              <label htmlFor={`open-no-${id}`} className="text-sm text-slate-200 cursor-pointer">
                No
              </label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="unknown" id={`open-unknown-${id}`} />
              <label htmlFor={`open-unknown-${id}`} className="text-sm text-slate-200 cursor-pointer">
                Unknown
              </label>
            </div>
          </RadioGroup>
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
              {distance < 10000 ? `${(distance / 1000).toFixed(1)} km` : `${Math.round(distance / 1000)} km`}
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
