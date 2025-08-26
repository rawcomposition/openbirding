export type Hotspot = {
  id: string;
  name: string;
  region: string;
  country: string | null;
  state: string | null;
  county: string | null;
  species: number;
  lat: number;
  lng: number;
  open: boolean | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  distance?: number; // only for nearby hotspots
};

export type HotspotsResponse = {
  hotspots: Hotspot[];
  count: number;
};

export type Region = {
  _id: string;
  name: string;
  longName: string;
  parents: {
    name: string;
    id: string;
  }[];
  isCountry?: boolean;
  hasChildren?: boolean;
  hotspotCount?: number;
  openHotspotCount?: number;
  reviewedHotspotCount?: number;
};
