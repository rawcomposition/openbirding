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
  tags?: string[];
};

export type HotspotsResponse = {
  hotspots: Hotspot[];
  count: number;
  page: number;
  limit: number;
  totalPages: number;
};

export enum TagCategory {
  Fees = "fees",
  Access = "access",
  Hours = "hours",
  Safety = "safety",
}

export type Tag = {
  name: string;
  id: string;
  category: TagCategory;
  icon: string;
  color: string;
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
