import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { FilterButton } from "@/components/FilterButton";
import { useBirdFinderStore } from "@/stores/birdFinderStore";
import RegionSearch from "@/components/RegionSearch";

export function RegionFilter() {
  const { region, setRegion } = useBirdFinderStore();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(region);

  const getDisplayValue = () => {
    if (!region) return null;
    return region.regionName || region.regionCode;
  };

  const handleApply = () => {
    setRegion(selected);
    setOpen(false);
  };

  const handleClear = () => {
    setRegion(null);
    setSelected(null);
    setOpen(false);
  };

  return (
    <FilterButton
      label="Region"
      value={getDisplayValue()}
      onClear={() => setRegion(null)}
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setSelected(region);
        }
      }}
    >
      <div className="w-[320px] p-4 space-y-4">
        <div className="space-y-2">
          <Label>Region</Label>
          <RegionSearch value={selected} onChange={setSelected} />
        </div>
        <div className="flex gap-2">
          <Button onClick={handleClear} variant="outline" className="flex-1">
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
