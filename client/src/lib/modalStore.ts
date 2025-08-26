import { create } from "zustand";

interface ModalStore {
  isOpen: boolean;
  hotspotId: string | null;
  openModal: (hotspotId: string) => void;
  closeModal: () => void;
}

export const useModalStore = create<ModalStore>((set) => ({
  isOpen: false,
  hotspotId: null,
  openModal: (hotspotId: string) => set({ isOpen: true, hotspotId }),
  closeModal: () => set({ isOpen: false, hotspotId: null }),
}));
