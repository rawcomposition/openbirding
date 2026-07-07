export type HotspotItem = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  regionCode: string;
  regionName: string | null;
  lifers: number;
  totalSpecies: number;
  checklists: number;
};

export type HotspotResponse = {
  items: HotspotItem[];
  meta: {
    hotspotsInScope: number;
    seenMatched: number;
    seenUnmatched: number;
    frequencyPct: number;
    minChecklists: number;
  };
  citation?: string;
  queryTime: string;
};

export type HotspotLifer = {
  code: string;
  name: string;
  sciName: string;
  frequency: number;
  score: number;
  photo: { url: string; by: string } | null;
};

export type HotspotDetailResponse = {
  locationId: string;
  lifers: HotspotLifer[];
  liferCount: number;
  frequency: number;
};

export type StatusResponse = { ready: boolean; resolutions?: number[] };

export type ListResponse = { token: string; count: number; matched: number; unmatchedCount: number };

export type CellInfo = {
  h3: string;
  samples: number;
  totalSpecies: number;
  lifers: number;
  namedHotspots: number;
  hotspotChecklists: number;
};
