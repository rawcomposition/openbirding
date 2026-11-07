import { useRef, useState } from "react";
import { Binoculars, ExternalLink, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useBestHotspotsStore } from "@/stores/bestHotspotsStore";
import { useRangeSizeStore } from "@/stores/rangeSizeStore";
import { useUploadLifeList } from "@/hooks/best-hotspots/useUploadLifeList";

function eBirdLifeListCsvUrl(region: string) {
  return `https://ebird.org/lifelist?r=${region}&time=life&fmt=csv`;
}

function useLifeListFileInput() {
  const upload = useUploadLifeList();
  const setOnlySeen = useRangeSizeStore((s) => s.setOnlySeen);
  const inputRef = useRef<HTMLInputElement>(null);
  const handleFile = (file: File | undefined) => {
    if (!file) return;
    upload(file);
    setOnlySeen(true);
  };
  const input = (
    <input
      ref={inputRef}
      type="file"
      accept=".csv,text/csv"
      className="hidden"
      onChange={(e) => {
        handleFile(e.target.files?.[0]);
        e.target.value = "";
      }}
    />
  );
  return { input, open: () => inputRef.current?.click(), handleFile };
}

function UploadPrompt({ regionName }: { regionName: string }) {
  const region = useRangeSizeStore((s) => s.region);
  const { input, open, handleFile } = useLifeListFileInput();
  const [dragging, setDragging] = useState(false);
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        handleFile(e.dataTransfer.files?.[0]);
      }}
      className={cn(
        "flex flex-col gap-3 rounded-md px-3 py-3 text-sm transition-colors sm:flex-row sm:items-center",
        dragging && "bg-emerald-50"
      )}
    >
      <Binoculars className="hidden h-4 w-4 shrink-0 text-slate-400 sm:block" />
      <p className="flex-1 text-slate-600">
        <span className="block font-medium text-slate-900">Only want the birds you've seen?</span>
        <a
          href={eBirdLifeListCsvUrl(region)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 font-medium text-emerald-700 underline decoration-emerald-300 underline-offset-2 hover:text-emerald-800"
        >
          Download your {regionName} life list
          <ExternalLink className="h-3 w-3" />
        </a>{" "}
        and upload the CSV here.
      </p>
      <Button variant="outline" size="sm" onClick={open} className="shrink-0">
        <Upload /> Upload CSV
      </Button>
      {input}
    </div>
  );
}

function SeenToggle() {
  const onlySeen = useRangeSizeStore((s) => s.onlySeen);
  const setOnlySeen = useRangeSizeStore((s) => s.setOnlySeen);
  const options = [
    { value: true, label: "Birds I've seen" },
    { value: false, label: "All species" },
  ];
  return (
    <div className="inline-flex h-8 rounded-md border border-slate-300 bg-white p-0.5">
      {options.map((o) => (
        <button
          key={o.label}
          type="button"
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
  );
}

function LoadedList({ matched }: { matched: number | null | undefined }) {
  const fileName = useBestHotspotsStore((s) => s.fileName);
  const speciesCount = useBestHotspotsStore((s) => s.speciesCount);
  const clearLifeList = useBestHotspotsStore((s) => s.clearLifeList);
  const setOnlySeen = useRangeSizeStore((s) => s.setOnlySeen);
  const remove = () => {
    clearLifeList();
    setOnlySeen(false);
  };
  const count = matched ?? speciesCount ?? 0;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-3 text-sm">
      <Binoculars className="hidden h-4 w-4 shrink-0 text-emerald-600 sm:block" />
      <span className="min-w-0 flex-1 truncate text-slate-600">
        <span className="font-semibold text-slate-900">{count.toLocaleString()}</span> species in your life list
        {fileName ? <span className="text-slate-400"> · {fileName}</span> : null}
      </span>
      <SeenToggle />
      <Button variant="link" size="xs" className="shrink-0 px-0" onClick={remove}>
        Remove
      </Button>
    </div>
  );
}

type LifeListPanelProps = {
  matched: number | null | undefined;
  regionName: string;
};

export function LifeListPanel({ matched, regionName }: LifeListPanelProps) {
  const hasList = useBestHotspotsStore((s) => !!s.listToken);
  return hasList ? <LoadedList matched={matched} /> : <UploadPrompt regionName={regionName} />;
}
