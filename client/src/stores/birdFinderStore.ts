import { create } from "zustand";
import { persist } from "zustand/middleware";

export type RegionFilter = {
  regionCode?: string;
  regionName?: string;
};

// Selected month (1-12), null means all months
export type MonthFilter = number;

export type SpeciesSelection = {
  code: string;
  name: string;
  sciName: string;
};

type BirdFinderState = {
  species: SpeciesSelection | null;
  region: RegionFilter | null;
  month: MonthFilter | null;
  minObservations: number | null;

  setSpecies: (species: SpeciesSelection | null) => void;
  setRegion: (region: RegionFilter | null) => void;
  setMonth: (month: MonthFilter | null) => void;
  setMinObservations: (min: number | null) => void;
  clearAll: () => void;
};

export const useBirdFinderStore = create<BirdFinderState>()(
  persist(
    (set) => ({
      species: null,
      region: null,
      month: null,
      minObservations: null,

      setSpecies: (species) => set({ species }),
      setRegion: (region) => set({ region }),
      setMonth: (month) => set({ month }),
      setMinObservations: (minObservations) => set({ minObservations }),
      clearAll: () =>
        set({
          species: null,
          region: null,
          month: null,
          minObservations: null,
        }),
    }),
    {
      name: "bird-finder-filters",
    }
  )
);
