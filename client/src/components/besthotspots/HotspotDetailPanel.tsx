import { useQuery } from "@tanstack/react-query";
import { Bird, ChevronLeft, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { ApiError, mutate } from "@/lib/utils";
import { useBestHotspotsStore, useBestHotspotsSession } from "@/stores/bestHotspotsStore";
import { CitationFooter } from "@/components/besthotspots/CitationFooter";
import { useHotspots } from "@/components/besthotspots/useHotspots";
import type { HotspotDetailResponse } from "@/components/besthotspots/types";

function ebirdTargetsUrl(hotspotId: string): string {
  const p = new URLSearchParams({ r1: hotspotId, bmo: "1", emo: "12", r2: "world", t2: "life" });
  return `https://ebird.org/targets?${p.toString()}`;
}

export function HotspotDetailPanel() {
  const shown = useBestHotspotsSession((s) => s.selectedHotspot);
  const setSelectedHotspot = useBestHotspotsSession((s) => s.setSelectedHotspot);
  const listToken = useBestHotspotsStore((s) => s.listToken);
  const frequency = useBestHotspotsStore((s) => s.frequency);

  const citation = useHotspots().data?.citation;

  const { data: detail, isFetching, isError, error, refetch } = useQuery<HotspotDetailResponse>({
    queryKey: ["lifer-hotspot-detail", shown?.id, listToken, frequency],
    enabled: !!listToken && !!shown,
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000,
    queryFn: () =>
      mutate("POST", `/lifers/hotspot/${shown!.id}`, { listToken, frequency }) as Promise<HotspotDetailResponse>,
  });
  const errorMessage = error instanceof ApiError ? error.userMessage : undefined;

  if (!shown) return null;
  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-white">
      <div className="px-4 pt-3">
        <Button variant="subtle" size="xs" onClick={() => setSelectedHotspot(null)} className="-ml-1">
          <ChevronLeft className="size-3.5" /> Back to results
        </Button>
        <h3 className="mt-2 text-base font-bold leading-snug text-slate-900">{shown.name}</h3>
        <p className="mt-0.5 text-xs text-slate-500">
          {shown.regionName ?? shown.regionCode} · {shown.checklists.toLocaleString()} lists
        </p>
      </div>

      <div className="flex gap-2 px-4 py-3">
        <Button asChild variant="primary" size="sm" className="flex-1">
          <a href={ebirdTargetsUrl(shown.id)} target="_blank" rel="noopener noreferrer">
            View targets <ExternalLink className="size-3" />
          </a>
        </Button>
        <Button asChild variant="outline" size="sm" className="flex-1">
          <a href={`https://ebird.org/hotspot/${shown.id}/about`} target="_blank" rel="noopener noreferrer">
            Hotspot details <ExternalLink className="size-3" />
          </a>
        </Button>
      </div>

      <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2">
        <h4 className="text-sm text-slate-600">
          {detail ? (
            <>
              <span className="font-semibold">{detail.liferCount}</span> species above{" "}
              <span className="font-semibold">{Math.round(detail.frequency * 100)}%</span> adjusted frequency · year-round
            </>
          ) : (
            "Species"
          )}
        </h4>
        {isFetching && detail && <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-600" />}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3">
        {isError && !detail && (
          <ErrorState message={errorMessage ?? "Couldn't load this hotspot."} onRetry={() => refetch()} />
        )}
        {!detail && !isError && isFetching && <LoadingState />}
        {detail?.lifers.map((l) => {
          const photo = l.photo;
          return (
            <a
              key={l.code}
              href={`https://ebird.org/species/${l.code}`}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-2.5 border-b border-slate-100 py-1.5 last:border-b-0"
            >
              {photo ? (
                <img
                  src={photo.url}
                  alt={l.name}
                  title={`By ${photo.by}`}
                  loading="lazy"
                  className="h-9 w-12 shrink-0 rounded-md bg-slate-100 object-cover"
                />
              ) : (
                <span className="flex h-9 w-12 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-300">
                  <Bird className="h-4 w-4" />
                </span>
              )}
              <span className="min-w-0 flex-1 text-sm leading-snug text-slate-800 group-hover:text-emerald-700">
                {l.name}
              </span>
              <span className="shrink-0 text-base font-bold tabular-nums text-emerald-600">{Math.round(l.score)}%</span>
            </a>
          );
        })}
        {detail && detail.lifers.length === 0 && (
          <p className="py-2 text-center text-sm text-slate-500">No new species here at this frequency.</p>
        )}
        <CitationFooter citation={citation} />
      </div>
    </div>
  );
}
