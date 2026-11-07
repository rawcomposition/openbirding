import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { ApiError, cn } from "@/lib/utils";
import { useBestHotspotsStore } from "@/stores/bestHotspotsStore";
import { useRangeRestrictedStore, WORLD_REGION, type RangeSort } from "@/stores/rangeRestrictedStore";
import { useRangeSpecies } from "@/hooks/range-restricted/useRangeSpecies";
import { RegionSelect } from "@/components/rangerestricted/RegionSelect";
import { LifeListControl } from "@/components/rangerestricted/LifeListControl";
import { SpeciesRangeList } from "@/components/rangerestricted/SpeciesRangeList";
import type { RangeRegionsResponse } from "@/components/rangerestricted/types";

function SortToggle({ regionName }: { regionName: string }) {
  const sort = useRangeRestrictedStore((s) => s.sort);
  const setSort = useRangeRestrictedStore((s) => s.setSort);
  const options: { value: RangeSort; label: string }[] = [
    { value: "region", label: `Range in ${regionName}` },
    { value: "world", label: "Global range" },
  ];
  return (
    <div className="inline-flex h-9 rounded-md border border-slate-300 bg-white p-0.5 shadow-xs">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => setSort(o.value)}
          className={cn(
            "cursor-pointer rounded-sm px-3 text-sm transition-colors",
            sort === o.value ? "bg-emerald-600 font-medium text-white" : "text-slate-600 hover:bg-slate-50"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const RangeRestricted = () => {
  useEffect(() => {
    document.title = "Range-Restricted Species | OpenBirding";
  }, []);

  const region = useRangeRestrictedStore((s) => s.region);
  const sort = useRangeRestrictedStore((s) => s.sort);
  const setRegion = useRangeRestrictedStore((s) => s.setRegion);
  const onlySeen = useRangeRestrictedStore((s) => s.onlySeen);
  const hasList = useBestHotspotsStore((s) => !!s.listToken);
  const clearLifeList = useBestHotspotsStore((s) => s.clearLifeList);

  const { data: regions } = useQuery<RangeRegionsResponse>({
    queryKey: ["/range-restricted/regions"],
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });

  const { data, error, isPending, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useRangeSpecies();

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
  const regionName = regions?.regions.find((r) => r.code === region)?.name ?? meta?.regionName;
  const errorMessage = error instanceof ApiError ? (error.userMessage ?? error.message) : undefined;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6 flex items-center gap-3">
        <Globe className="h-6 w-6 text-emerald-600" />
        <h1 className="text-3xl font-bold text-slate-900">Range-Restricted Species</h1>
      </div>
      <p className="mb-6 max-w-2xl text-slate-600">
        Species ranked by how small an area they're found in, worldwide or within a country. Upload your eBird life list
        to see only the species you've seen.
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <RegionSelect value={region} onChange={setRegion} />
        {!isWorld && regionName && <SortToggle regionName={regionName} />}
        <LifeListControl />
      </div>

      {meta && (
        <p className="mb-3 text-sm text-slate-500">
          <span className="font-semibold text-slate-700">{meta.total.toLocaleString()}</span>{" "}
          {onlySeen && hasList ? "species you've seen" : "species"} in {regionName}
        </p>
      )}

      {isPending ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState message={errorMessage ?? "Couldn't load species ranges."} onRetry={() => refetch()} />
      ) : items.length === 0 ? (
        <Card className="border-slate-200 bg-slate-50">
          <CardContent>
            <p className="text-center text-slate-700">No species to show for {regionName}.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <SpeciesRangeList
            items={items}
            showRegion={!isWorld}
            regionLabel={regionName ?? region}
            sortByWorld={sort === "world"}
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
            Range is the share of surveyed H3 resolution-{meta.resolution} cells (about 1,770 km² each, with at least{" "}
            {meta.minChecklists} complete checklists) where the species appears on at least {meta.minObs} checklists,
            all months and years combined. Percentages within a country aren't comparable across countries.
          </p>
          {firstPage?.citation && <p>{firstPage.citation}</p>}
        </div>
      )}
    </div>
  );
};

export default RangeRestricted;
