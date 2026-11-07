import { useRef } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useBestHotspotsStore } from "@/stores/bestHotspotsStore";
import { useRangeRestrictedStore } from "@/stores/rangeRestrictedStore";
import { useUploadLifeList } from "@/hooks/best-hotspots/useUploadLifeList";

export function LifeListControl() {
  const listToken = useBestHotspotsStore((s) => s.listToken);
  const onlySeen = useRangeRestrictedStore((s) => s.onlySeen);
  const setOnlySeen = useRangeRestrictedStore((s) => s.setOnlySeen);
  const upload = useUploadLifeList();
  const inputRef = useRef<HTMLInputElement>(null);

  const fileInput = (
    <input
      ref={inputRef}
      type="file"
      accept=".csv,text/csv"
      className="hidden"
      onChange={(e) => {
        const file = e.target.files?.[0];
        if (file) {
          upload(file);
          setOnlySeen(true);
        }
        e.target.value = "";
      }}
    />
  );

  if (!listToken) {
    return (
      <>
        <Button variant="outline" onClick={() => inputRef.current?.click()}>
          <Upload /> Upload eBird life list
        </Button>
        {fileInput}
      </>
    );
  }

  const options = [
    { value: false, label: "All species" },
    { value: true, label: "Only seen" },
  ];
  return (
    <div className="flex items-center gap-1">
      <div className="inline-flex h-9 rounded-md border border-slate-300 bg-white p-0.5 shadow-xs">
        {options.map((o) => (
          <button
            key={o.label}
            onClick={() => setOnlySeen(o.value)}
            className={cn(
              "cursor-pointer rounded-sm px-3 text-sm transition-colors",
              onlySeen === o.value ? "bg-emerald-600 font-medium text-white" : "text-slate-600 hover:bg-slate-50"
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
      <Button variant="link" size="xs" onClick={() => inputRef.current?.click()}>
        Replace list
      </Button>
      {fileInput}
    </div>
  );
}
