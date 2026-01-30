import { useState } from "react";
import { Label } from "@/components/ui/label";
import { FilterButton } from "@/components/FilterButton";
import { useBirdFinderStore } from "@/stores/birdFinderStore";
import RegionSearch from "@/components/RegionSearch";

export function RegionFilter() {
  const { region, setRegion } = useBirdFinderStore();
  const [open, setOpen] = useState(false);

  const getDisplayValue = () => {
    if (!region) return null;
    return region.regionName || region.regionCode;
  };

  const handleChange = (value: { regionCode: string; regionName: string } | null) => {
    setRegion(value);
    if (value) {
      setOpen(false);
    }
  };

  return (
    <FilterButton
      label="Region"
      value={getDisplayValue()}
      onClear={() => setRegion(null)}
      open={open}
      onOpenChange={setOpen}
    >
      <div className="w-[320px] p-4">
        <div className="space-y-2">
          <Label>Region</Label>
          <RegionSearch value={null} onChange={handleChange} />
        </div>
      </div>
    </FilterButton>
  );
}
