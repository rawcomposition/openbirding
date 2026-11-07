import { useInfiniteQuery } from "@tanstack/react-query";
import { mutate } from "@/lib/utils";
import { useBestHotspotsStore } from "@/stores/bestHotspotsStore";
import { useRangeRestrictedStore } from "@/stores/rangeRestrictedStore";
import type { RangeSpeciesResponse } from "@/components/rangerestricted/types";

const PAGE_SIZE = 100;

export function useRangeSpecies() {
  const region = useRangeRestrictedStore((s) => s.region);
  const sort = useRangeRestrictedStore((s) => s.sort);
  const onlySeen = useRangeRestrictedStore((s) => s.onlySeen);
  const listToken = useBestHotspotsStore((s) => s.listToken);
  const seenToken = onlySeen ? listToken : null;

  return useInfiniteQuery<RangeSpeciesResponse>({
    queryKey: ["range-restricted", region, sort, seenToken],
    refetchOnWindowFocus: false,
    staleTime: 10 * 60 * 1000,
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      mutate("POST", "/range-restricted/species", {
        region,
        sort,
        listToken: seenToken ?? undefined,
        offset: pageParam,
        limit: PAGE_SIZE,
      }) as Promise<RangeSpeciesResponse>,
    getNextPageParam: (last) => {
      const next = last.meta.offset + last.items.length;
      return next < last.meta.total ? next : undefined;
    },
  });
}
