import type { RangeSort } from "@/stores/rangeRestrictedStore";

export type RangeRegion = {
  code: string;
  name: string;
  surveyedCells: number;
};

export type RangeRegionsResponse = {
  regions: RangeRegion[];
};

export type RangeSpecies = {
  rank: number;
  code: string;
  name: string;
  sciName: string;
  regionCells: number;
  regionPct: number;
  worldCells: number;
  worldPct: number;
  photo: { url: string; by: string } | null;
};

export type RangeSpeciesResponse = {
  items: RangeSpecies[];
  meta: {
    region: string;
    regionName: string;
    sort: RangeSort;
    total: number;
    offset: number;
    limit: number;
    regionSurveyedCells: number;
    worldSurveyedCells: number;
    seenMatched: number | null;
    resolution: number;
    minObs: number;
    minChecklists: number;
  };
  citation?: string;
  taxonomyVersion?: string | null;
  queryTime: string;
};
