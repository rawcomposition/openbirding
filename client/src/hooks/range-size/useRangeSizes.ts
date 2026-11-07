import { useInfiniteQuery } from "@tanstack/react-query";
import { mutate } from "@/lib/utils";
import { useBestHotspotsStore } from "@/stores/bestHotspotsStore";
import { useRangeSizeStore } from "@/stores/rangeSizeStore";
import type { RangeSizesResponse } from "@/components/rangesize/types";

const PAGE_SIZE = 1000;

export function useRangeSizes() {
  const region = useRangeSizeStore((s) => s.region);
  const sortColumn = useRangeSizeStore((s) => s.sortColumn);
  const sortDirection = useRangeSizeStore((s) => s.sortDirection);
  const onlySeen = useRangeSizeStore((s) => s.onlySeen);
  const listToken = useBestHotspotsStore((s) => s.listToken);
  const seenToken = onlySeen ? listToken : null;

  return useInfiniteQuery<RangeSizesResponse>({
    queryKey: ["range-size", region, sortColumn, sortDirection, seenToken],
    refetchOnWindowFocus: false,
    staleTime: 10 * 60 * 1000,
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      mutate("POST", "/range-size/species", {
        region,
        sort: sortColumn,
        direction: sortDirection,
        listToken: seenToken ?? undefined,
        offset: pageParam,
        limit: PAGE_SIZE,
      }) as Promise<RangeSizesResponse>,
    getNextPageParam: (last) => {
      const next = last.meta.offset + last.items.length;
      return next < last.meta.total ? next : undefined;
    },
  });
}
