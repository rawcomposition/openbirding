export type Hotspot = {
  _id: string;
  name: string;
  region: string;
  country: string;
  state: string;
  county: string;
  species: number;
  location: {
    type: "Point";
    coordinates: [number, number];
  };
  open: boolean | null;
  notes?: string;
  updatedAt: Date;
  tags?: string[];
  distance?: number;
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
};
