import { create } from 'zustand';
import { ToastItem } from '../types';

type ToastType = ToastItem['type'];

interface ToastStore {
  toasts: ToastItem[];
  show: (message: string, type: ToastType, duration?: number) => void;
  hide: (id: string) => void;
}

export const useToast = create<ToastStore>((set) => ({
  toasts: [],

  show: (message, type, duration = 3000) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const toast: ToastItem = { id, message, type, duration };

    set((state) => ({ toasts: [...state.toasts, toast] }));

    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
    }, duration);
  },

  hide: (id) => {
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
  },
}));
