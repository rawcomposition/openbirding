import { ArrowDown, ArrowUp, Bird } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RangeSortColumn, RangeSortDirection } from "@/stores/rangeSizeStore";
import type { RangeSpecies } from "@/components/rangesize/types";

function formatRangePct(pct: number) {
  if (pct >= 10) return `${Math.round(pct)}%`;
  if (pct >= 1) return `${pct.toFixed(1)}%`;
  if (pct >= 0.01) return `${pct.toFixed(2)}%`;
  return "<0.01%";
}

const RANGE_COLUMN_CLASS = "w-20 shrink-0 text-right sm:w-28";

type SortHeaderProps = {
  column: RangeSortColumn;
  label: string;
  sortColumn: RangeSortColumn;
  sortDirection: RangeSortDirection;
  onSort: (column: RangeSortColumn) => void;
  className?: string;
};

function SortHeader({ column, label, sortColumn, sortDirection, onSort, className }: SortHeaderProps) {
  const active = sortColumn === column;
  const Arrow = sortDirection === "asc" ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      onClick={() => onSort(column)}
      aria-sort={active ? (sortDirection === "asc" ? "ascending" : "descending") : "none"}
      className={cn(
        "inline-flex cursor-pointer items-center gap-1 uppercase tracking-wide hover:text-slate-900",
        active ? "text-emerald-700" : "text-slate-500",
        className
      )}
    >
      <span className="truncate">{label}</span>
      <Arrow className={cn("h-3 w-3 shrink-0", active ? "opacity-100" : "opacity-0")} />
    </button>
  );
}

type SpeciesRangeListProps = {
  items: RangeSpecies[];
  regionLabel: string | null;
  sortColumn: RangeSortColumn;
  sortDirection: RangeSortDirection;
  onSort: (column: RangeSortColumn) => void;
};

export function SpeciesRangeList({ items, regionLabel, sortColumn, sortDirection, onSort }: SpeciesRangeListProps) {
  const headerProps = { sortColumn, sortDirection, onSort };
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold">
        <span className="w-8 shrink-0 text-right text-slate-500">#</span>
        <span className="w-14 shrink-0" />
        <div className="flex flex-1">
          <SortHeader column="name" label="Species" {...headerProps} />
        </div>
        {regionLabel && (
          <div className={cn(RANGE_COLUMN_CLASS, "flex justify-end")}>
            <SortHeader column="region" label={regionLabel} {...headerProps} className="max-w-full" />
          </div>
        )}
        <div className={cn(RANGE_COLUMN_CLASS, "flex justify-end")}>
          <SortHeader column="world" label="World" {...headerProps} />
        </div>
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
          {regionLabel && (
            <span
              className={cn(
                RANGE_COLUMN_CLASS,
                "text-sm tabular-nums",
                sortColumn === "region" ? "font-semibold text-emerald-700" : "text-slate-600"
              )}
            >
              {formatRangePct(s.regionPct)}
            </span>
          )}
          <span
            className={cn(
              RANGE_COLUMN_CLASS,
              "text-sm tabular-nums",
              sortColumn === "world" ? "font-semibold text-emerald-700" : "text-slate-600"
            )}
          >
            {formatRangePct(s.worldPct)}
          </span>
        </a>
      ))}
    </div>
  );
}
