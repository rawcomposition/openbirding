export type Hotspot = {
  id: string;
  name: string;
  region: string;
  country: string | null;
  state: string | null;
  county: string | null;
  species: number;
  lat: number;
  lng: number;
  open: boolean | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  distance?: number; // only for nearby hotspots
};

export type Region = {
  id: string;
  name: string;
  longName: string;
  parents: {
    name: string;
    id: string;
  }[];
  level: number;
  hasChildren: boolean;
};

export type Subregion = Region & {
  hotspotCount: number;
  openHotspotCount: number;
  reviewedHotspotCount: number;
};

export type User = {
  id: string;
  email: string;
  emailVerified: number;
  isAdmin: number;
  createdAt: string;
  updatedAt: string;
};

export type AuthResponse = {
  user: User;
  session: {
    id: string;
    userId: string;
    createdAt: string;
  };
};

export type LoginData = {
  email: string;
  password: string;
};

export type SignupData = {
  email: string;
  password: string;
};
