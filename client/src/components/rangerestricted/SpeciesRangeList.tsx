import { Bird } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RangeSpecies } from "@/components/rangerestricted/types";

function formatRangePct(pct: number) {
  if (pct >= 10) return `${Math.round(pct)}%`;
  if (pct >= 1) return `${pct.toFixed(1)}%`;
  if (pct >= 0.01) return `${pct.toFixed(2)}%`;
  return "<0.01%";
}

function RangeCell({ cells, pct, active }: { cells: number; pct: number; active: boolean }) {
  return (
    <div className={cn("w-24 shrink-0 text-right sm:w-32", active ? "text-slate-900" : "text-slate-500")}>
      <div className={cn("tabular-nums", active ? "text-base font-bold text-emerald-700" : "text-sm font-medium")}>
        {formatRangePct(pct)}
      </div>
      <div className="text-xs tabular-nums text-slate-500">
        {cells.toLocaleString()} {cells === 1 ? "cell" : "cells"}
      </div>
    </div>
  );
}

type SpeciesRangeListProps = {
  items: RangeSpecies[];
  showRegion: boolean;
  regionLabel: string;
  sortByWorld: boolean;
};

export function SpeciesRangeList({ items, showRegion, regionLabel, sortByWorld }: SpeciesRangeListProps) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        <span className="w-8 shrink-0 text-right">#</span>
        <span className="flex-1">Species</span>
        {showRegion && <span className="w-24 shrink-0 truncate text-right sm:w-32">{regionLabel}</span>}
        <span className="w-24 shrink-0 text-right sm:w-32">World</span>
      </div>
      {items.map((s) => (
        <a
          key={s.code}
          href={`https://ebird.org/species/${s.code}`}
          target="_blank"
          rel="noopener noreferrer"
          className="group flex items-center gap-3 border-b border-slate-100 px-4 py-2 last:border-b-0 hover:bg-slate-50"
        >
          <span className="w-8 shrink-0 text-right text-sm tabular-nums text-slate-400">{s.rank}</span>
          {s.photo ? (
            <img
              src={s.photo.url}
              alt={s.name}
              title={`By ${s.photo.by}`}
              loading="lazy"
              className="h-10 w-14 shrink-0 rounded-md bg-slate-100 object-cover"
            />
          ) : (
            <span className="flex h-10 w-14 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-300">
              <Bird className="h-4 w-4" />
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-slate-900 group-hover:text-emerald-700">
              {s.name}
            </span>
            <span className="block truncate text-xs italic text-slate-500">{s.sciName}</span>
          </span>
          {showRegion && <RangeCell cells={s.regionCells} pct={s.regionPct} active={!sortByWorld} />}
          <RangeCell cells={s.worldCells} pct={s.worldPct} active={sortByWorld || !showRegion} />
        </a>
      ))}
    </div>
  );
}
