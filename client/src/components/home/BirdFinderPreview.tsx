import { Search, MapPin, X } from "lucide-react";

const chips = ["Texas", "May", "5+ reports"];

const results = [
  { rank: 1, name: "Santa Ana NWR", region: "Hidalgo, TX", frequency: 58 },
  { rank: 2, name: "Estero Llano Grande SP", region: "Hidalgo, TX", frequency: 41 },
];

const BirdFinderPreview = ({ className }: { className?: string }) => {
  return (
    <div className={className}>
      <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
        <Search className="h-4 w-4 shrink-0 text-slate-400" />
        <span className="flex-1 text-sm font-medium text-slate-900">Painted Bunting</span>
        <X className="h-4 w-4 shrink-0 text-slate-300" />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {chips.map((chip) => (
          <span
            key={chip}
            className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700"
          >
            {chip}
          </span>
        ))}
      </div>

      <div className="mt-4 flex flex-col gap-2">
        {results.map((result) => (
          <div
            key={result.rank}
            className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-sm"
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
              {result.rank}
            </span>
            <MapPin className="h-4 w-4 shrink-0 text-emerald-600" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-slate-900">{result.name}</div>
              <div className="truncate text-xs text-slate-500">{result.region}</div>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <span className="text-xs font-semibold text-emerald-700">{result.frequency}%</span>
              <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-emerald-500" style={{ width: `${result.frequency}%` }} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default BirdFinderPreview;
