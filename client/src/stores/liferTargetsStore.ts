import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { LifeListEntry } from "@/lib/ebirdCsv";

/** A hex-cell selection is always tagged with the resolution it was made at, so
 * it can be cleared automatically when the map's resolution changes. */
export type HexSelection = {
  resolution: number;
  cells: string[]; // h3 index strings (hex)
};

// Frequency presets (fraction of checklists) must match the buckets baked into
// occurrences.db (see api/scripts/build-occurrences-db.ts). These scope hotspot results
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
  // The life list itself lives server-side (POST /lifers/list); the client
  // keeps only this anonymous token, so revisits restore instantly and every
  // query sends ~40 bytes instead of the full species payload.
  listToken: string | null;
  fileName: string | null;
  speciesCount: number | null;
  uploadedAt: number | null;

  // v1 persisted the raw parsed entries in localStorage. Kept after migration
  // until they've been uploaded once to mint a token, then cleared.
  legacyLifeList: LifeListEntry[] | null;

  // Filters — apply to hotspot RESULTS only, not the grid colour.
  frequency: number;
  minChecklists: number;

  // Optional narrowing of the hotspot results: a hex-cell selection. Without
  // one, results are scoped to the current map viewport.
  selection: HexSelection | null;

  setListInfo: (info: { token: string; fileName: string | null; count: number }) => void;
  clearLifeList: () => void;
  setFrequency: (frequency: number) => void;
  setMinChecklists: (minChecklists: number) => void;

  toggleCell: (h3: string, resolution: number) => void;
  clearSelection: () => void;
};

export const useLiferTargetsStore = create<LiferTargetsState>()(
  persist(
    (set) => ({
      listToken: null,
      fileName: null,
      speciesCount: null,
      uploadedAt: null,
      legacyLifeList: null,

      frequency: 0.05,
      minChecklists: 50,

      selection: null,

      setListInfo: ({ token, fileName, count }) =>
        set({ listToken: token, fileName, speciesCount: count, uploadedAt: Date.now(), legacyLifeList: null }),
      clearLifeList: () =>
        set({ listToken: null, fileName: null, speciesCount: null, uploadedAt: null, legacyLifeList: null }),
      setFrequency: (frequency) => set({ frequency }),
      setMinChecklists: (minChecklists) => set({ minChecklists }),

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
      version: 3,
      // Persist the list token and filters — but not the transient hex
      // selection, which is tied to a specific map resolution.
      partialize: (state) => ({
        listToken: state.listToken,
        fileName: state.fileName,
        speciesCount: state.speciesCount,
        uploadedAt: state.uploadedAt,
        legacyLifeList: state.legacyLifeList,
        frequency: state.frequency,
        minChecklists: state.minChecklists,
      }),
      migrate: (persisted: unknown, version: number) => {
        if (!persisted || typeof persisted !== "object") return persisted as never;
        let old = persisted as Record<string, unknown>;
        // v1 stored the raw entries; stash them so the page can upload them
        // once to mint a server-side token.
        if (version <= 1) {
          const entries = (old.lifeList as LifeListEntry[] | null) ?? null;
          old = {
            ...old,
            listToken: null,
            speciesCount: entries?.length ?? null,
            legacyLifeList: entries,
            lifeList: undefined,
          };
        }
        // v2 -> v3 dropped region scoping (results scope to the viewport now).
        if (version <= 2) {
          old = { ...old, regions: undefined, region: undefined, mode: undefined };
        }
        return old as never;
      },
    }
  )
);
