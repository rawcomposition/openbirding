export type Hotspot = {
  id: string;
  rowId?: number;
  name: string;
  region: string | null;
  country: string | null;
  state: string | null;
  county: string | null;
  species: number;
  lat: number;
  lng: number;
  open: number | null;
  notes: string | null;
  lastUpdatedBy: string | null;
  createdAt: string;
  updatedAt: string | null;
};

export type HotspotRevision = {
  id: number;
  hotspotId: string;
  userId: string;
  notes: string | null;
  open: number | null;
  createdAt: string;
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

export type User = {
  id: string;
  email: string;
  name: string | null;
  password?: string;
  emailVerified: number; // 0 or 1
  isAdmin: number; // 0 or 1
  createdAt: string; // ISO date string
  updatedAt: string; // ISO date string
};

export type Session = {
  id: string;
  userId: string;
  secretHash: Uint8Array;
  createdAt: string; // ISO date string
};

export type SessionWithToken = Session & {
  token: string;
};

export type LoginAttempt = {
  id?: number;
  email: string;
  ipAddress: string;
  attemptedAt: string; // ISO date string
  success: number; // 0 or 1
};

export type EmailVerificationToken = {
  id: string;
  userId: string;
  expiresAt: string; // ISO date string
};

export type PasswordResetToken = {
  id: string;
  userId: string;
  expiresAt: string; // ISO date string
};
