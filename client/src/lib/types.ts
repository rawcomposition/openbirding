export type TargetHotspot = {
  id: string;
  name: string;
  region: string | null;
  lat: number;
  lng: number;
  frequency: number;
  score: number;
  samples: number;
  distance?: number;
};
