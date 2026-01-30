import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { FilterButton } from "@/components/FilterButton";
import { useBirdFinderStore } from "@/stores/birdFinderStore";

const MIN_VALUE = 2;
const MAX_VALUE = 100;

export function MinObservationsFilter() {
  const { minObservations, setMinObservations } = useBirdFinderStore();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(minObservations || MIN_VALUE);

  const getDisplayValue = () => {
    if (minObservations == null) return null;
    return `${minObservations}+ sightings`;
  };

  const handleApply = () => {
    setMinObservations(value);
    setOpen(false);
  };

  return (
    <FilterButton
      label="Min Sightings"
      value={getDisplayValue()}
      onClear={() => {
        setMinObservations(null);
        setValue(MIN_VALUE);
      }}
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setValue(minObservations || MIN_VALUE);
        }
      }}
    >
      <div className="p-4 space-y-4 w-[280px]">
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <Label>Minimum Sightings</Label>
            <span className="text-lg font-semibold text-emerald-600">{value}+</span>
          </div>
          <Slider
            value={[value]}
            onValueChange={([v]) => setValue(v)}
            min={MIN_VALUE}
            max={MAX_VALUE}
            step={1}
            className="[&_[data-slot=slider-range]]:bg-emerald-600 [&_[data-slot=slider-thumb]]:border-emerald-600"
          />
          <div className="flex justify-between text-xs text-slate-500">
            <span>{MIN_VALUE}</span>
            <span>{MAX_VALUE}</span>
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            onClick={() => {
              setMinObservations(null);
              setValue(MIN_VALUE);
              setOpen(false);
            }}
            variant="outline"
            className="flex-1"
          >
            Clear
          </Button>
          <Button onClick={handleApply} variant="primary" className="flex-1">
            Apply
          </Button>
        </div>
      </div>
    </FilterButton>
  );
}
