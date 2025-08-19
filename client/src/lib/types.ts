export type Hotspot = {
  _id: string;
  name: string;
  region: string;
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
};
