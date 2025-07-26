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
  updatedAt: Date;
};

export type HotspotsResponse = {
  hotspots: Hotspot[];
  count: number;
};
