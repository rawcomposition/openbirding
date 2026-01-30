import { create } from "zustand";
import { persist } from "zustand/middleware";

export type RegionType = "region" | "radius" | "custom";

export type RegionFilter = {
  type: RegionType;
  regionCode?: string;
  regionName?: string;
  radius?: {
    lat: number;
    lng: number;
    km: number;
    locationName?: string;
  };
  customArea?: {
    // For future map implementation
    bounds?: [number, number, number, number];
  };
};

// Array of selected months (1-12), null means all months
export type MonthsFilter = number[];

export type SpeciesSelection = {
  code: string;
  name: string;
  sciName: string;
};

type BirdFinderState = {
  species: SpeciesSelection | null;
  region: RegionFilter | null;
  months: MonthsFilter | null;
  minObservations: number | null;

  setSpecies: (species: SpeciesSelection | null) => void;
  setRegion: (region: RegionFilter | null) => void;
  setMonths: (months: MonthsFilter | null) => void;
  setMinObservations: (min: number | null) => void;
  clearAll: () => void;
};

export const useBirdFinderStore = create<BirdFinderState>()(
  persist(
    (set) => ({
      species: null,
      region: null,
      months: null,
      minObservations: null,

      setSpecies: (species) => set({ species }),
      setRegion: (region) => set({ region }),
      setMonths: (months) => set({ months }),
      setMinObservations: (minObservations) => set({ minObservations }),
      clearAll: () =>
        set({
          species: null,
          region: null,
          months: null,
          minObservations: null,
        }),
    }),
    {
      name: "bird-finder-filters",
    }
  )
);
