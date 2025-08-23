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
  updatedAt: Date;
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
