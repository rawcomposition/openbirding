export type Hotspot = {
  rowId?: number;
  id: string;
  name: string;
  region: string;
  country: string | null;
  state: string | null;
  county: string | null;
  species: number;
  lat: number;
  lng: number;
  open: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

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
};
