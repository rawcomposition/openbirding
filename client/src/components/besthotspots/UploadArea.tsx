import { useRef, useState } from "react";
import { ExternalLink, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUploadLifeList } from "@/hooks/best-hotspots/useUploadLifeList";

export function UploadArea() {
  const upload = useUploadLifeList();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm text-slate-700">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-semibold text-emerald-700">
          1
        </span>
        <a
          href="https://ebird.org/lifelist?r=world&time=life&fmt=csv"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 font-medium text-emerald-700 underline decoration-emerald-300 underline-offset-2 hover:text-emerald-800"
        >
          Download your life list from eBird
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
      <div className="flex items-center gap-2 text-sm text-slate-700">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-semibold text-emerald-700">
          2
        </span>
        <span className="font-medium">Drop it below</span>
      </div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file) upload(file);
        }}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "cursor-pointer rounded-lg border-2 border-dashed p-6 text-center transition-colors",
          dragging ? "border-emerald-500 bg-emerald-50" : "border-slate-300 bg-slate-50 hover:border-emerald-400"
        )}
      >
        <Upload className="mx-auto mb-2 h-8 w-8 text-emerald-600" />
        <p className="text-sm font-medium text-slate-800">Drag &amp; drop your CSV</p>
        <p className="mt-0.5 text-xs text-slate-500">or click to choose a file</p>
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
    </div>
  );
}
