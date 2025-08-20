import { create } from "zustand";
import type { Hotspot } from "./types";

type HotspotChange = {
  _id: string;
  open?: boolean;
  notes?: string;
};

type HotspotStore = {
  changes: Record<string, HotspotChange>;
  isEditMode: boolean;
  addChange: (hotspotId: string, field: keyof Hotspot, value: string | boolean | undefined) => void;
  removeChange: (hotspotId: string) => void;
  clearChanges: () => void;
  setEditMode: (isEdit: boolean) => void;
  getChanges: () => HotspotChange[];
  hasChanges: () => boolean;
};

export const useHotspotStore = create<HotspotStore>((set, get) => ({
  changes: {},
  isEditMode: false,

  addChange: (hotspotId: string, field: keyof Hotspot, value: string | boolean | undefined) => {
    set((state) => {
      const existingChange = state.changes[hotspotId];
      const newChange = {
        ...existingChange,
        _id: hotspotId,
        [field]: value,
      };

      return {
        changes: {
          ...state.changes,
          [hotspotId]: newChange,
        },
      };
    });
  },

  removeChange: (hotspotId: string) => {
    set((state) => {
      const { [hotspotId]: removed, ...remainingChanges } = state.changes;
      return { changes: remainingChanges };
    });
  },

  clearChanges: () => {
    set({ changes: {} });
  },

  setEditMode: (isEdit: boolean) => {
    set({ isEditMode: isEdit });
    if (!isEdit) {
      set({ changes: {} });
    }
  },

  getChanges: () => {
    return Object.values(get().changes);
  },

  hasChanges: () => {
    return Object.keys(get().changes).length > 0;
  },
}));

// Write-only interface for rows to avoid subscribing to changes
export const useHotspotActions = () => {
  const store = useHotspotStore.getState();
  return {
    addChange: store.addChange,
    removeChange: store.removeChange,
  };
};

export const useEditMode = () => useHotspotStore((state) => state.isEditMode);
