import { create } from "zustand";
import { persist } from "zustand/middleware";

export type RegionFilter = {
  regionCode?: string;
  regionName?: string;
};

export type BboxFilter = {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
};

export type CustomAreaFilter = {
  polygon: [number, number][];
  bbox: BboxFilter;
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
  customArea: CustomAreaFilter | null;
  month: MonthFilter | null;
  minObservations: number | null;

  setSpecies: (species: SpeciesSelection | null) => void;
  setRegion: (region: RegionFilter | null) => void;
  setCustomArea: (customArea: CustomAreaFilter | null) => void;
  setMonth: (month: MonthFilter | null) => void;
  setMinObservations: (min: number | null) => void;
  clearAll: () => void;
};

export const useBirdFinderStore = create<BirdFinderState>()(
  persist(
    (set) => ({
      species: null,
      region: null,
      customArea: null,
      month: null,
      minObservations: null,

      setSpecies: (species) => set({ species }),
      setRegion: (region) => set({ region, customArea: null }),
      setCustomArea: (customArea) => set({ customArea, region: null }),
      setMonth: (month) => set({ month }),
      setMinObservations: (minObservations) => set({ minObservations }),
      clearAll: () =>
        set({
          species: null,
          region: null,
          customArea: null,
          month: null,
          minObservations: null,
        }),
    }),
    {
      name: "bird-finder-filters",
    }
  )
);
