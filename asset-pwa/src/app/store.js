import { create } from "zustand";
export const useAuth = create((set) => ({
  user: null,           // { name, role, token } later
  login: (user) => set({ user }),
  logout: () => set({ user: null }),
}));
