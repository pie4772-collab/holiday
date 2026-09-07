import { create } from 'zustand';

export const useAppStore = create((set) => ({
  role: 'employee',
  setRole: (role) => set({ role }),

  isRequestModalOpen: false,
  openRequestModal: () => set({ isRequestModalOpen: true }),
  closeRequestModal: () => set({ isRequestModalOpen: false }),

  selectedEmployeeId: null,
  setSelectedEmployeeId: (id) => set({ selectedEmployeeId: id }),
}));
