import { useState } from "react";
import { Binoculars, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBestHotspotsStore } from "@/stores/bestHotspotsStore";
import { UploadArea } from "@/components/besthotspots/UploadArea";
import { LifeListChip } from "@/components/besthotspots/LifeListChip";
import { SelectedCellsCard } from "@/components/besthotspots/SelectedCellsCard";
import { HotspotResults } from "@/components/besthotspots/HotspotResults";
import { HotspotDetailPanel } from "@/components/besthotspots/HotspotDetailPanel";

export function Sidebar() {
  const hasList = useBestHotspotsStore((s) => !!s.listToken);
  const [collapsed, setCollapsed] = useState(false);

  if (collapsed) {
    return (
      <Button
        variant="outline"
        onClick={() => setCollapsed(false)}
        className="absolute left-3 top-3 z-10 rounded-lg bg-white/95 shadow-lg backdrop-blur"
        aria-label="Open Best Hotspots panel"
      >
        <Binoculars className="size-5 text-emerald-600" />
        <span className="text-sm font-bold tracking-tight text-slate-900">Best Hotspots</span>
        <PanelLeftOpen className="size-4 text-slate-400" />
      </Button>
    );
  }

  return (
    <div className="absolute inset-y-0 left-0 z-10 flex w-[min(27rem,calc(100vw_-_2.5rem))] flex-col overflow-hidden border-r border-slate-200 bg-white/95 shadow-xl backdrop-blur md:relative md:inset-auto md:w-[27rem] md:shrink-0 md:bg-white md:shadow-none md:backdrop-blur-none">
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <span className="flex items-center gap-2">
          <Binoculars className="h-5 w-5 text-emerald-600" />
          <span className="text-base font-bold tracking-tight text-slate-900">Best Hotspots</span>
        </span>
        <Button
          variant="subtle"
          size="icon-sm"
          onClick={() => setCollapsed(true)}
          aria-label="Collapse panel"
        >
          <PanelLeftClose className="size-4" />
        </Button>
      </div>

      <div className="flex flex-col gap-3 px-3">
        {!hasList ? (
          <UploadArea />
        ) : (
          <>
            <LifeListChip />
            <SelectedCellsCard />
          </>
        )}
      </div>

      {hasList && <HotspotResults />}

      <HotspotDetailPanel />
    </div>
  );
}
