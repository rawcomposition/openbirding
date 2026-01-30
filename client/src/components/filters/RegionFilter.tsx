import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { FilterButton } from "@/components/FilterButton";
import { useBirdFinderStore } from "@/stores/birdFinderStore";

export function RegionFilter() {
  const { region, setRegion } = useBirdFinderStore();
  const [open, setOpen] = useState(false);
  const [regionCode, setRegionCode] = useState(region?.regionCode || "");

  const getDisplayValue = () => {
    if (!region) return null;
    return region.regionName || region.regionCode;
  };

  const handleApplyRegion = () => {
    if (!regionCode.trim()) return;
    setRegion({
      regionCode: regionCode.trim().toUpperCase(),
      regionName: regionCode.trim().toUpperCase(),
    });
    setOpen(false);
  };

  const handleClear = () => {
    setRegion(null);
    setRegionCode("");
    setOpen(false);
  };

  return (
    <FilterButton
      label="Region"
      value={getDisplayValue()}
      onClear={() => setRegion(null)}
      open={open}
      onOpenChange={setOpen}
    >
      <div className="w-[320px] p-4 space-y-4">
        <div className="space-y-2">
          <Label htmlFor="region-code">Region Code</Label>
          <Input
            id="region-code"
            placeholder="e.g., US-CA, US-CA-037"
            value={regionCode}
            onChange={(e) => setRegionCode(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleApplyRegion()}
          />
          <p className="text-xs text-slate-500">Enter a country, state, or county code</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleClear} variant="outline" className="flex-1">
            Clear
          </Button>
          <Button onClick={handleApplyRegion} variant="primary" className="flex-1" disabled={!regionCode.trim()}>
            Apply
          </Button>
        </div>
      </div>
    </FilterButton>
  );
}
