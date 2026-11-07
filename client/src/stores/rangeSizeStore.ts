import { create } from "zustand";
import { persist } from "zustand/middleware";

export type RangeSortColumn = "region" | "world" | "name";
export type RangeSortDirection = "asc" | "desc";

export const WORLD_REGION = "world";

type RangeSizeState = {
  region: string;
  sortColumn: RangeSortColumn;
  sortDirection: RangeSortDirection;
  onlySeen: boolean;
  setRegion: (region: string) => void;
  toggleSort: (column: RangeSortColumn) => void;
  setOnlySeen: (onlySeen: boolean) => void;
};

export const useRangeSizeStore = create<RangeSizeState>()(
  persist(
    (set) => ({
      region: WORLD_REGION,
      sortColumn: "region",
      sortDirection: "asc",
      onlySeen: true,
      setRegion: (region) =>
        set((state) => ({
          region,
          sortColumn: state.sortColumn === "name" ? "name" : region === WORLD_REGION ? "world" : "region",
          sortDirection: state.sortColumn === "name" ? state.sortDirection : "asc",
        })),
      toggleSort: (column) =>
        set((state) =>
          state.sortColumn === column
            ? { sortDirection: state.sortDirection === "asc" ? "desc" : "asc" }
            : { sortColumn: column, sortDirection: "asc" }
        ),
      setOnlySeen: (onlySeen) => set({ onlySeen }),
    }),
    { name: "openbirding-range-size", version: 1 }
  )
);
