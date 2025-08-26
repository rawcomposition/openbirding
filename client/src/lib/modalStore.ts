import { create } from "zustand";

type ModalStore = {
  isOpen: boolean;
  hotspotId: string | null;
  openModal: (hotspotId: string) => void;
  closeModal: () => void;
  clickOutside: (e: React.MouseEvent<HTMLDivElement>) => void;
};

export const useModalStore = create<ModalStore>((set) => ({
  isOpen: false,
  hotspotId: null,
  openModal: (hotspotId: string) => set({ isOpen: true, hotspotId }),
  closeModal: () => set({ isOpen: false, hotspotId: null }),
  clickOutside: (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (
      !target.closest("button") &&
      !target.closest("a") &&
      !target.closest('[role="button"]') &&
      !target.closest(".mapboxgl-canvas")
    ) {
      set({ isOpen: false, hotspotId: null });
    }
  },
}));

export const useModalActions = () => {
  const store = useModalStore.getState();
  return {
    clickOutside: store.clickOutside,
    closeModal: store.closeModal,
    openModal: store.openModal,
  };
};
