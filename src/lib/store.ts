import { create } from 'zustand';

interface UIState {
  isSidebarOpen: boolean;
  toggleSidebar: () => void;
  activeModal: 'NONE' | 'SETTINGS' | 'DELETE_CONFIRM' | 'UPGRADE_PRO';
  setActiveModal: (modal: 'NONE' | 'SETTINGS' | 'DELETE_CONFIRM' | 'UPGRADE_PRO') => void;
  
  // Job Tracking State (Optimistic UI context)
  activeJobId: string | null;
  setActiveJobId: (id: string | null) => void;
}

export const useUIStore = create<UIState>((set) => ({
  isSidebarOpen: false,
  toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
  
  activeModal: 'NONE',
  setActiveModal: (modal) => set({ activeModal: modal }),
  
  activeJobId: null,
  setActiveJobId: (id) => set({ activeJobId: id }),
}));
