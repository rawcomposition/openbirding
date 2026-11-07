import { create } from "zustand";
import { persist } from "zustand/middleware";

export type RangeSort = "region" | "world";

export const WORLD_REGION = "world";

type RangeRestrictedState = {
  region: string;
  sort: RangeSort;
  onlySeen: boolean;
  setRegion: (region: string) => void;
  setSort: (sort: RangeSort) => void;
  setOnlySeen: (onlySeen: boolean) => void;
};

export const useRangeRestrictedStore = create<RangeRestrictedState>()(
  persist(
    (set) => ({
      region: WORLD_REGION,
      sort: "region",
      onlySeen: true,
      setRegion: (region) => set({ region }),
      setSort: (sort) => set({ sort }),
      setOnlySeen: (onlySeen) => set({ onlySeen }),
    }),
    { name: "openbirding-range-restricted", version: 2 }
  )
);
