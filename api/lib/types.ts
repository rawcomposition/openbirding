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
  open: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type HotspotsResponse = {
  hotspots: Hotspot[];
  count: number;
  page: number;
  limit: number;
  totalPages: number;
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
};
