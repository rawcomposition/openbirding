import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { FilterButton } from "@/components/FilterButton";
import { useBirdFinderStore } from "@/stores/birdFinderStore";
import { polygonBbox } from "@/lib/geo";
import RegionSearch from "@/components/RegionSearch";
import AreaMap from "@/components/AreaMap";

export function RegionFilter() {
  const { region, customArea, setRegion, setCustomArea } = useBirdFinderStore();
  const [open, setOpen] = useState(false);

  const defaultTab = customArea ? "area" : "region";

  const getDisplayValue = () => {
    if (customArea) return "Custom Area";
    if (region) return region.regionName || region.regionCode;
    return null;
  };

  const handleRegionChange = (value: { regionCode: string; regionName: string } | null) => {
    setRegion(value);
    if (value) {
      setOpen(false);
    }
  };

  const handlePolygonComplete = (polygon: [number, number][]) => {
    const bbox = polygonBbox(polygon);
    setCustomArea({ polygon, bbox });
  };

  const handleClear = () => {
    setRegion(null);
    setCustomArea(null);
  };

  return (
    <FilterButton
      label="Location"
      value={getDisplayValue()}
      onClear={handleClear}
      open={open}
      onOpenChange={setOpen}
    >
      <Tabs defaultValue={defaultTab} className="w-[420px]">
        <TabsList className="w-full mx-auto">
          <TabsTrigger value="region" className="flex-1">Region</TabsTrigger>
          <TabsTrigger value="area" className="flex-1">Custom Area</TabsTrigger>
        </TabsList>
        <TabsContent value="region">
          <div className="p-4">
            <div className="space-y-2">
              <Label>Region</Label>
              <RegionSearch value={null} onChange={handleRegionChange} />
            </div>
          </div>
        </TabsContent>
        <TabsContent value="area">
          <div className="p-4">
            <AreaMap
              onComplete={handlePolygonComplete}
              initialPolygon={customArea?.polygon ?? null}
            />
          </div>
        </TabsContent>
      </Tabs>
    </FilterButton>
  );
}
