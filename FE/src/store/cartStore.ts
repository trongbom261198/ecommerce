import { create } from 'zustand'

interface CartState {
  itemCount: number
  setItemCount: (count: number) => void
  incrementCount: () => void
}

export const useCartStore = create<CartState>((set) => ({
  itemCount: 0,
  setItemCount: (count) => set({ itemCount: count }),
  incrementCount: () => set((state) => ({ itemCount: state.itemCount + 1 })),
}))
