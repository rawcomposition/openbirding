import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { FilterButton } from "@/components/FilterButton";
import { useBirdFinderStore } from "@/stores/birdFinderStore";
import { cn } from "@/lib/utils";

const PRESET_VALUES = [2, 5, 10, 25, 50, 100];

export function MinObservationsFilter() {
  const { minObservations, setMinObservations } = useBirdFinderStore();
  const [open, setOpen] = useState(false);

  const getDisplayValue = () => {
    if (minObservations == null) return null;
    return `${minObservations}+ sightings`;
  };

  const handleSelect = (value: number) => {
    setMinObservations(value);
    setOpen(false);
  };

  return (
    <FilterButton
      label="Min Sightings"
      value={getDisplayValue()}
      onClear={() => setMinObservations(null)}
      open={open}
      onOpenChange={setOpen}
    >
      <div className="p-4">
        <div className="space-y-2">
          <Label>Minimum Sightings</Label>
          <div className="grid grid-cols-3 gap-1.5">
            {PRESET_VALUES.map((value) => (
              <Button
                key={value}
                variant="outline"
                size="sm"
                onClick={() => handleSelect(value)}
                className={cn(
                  "h-9",
                  minObservations === value &&
                    "bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700 hover:text-white"
                )}
              >
                {value}
              </Button>
            ))}
          </div>
        </div>
      </div>
    </FilterButton>
  );
}
