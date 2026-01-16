export type Region = {
  id: string;
  name: string;
  longName: string | null;
  parents: string; // JSON array
  level: number; // 1: country, 2: state, 3: county
  hasChildren: number; // 0: no, 1: yes
};

export type Pack = {
  id: number;
  region: string;
  hotspots: number | null;
  lastSynced: string | null;
  minX: number | null;
  minY: number | null;
  maxX: number | null;
  maxY: number | null;
  centerLat: number | null;
  centerLng: number | null;
  hasCustomCenter: boolean | null;
};

export type Cluster = {
  packId: number;
  lat: number;
  lng: number;
  count: number;
};
