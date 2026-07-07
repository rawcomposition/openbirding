import { Loader2 } from "lucide-react";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { ApiError } from "@/lib/utils";
import { FREQUENCY_PRESETS, MIN_CHECKLIST_PRESETS, useBestHotspotsStore, useBestHotspotsSession } from "@/stores/bestHotspotsStore";
import { PillSelect } from "@/components/besthotspots/PillSelect";
import { CitationFooter } from "@/components/besthotspots/CitationFooter";
import { useHotspots } from "@/components/besthotspots/useHotspots";
import type { HotspotItem } from "@/components/besthotspots/types";

export function HotspotResults() {
  const frequency = useBestHotspotsStore((s) => s.frequency);
  const minChecklists = useBestHotspotsStore((s) => s.minChecklists);
  const setFrequency = useBestHotspotsStore((s) => s.setFrequency);
  const setMinChecklists = useBestHotspotsStore((s) => s.setMinChecklists);
  const selectedHotspot = useBestHotspotsSession((s) => s.selectedHotspot);
  const setSelectedHotspot = useBestHotspotsSession((s) => s.setSelectedHotspot);

  const { hotspots, data, isFetching, isError, error, refetch, scopeKind } = useHotspots();
  const hotspotsInScope = data?.meta.hotspotsInScope;
  const citation = data?.citation;
  const errorMessage = error instanceof ApiError ? error.userMessage : undefined;

  const onSelect = (h: HotspotItem) => {
    setSelectedHotspot(selectedHotspot?.id === h.id ? null : h);
  };

  return (
    <div className="mt-3 flex min-h-0 flex-1 flex-col border-t border-slate-100">
      <div className="flex items-center gap-2 px-3 pt-2">
        <h2 className="text-base font-semibold text-slate-700">
          Best hotspots {scopeKind === "hex" ? "in selection" : "in view"}
        </h2>
        {isFetching && hotspots.length > 0 && (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-600" />
        )}
      </div>
      <div className="flex items-center gap-1.5 px-3 pb-2 pt-1.5">
        <PillSelect
          value={frequency}
          onChange={(v) => setFrequency(Number(v))}
          options={FREQUENCY_PRESETS.map((p) => ({
            value: p.value,
            label: `${p.label}+ frequency`,
          }))}
        />
        <PillSelect
          value={minChecklists}
          onChange={(v) => setMinChecklists(Number(v))}
          options={MIN_CHECKLIST_PRESETS.map((n) => ({ value: n, label: `${n}+ checklists` }))}
        />
      </div>
      {isError && hotspots.length === 0 ? (
        <ErrorState
          message={errorMessage ?? "Couldn't load hotspots."}
          onRetry={() => refetch()}
          className="mx-3"
        />
      ) : hotspots.length === 0 && (isFetching || hotspotsInScope === undefined) ? (
        <LoadingState />
      ) : hotspots.length === 0 ? (
        <p className="mx-3 rounded-lg bg-slate-50 px-3 py-3 text-center text-sm text-slate-500">
          {hotspotsInScope === 0
            ? "No hotspots in this area."
            : "No hotspots match your filters."}
        </p>
      ) : (
        <div className="min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto px-3 pb-3 pt-1">
          {hotspots.map((h) => (
            <div
              key={h.id}
              onClick={() => onSelect(h)}
              className="group flex cursor-pointer items-start justify-between gap-3 py-2 scroll-mt-2"
            >
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium leading-snug text-slate-800 group-hover:text-emerald-700">{h.name}</div>
                <div className="truncate text-xs leading-tight text-slate-400">{h.regionName ?? h.regionCode}</div>
              </div>
              <div className="flex shrink-0 flex-col items-end">
                <span className="text-base font-bold leading-tight tabular-nums text-emerald-600">{h.lifers}</span>
                <span className="whitespace-nowrap text-xs font-medium leading-tight tabular-nums text-slate-500">
                  {h.checklists.toLocaleString()} lists
                </span>
              </div>
            </div>
          ))}
          <CitationFooter citation={citation} />
        </div>
      )}
    </div>
  );
}
