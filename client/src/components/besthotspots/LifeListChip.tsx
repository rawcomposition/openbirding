import { useRef } from "react";
import { Binoculars } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBestHotspotsStore } from "@/stores/bestHotspotsStore";
import { useHotspots } from "@/components/besthotspots/useHotspots";
import { useUploadLifeList } from "@/components/besthotspots/useUploadLifeList";

export function LifeListChip() {
  const fileName = useBestHotspotsStore((s) => s.fileName);
  const speciesCount = useBestHotspotsStore((s) => s.speciesCount);
  const upload = useUploadLifeList();
  const { data } = useHotspots();
  const matched = data?.meta.seenMatched;
  const count = speciesCount ?? 0;

  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
      <Binoculars className="h-4 w-4 shrink-0 text-emerald-600" />
      <span className="min-w-0 flex-1 truncate text-sm text-emerald-900">
        <span className="font-semibold">{(matched ?? count).toLocaleString()}</span> species
        {fileName ? <span className="text-emerald-700/70"> · {fileName}</span> : null}
      </span>
      <Button variant="link" size="xs" className="shrink-0 px-0" onClick={() => inputRef.current?.click()}>
        Replace
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) upload(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}
