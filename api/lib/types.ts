export type Hotspot = {
  _id: string;
  name: string;
  lat: number;
  lng: number;
  country: string;
  state: string;
  county: string;
  species: number;
  createdAt: string;
  updatedAt: string;
};

export type HotspotsResponse = {
  hotspots: Hotspot[];
  count: number;
};
