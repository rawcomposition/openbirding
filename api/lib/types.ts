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

import type { Generated } from "kysely";

export type PackDownload = {
  id: Generated<number>;
  packId: number;
  packRegion: string;
  method: string | null;
  appVersion: string | null;
  appPlatform: string | null;
  appEnvironment: string | null;
  userAgent: string | null;
  createdAt: Generated<string>;
};

export type MonthTarget = {
  locationId: string;
  speciesId: number;
  month: number;
  obs: number;
  samples: number;
};

export type YearTarget = {
  locationId: string;
  speciesId: number;
  obs: number;
  samples: number;
};

export type TargetSpecies = {
  id: number;
  code: string;
};

export type TargetHotspot = {
  id: string;
  name: string;
  countryCode: string;
  subnational1Code: string;
  subnational2Code: string;
  lat: number;
  lng: number;
  total: number;
  numSpecies: number;
  numChecklists: number;
};
