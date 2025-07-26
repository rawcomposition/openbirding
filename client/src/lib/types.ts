export type Hotspot = {
  _id: string;
  name: string;
  country: string;
  state: string;
  county: string;
  species: number;
  location: {
    type: "Point";
    coordinates: [number, number];
  };
  updatedAt: string;
  tags?: string[];
};

export type HotspotsResponse = {
  hotspots: Hotspot[];
  count: number;
  page: number;
  limit: number;
  totalPages: number;
};

export type Tag = {
  name: string;
  id: string;
  category: string;
  icon: string;
  color: string;
};
