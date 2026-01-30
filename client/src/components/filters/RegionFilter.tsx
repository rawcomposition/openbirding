import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { FilterButton } from "@/components/FilterButton";
import { useBirdFinderStore, type RegionType } from "@/stores/birdFinderStore";

const MIN_RADIUS = 5;
const MAX_RADIUS = 250;
const DEFAULT_RADIUS = 50;

export function RegionFilter() {
  const { region, setRegion } = useBirdFinderStore();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<RegionType>(region?.type || "region");

  // Local state for form inputs
  const [regionCode, setRegionCode] = useState(region?.regionCode || "");
  const [selectedRadius, setSelectedRadius] = useState(region?.radius?.km || DEFAULT_RADIUS);

  const getDisplayValue = () => {
    if (!region) return null;
    switch (region.type) {
      case "region":
        return region.regionName || region.regionCode;
      case "radius":
        return region.radius ? `${region.radius.km} km radius` : null;
      case "custom":
        return "Custom area";
      default:
        return null;
    }
  };

  const handleApplyRegion = () => {
    if (!regionCode.trim()) return;
    setRegion({
      type: "region",
      regionCode: regionCode.trim().toUpperCase(),
      regionName: regionCode.trim().toUpperCase(), // Will be replaced with actual name from API later
    });
    setOpen(false);
  };

  const handleApplyRadius = () => {
    // For now, use a placeholder location - will be connected to location picker later
    setRegion({
      type: "radius",
      radius: {
        lat: 0,
        lng: 0,
        km: selectedRadius,
        locationName: "Current location",
      },
    });
    setOpen(false);
  };

  const handleApplyCustom = () => {
    setRegion({
      type: "custom",
      customArea: {},
    });
    setOpen(false);
  };

  const handleClear = () => {
    setRegion(null);
    setRegionCode("");
    setSelectedRadius(DEFAULT_RADIUS);
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
      <Tabs value={tab} onValueChange={(v) => setTab(v as RegionType)} className="w-[320px]">
        <TabsList className="w-full grid grid-cols-3 p-1 bg-slate-100">
          <TabsTrigger value="region" className="text-xs">
            Region
          </TabsTrigger>
          <TabsTrigger value="radius" className="text-xs">
            Radius
          </TabsTrigger>
          <TabsTrigger value="custom" className="text-xs">
            Custom
          </TabsTrigger>
        </TabsList>

        <TabsContent value="region" className="p-4 space-y-4">
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
        </TabsContent>

        <TabsContent value="radius" className="p-4 space-y-4">
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <Label>Search Radius</Label>
              <span className="text-lg font-semibold text-emerald-600">{selectedRadius} km</span>
            </div>
            <Slider
              value={[selectedRadius]}
              onValueChange={([v]) => setSelectedRadius(v)}
              min={MIN_RADIUS}
              max={MAX_RADIUS}
              step={5}
              className="[&_[data-slot=slider-range]]:bg-emerald-600 [&_[data-slot=slider-thumb]]:border-emerald-600"
            />
            <div className="flex justify-between text-xs text-slate-500">
              <span>{MIN_RADIUS} km</span>
              <span>{MAX_RADIUS} km</span>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Location</Label>
            <div className="h-24 bg-slate-100 rounded-md flex items-center justify-center text-slate-500 text-sm">
              Location picker coming soon
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleClear} variant="outline" className="flex-1">
              Clear
            </Button>
            <Button onClick={handleApplyRadius} variant="primary" className="flex-1">
              Apply
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="custom" className="p-4 space-y-4">
          <div className="space-y-2">
            <Label>Draw Custom Area</Label>
            <div className="h-48 bg-slate-100 rounded-md flex items-center justify-center text-slate-500 text-sm">
              Map drawing tool coming soon
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleClear} variant="outline" className="flex-1">
              Clear
            </Button>
            <Button onClick={handleApplyCustom} variant="primary" className="flex-1">
              Apply
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </FilterButton>
  );
}
