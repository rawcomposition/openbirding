import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { LifeListEntry } from "@/lib/ebirdCsv";

export type LiferRegionFilter = {
  regionCode: string;
  regionName: string;
};

// Frequency presets (fraction of checklists) must match the buckets baked into
// lifers.db (see api/scripts/build-lifers-db.ts).
export const FREQUENCY_PRESETS: { value: number; label: string; hint: string }[] = [
  { value: 0.01, label: "1%", hint: "Rare — includes scarce & seasonal birds" },
  { value: 0.03, label: "3%", hint: "Uncommon" },
  { value: 0.05, label: "5%", hint: "Reasonable chance (default)" },
  { value: 0.1, label: "10%", hint: "Fairly reliable" },
  { value: 0.2, label: "20%", hint: "Likely on a visit" },
  { value: 0.3, label: "30%", hint: "Very likely" },
  { value: 0.5, label: "50%", hint: "Almost guaranteed" },
];

export const MIN_CHECKLIST_PRESETS = [10, 25, 50, 100, 250, 500];

type LiferTargetsState = {
  lifeList: LifeListEntry[] | null;
  fileName: string | null;
  uploadedAt: number | null;

  frequency: number;
  minChecklists: number;
  region: LiferRegionFilter | null;

  setLifeList: (entries: LifeListEntry[], fileName: string) => void;
  clearLifeList: () => void;
  setFrequency: (frequency: number) => void;
  setMinChecklists: (minChecklists: number) => void;
  setRegion: (region: LiferRegionFilter | null) => void;
};

export const useLiferTargetsStore = create<LiferTargetsState>()(
  persist(
    (set) => ({
      lifeList: null,
      fileName: null,
      uploadedAt: null,

      frequency: 0.05,
      minChecklists: 50,
      region: null,

      setLifeList: (entries, fileName) => set({ lifeList: entries, fileName, uploadedAt: Date.now() }),
      clearLifeList: () => set({ lifeList: null, fileName: null, uploadedAt: null }),
      setFrequency: (frequency) => set({ frequency }),
      setMinChecklists: (minChecklists) => set({ minChecklists }),
      setRegion: (region) => set({ region }),
    }),
    {
      name: "openbirding-lifer-targets",
      // The life list can be large; if it exceeds the storage quota we still
      // keep the tool working in-memory for the session.
      partialize: (state) => state,
    }
  )
);
