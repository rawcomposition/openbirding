import type { RangeSortColumn, RangeSortDirection } from "@/stores/rangeSizeStore";

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
  regionPct: number;
  worldPct: number;
  photo: { url: string; by: string } | null;
};

export type RangeSizesResponse = {
  items: RangeSpecies[];
  meta: {
    region: string;
    regionName: string;
    sort: RangeSortColumn;
    direction: RangeSortDirection;
    total: number;
    offset: number;
    limit: number;
    seenMatched: number | null;
    resolution: number;
    minObs: number;
    minChecklists: number;
  };
  citation?: string;
  taxonomyVersion?: string | null;
  queryTime: string;
};
