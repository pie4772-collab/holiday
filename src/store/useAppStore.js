import { create } from 'zustand';

export const useAppStore = create((set) => ({
  role: 'employee',
  setRole: (role) => set({ role }),

  isRequestModalOpen: false,
  requestStartDate: null,
  lastRequestMessage: '',
  openRequestModal: (date) =>
    set({
      isRequestModalOpen: true,
      requestStartDate: date || null,
      lastRequestMessage: '',
    }),
  closeRequestModal: () =>
    set({
      isRequestModalOpen: false,
      requestStartDate: null,
    }),
  setLastRequestMessage: (message) => set({ lastRequestMessage: message || '' }),
  clearLastRequestMessage: () => set({ lastRequestMessage: '' }),

  selectedEmployeeId: null,
  setSelectedEmployeeId: (id) => set({ selectedEmployeeId: id }),
}));
