import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { ApiError } from "@/lib/utils";
import { useBestHotspotsStore } from "@/stores/bestHotspotsStore";
import { useRangeSizeStore, WORLD_REGION } from "@/stores/rangeSizeStore";
import { useRangeSizes } from "@/hooks/range-size/useRangeSizes";
import { RegionSelect } from "@/components/rangesize/RegionSelect";
import { LifeListPanel } from "@/components/rangesize/LifeListPanel";
import { SpeciesRangeList } from "@/components/rangesize/SpeciesRangeList";
import type { RangeRegionsResponse } from "@/components/rangesize/types";

const RangeSize = () => {
  useEffect(() => {
    document.title = "Range Size | OpenBirding";
  }, []);

  const region = useRangeSizeStore((s) => s.region);
  const setRegion = useRangeSizeStore((s) => s.setRegion);
  const sortColumn = useRangeSizeStore((s) => s.sortColumn);
  const sortDirection = useRangeSizeStore((s) => s.sortDirection);
  const toggleSort = useRangeSizeStore((s) => s.toggleSort);
  const clearLifeList = useBestHotspotsStore((s) => s.clearLifeList);

  const { data: regions } = useQuery<RangeRegionsResponse>({
    queryKey: ["/range-size/regions"],
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });

  const { data, error, isPending, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useRangeSizes();

  useEffect(() => {
    if (error && /life list not found/i.test(error.message)) {
      clearLifeList();
      toast.error("Your saved life list has expired — please upload it again.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error]);

  const isWorld = region === WORLD_REGION;
  const firstPage = data?.pages[0];
  const meta = firstPage?.meta;
  const items = data?.pages.flatMap((p) => p.items) ?? [];
  const regionName = isWorld ? null : (regions?.regions.find((r) => r.code === region)?.name ?? meta?.regionName);
  const scopeLabel = regionName ?? "the world";
  const errorMessage = error instanceof ApiError ? (error.userMessage ?? error.message) : undefined;
  const minChecklists = meta?.minChecklists ?? 2;
  const minObs = meta?.minObs ?? 2;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-3 flex items-center gap-3">
        <Globe className="h-6 w-6 text-emerald-600" />
        <h1 className="text-3xl font-bold text-slate-900">Range Size</h1>
      </div>
      <p className="mb-8 max-w-2xl text-lg text-slate-600">
        Find the birds with the smallest ranges. We split the world into hexagons of about 1,770 km² and count how
        many of them each species has been reported in on eBird. The fewer hexagons, the more localized the bird.
      </p>

      <div className="mb-8 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-3 px-3 py-3">
          <label htmlFor="range-region" className="w-16 shrink-0 text-sm font-medium text-slate-700">
            Region
          </label>
          <RegionSelect value={region} onChange={setRegion} />
        </div>
        <LifeListPanel matched={meta?.seenMatched} regionName={regionName ?? "World"} />
      </div>

      {meta && (
        <p className="mb-3 text-sm text-slate-600">
          <span className="font-semibold text-slate-900">{meta.total.toLocaleString()}</span>{" "}
          species
        </p>
      )}

      {isPending ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState message={errorMessage ?? "Couldn't load range sizes."} onRetry={() => refetch()} />
      ) : items.length === 0 ? (
        <Card className="border-slate-200 bg-slate-50">
          <CardContent>
            <p className="text-center text-slate-700">No species to show for {scopeLabel}.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <SpeciesRangeList
            items={items}
            regionLabel={regionName ?? null}
            sortColumn={sortColumn}
            sortDirection={sortDirection}
            onSort={toggleSort}
          />
          {hasNextPage && (
            <div className="mt-4 flex justify-center">
              <Button variant="outline" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
                {isFetchingNextPage ? "Loading..." : "Show more"}
              </Button>
            </div>
          )}
        </>
      )}

      {meta && (
        <div className="mt-6 max-w-2xl space-y-2 text-xs text-slate-500">
          <p>
            Hexagons are H3 resolution {meta.resolution}. Only hexagons with at least {minChecklists} complete
            checklists count, and a species counts as present with at least {minObs} checklists there. All months and
            years are combined. A country's percentage is relative to that country's hexagons, so it isn't comparable
            across countries.
          </p>
          {firstPage?.citation && <p>{firstPage.citation}</p>}
        </div>
      )}
    </div>
  );
};

export default RangeSize;
