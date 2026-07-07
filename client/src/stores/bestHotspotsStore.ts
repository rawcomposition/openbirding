import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Bbox } from "@/components/LiferGridMap";
import type { HotspotItem } from "@/components/besthotspots/types";

export type HexSelection = {
  resolution: number;
  cells: string[];
};

export type Viewport = { bbox: Bbox; resolution: number };

export const FREQUENCY_PRESETS: { value: number; label: string }[] = [
  { value: 0.05, label: "5%" },
  { value: 0.1, label: "10%" },
  { value: 0.2, label: "20%" },
  { value: 0.3, label: "30%" },
  { value: 0.5, label: "50%" },
];

export const MIN_CHECKLIST_PRESETS = [25, 50, 100, 250, 500];

type BestHotspotsState = {
  listToken: string | null;
  fileName: string | null;
  speciesCount: number | null;
  uploadedAt: number | null;

  frequency: number;
  minChecklists: number;

  setListInfo: (info: { token: string; fileName: string | null; count: number }) => void;
  clearLifeList: () => void;
  setFrequency: (frequency: number) => void;
  setMinChecklists: (minChecklists: number) => void;
};

export const useBestHotspotsStore = create<BestHotspotsState>()(
  persist(
    (set) => ({
      listToken: null,
      fileName: null,
      speciesCount: null,
      uploadedAt: null,

      frequency: 0.1,
      minChecklists: 50,

      setListInfo: ({ token, fileName, count }) =>
        set({ listToken: token, fileName, speciesCount: count, uploadedAt: Date.now() }),
      clearLifeList: () =>
        set({ listToken: null, fileName: null, speciesCount: null, uploadedAt: null }),
      setFrequency: (frequency) => set({ frequency }),
      setMinChecklists: (minChecklists) => set({ minChecklists }),
    }),
    {
      name: "openbirding-best-hotspots",
      partialize: (state) => ({
        listToken: state.listToken,
        fileName: state.fileName,
        speciesCount: state.speciesCount,
        uploadedAt: state.uploadedAt,
        frequency: state.frequency,
        minChecklists: state.minChecklists,
      }),
    }
  )
);

type BestHotspotsSessionState = {
  viewport: Viewport | null;
  selectedHotspot: HotspotItem | null;
  selection: HexSelection | null;

  setViewport: (viewport: Viewport) => void;
  setSelectedHotspot: (hotspot: HotspotItem | null) => void;
  toggleCell: (h3: string, resolution: number) => void;
  clearSelection: () => void;
};

export const useBestHotspotsSession = create<BestHotspotsSessionState>((set) => ({
  viewport: null,
  selectedHotspot: null,
  selection: null,

  setViewport: (viewport) => set({ viewport }),
  setSelectedHotspot: (selectedHotspot) => set({ selectedHotspot }),

  toggleCell: (h3, resolution) =>
    set((s) => {
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
}));
