export type TargetHotspot = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  frequency: number;
  score: number;
  samples: number;
  distance?: number;
};
