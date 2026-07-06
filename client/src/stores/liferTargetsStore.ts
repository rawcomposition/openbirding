import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { LifeListEntry } from "@/lib/ebirdCsv";

export type LiferRegionFilter = {
  regionCode: string;
  regionName: string;
};

/** A hex-cell selection is always tagged with the resolution it was made at, so
 * it can be cleared automatically when the map's resolution changes. */
export type HexSelection = {
  resolution: number;
  cells: string[]; // h3 index strings (hex)
};

// Frequency presets (fraction of checklists) must match the buckets baked into
// lifers.db (see api/scripts/build-lifers-db.ts). These scope hotspot results
// only — never the grid colour.
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

  // Filters — apply to hotspot RESULTS only, not the grid colour.
  frequency: number;
  minChecklists: number;

  // Scope for hotspot results: one or more regions, OR a hex-cell selection.
  // Hex selection takes priority when present; clearing it reverts to regions.
  regions: LiferRegionFilter[];
  selection: HexSelection | null;

  setLifeList: (entries: LifeListEntry[], fileName: string) => void;
  clearLifeList: () => void;
  setFrequency: (frequency: number) => void;
  setMinChecklists: (minChecklists: number) => void;

  addRegion: (region: LiferRegionFilter) => void;
  removeRegion: (regionCode: string) => void;
  clearRegions: () => void;

  toggleCell: (h3: string, resolution: number) => void;
  clearSelection: () => void;
};

export const useLiferTargetsStore = create<LiferTargetsState>()(
  persist(
    (set) => ({
      lifeList: null,
      fileName: null,
      uploadedAt: null,

      frequency: 0.05,
      minChecklists: 50,

      regions: [],
      selection: null,

      setLifeList: (entries, fileName) => set({ lifeList: entries, fileName, uploadedAt: Date.now() }),
      clearLifeList: () => set({ lifeList: null, fileName: null, uploadedAt: null }),
      setFrequency: (frequency) => set({ frequency }),
      setMinChecklists: (minChecklists) => set({ minChecklists }),

      addRegion: (region) =>
        set((s) =>
          s.regions.some((r) => r.regionCode === region.regionCode)
            ? s
            : { regions: [...s.regions, region] }
        ),
      removeRegion: (regionCode) =>
        set((s) => ({ regions: s.regions.filter((r) => r.regionCode !== regionCode) })),
      clearRegions: () => set({ regions: [] }),

      toggleCell: (h3, resolution) =>
        set((s) => {
          // A selection at a different resolution is stale — start fresh.
          if (!s.selection || s.selection.resolution !== resolution) {
            return { selection: { resolution, cells: [h3] } };
          }
          const has = s.selection.cells.includes(h3);
          const cells = has
            ? s.selection.cells.filter((c) => c !== h3)
            : [...s.selection.cells, h3];
          return { selection: cells.length ? { resolution, cells } : null };
        }),
      clearSelection: () => set({ selection: null }),
    }),
    {
      name: "openbirding-lifer-targets",
      version: 1,
      // Persist the life list, filters and region scope — but not the transient
      // hex selection, which is tied to a specific map resolution.
      partialize: (state) => ({
        lifeList: state.lifeList,
        fileName: state.fileName,
        uploadedAt: state.uploadedAt,
        frequency: state.frequency,
        minChecklists: state.minChecklists,
        regions: state.regions,
      }),
      migrate: (persisted: unknown, version: number) => {
        // v0 stored a single `region` and a `mode`; carry the region across.
        if (version === 0 && persisted && typeof persisted === "object") {
          const old = persisted as Record<string, unknown>;
          const region = old.region as LiferRegionFilter | null;
          return { ...old, regions: region ? [region] : [], region: undefined, mode: undefined };
        }
        return persisted as never;
      },
    }
  )
);
