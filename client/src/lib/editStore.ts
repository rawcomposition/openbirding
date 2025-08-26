import { create } from "zustand";
import type { Hotspot } from "./types";

type HotspotChange = {
  open?: boolean | null;
  notes?: string;
};

type EditStore = {
  changes: Record<string, HotspotChange>;
  isEditMode: boolean;
  addChange: (hotspotId: string, field: keyof Hotspot, value: string | boolean | null) => void;
  removeChange: (hotspotId: string) => void;
  clearChanges: () => void;
  setEditMode: (isEdit: boolean) => void;
  getChanges: () => Array<{ id: string } & HotspotChange>;
  hasChanges: () => boolean;
  getChangeCount: () => number;
};

export const useEditStore = create<EditStore>((set, get) => ({
  changes: {},
  isEditMode: false,

  addChange: (hotspotId: string, field: keyof Hotspot, value: string | boolean | null) => {
    set((state) => {
      const existingChange = state.changes[hotspotId];
      const newChange = {
        ...existingChange,
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
    const changes = get().changes;
    return Object.entries(changes).map(([hotspotId, change]) => ({
      id: hotspotId,
      ...change,
    }));
  },

  hasChanges: () => {
    return Object.keys(get().changes).length > 0;
  },

  getChangeCount: () => {
    return Object.keys(get().changes).length;
  },
}));

export const useEditActions = () => {
  const store = useEditStore.getState();
  return {
    addChange: store.addChange,
    removeChange: store.removeChange,
  };
};

export const useEditMode = () => useEditStore((state) => state.isEditMode);
