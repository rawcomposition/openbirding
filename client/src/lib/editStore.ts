import { create } from "zustand";
import type { Hotspot } from "./types";

type HotspotChange = {
  open?: boolean | null;
  notes?: string;
};

type EditableField = keyof HotspotChange;

type EditStore = {
  changes: Record<string, HotspotChange>;
  isEditMode: boolean;

  addChange: <K extends EditableField>(hotspotId: string, field: K, value: Hotspot[K], original: Hotspot[K]) => void;
  clearChanges: () => void;
  setEditMode: (isEdit: boolean) => void;
  getChanges: () => Array<{ id: string } & HotspotChange>;
  hasChanges: () => boolean;
  getChangeCount: () => number;
};

const isSame = (a: unknown, b: unknown) => {
  if (a == null && b == null) return true;
  return a === b;
};

export const useEditStore = create<EditStore>((set, get) => ({
  changes: {},
  isEditMode: false,

  addChange: (hotspotId, field, value, original) => {
    set((state) => {
      const existing = state.changes[hotspotId] ?? {};
      const keepField = !isSame(value, original);

      const nextForHotspot: HotspotChange = { ...existing };
      if (keepField) {
        (nextForHotspot as any)[field] = value as any;
      } else {
        delete (nextForHotspot as any)[field];
      }

      // If no fields left for this hotspot, drop the whole hotspot entry
      if (Object.keys(nextForHotspot).length === 0) {
        const { [hotspotId]: _, ...rest } = state.changes;
        return { changes: rest };
      }

      // Otherwise, upsert hotspot entry
      return {
        changes: {
          ...state.changes,
          [hotspotId]: nextForHotspot,
        },
      };
    });
  },

  removeChange: (hotspotId: string) => {
    set((state) => {
      const { [hotspotId]: _removed, ...remaining } = state.changes;
      return { changes: remaining };
    });
  },

  clearChanges: () => set({ changes: {} }),

  setEditMode: (isEdit: boolean) => {
    set({ isEditMode: isEdit });
    if (!isEdit) set({ changes: {} });
  },

  getChanges: () => {
    const changes = get().changes;
    return Object.entries(changes).map(([id, change]) => ({ id, ...change }));
  },

  hasChanges: () => Object.keys(get().changes).length > 0,

  getChangeCount: () => Object.keys(get().changes).length,
}));

export const useEditActions = () => {
  const store = useEditStore.getState();
  return {
    addChange: store.addChange,
  };
};

export const useEditMode = () => useEditStore((s) => s.isEditMode);
