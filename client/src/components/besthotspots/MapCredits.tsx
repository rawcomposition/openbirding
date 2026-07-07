import { Info } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useHotspots } from "@/hooks/best-hotspots/useHotspots";

export function MapCredits() {
  const citation = useHotspots().data?.citation;
  return (
    <Dialog>
      <DialogTrigger
        className="absolute bottom-3 right-3 z-10 rounded-full border border-slate-200 bg-white/90 p-1 text-slate-500 shadow-lg backdrop-blur hover:text-slate-800"
        aria-label="Map credits and data sources"
      >
        <Info className="h-4 w-4" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Credits &amp; data sources</DialogTitle>
        </DialogHeader>
        <dl className="space-y-4 text-sm text-slate-600">
          <div>
            <dt className="font-medium text-slate-800">Base map</dt>
            <dd className="mt-1">
              ©{" "}
              <a href="https://openfreemap.org" target="_blank" rel="noopener noreferrer" className="text-emerald-700 hover:underline">
                OpenFreeMap
              </a>
              , ©{" "}
              <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener noreferrer" className="text-emerald-700 hover:underline">
                OpenMapTiles
              </a>
              , data from{" "}
              <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="text-emerald-700 hover:underline">
                © OpenStreetMap
              </a>{" "}
              contributors
            </dd>
          </div>
          {citation && (
            <div>
              <dt className="font-medium text-slate-800">eBird Data</dt>
              <dd className="mt-1">{citation}</dd>
            </div>
          )}
        </dl>
      </DialogContent>
    </Dialog>
  );
}
