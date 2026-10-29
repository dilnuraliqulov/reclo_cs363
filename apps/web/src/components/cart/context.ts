import { createContext, useContext } from 'react'
import type { CartItem } from '@reclo/shared'
import type { CartStore } from '@/lib/cartStore'

export interface CartContextValue {
  items: readonly CartItem[]
  count: number
  isPersistent: boolean
  /** True for a signed-in client: the plan is saved on the account (KAN-32). */
  isAccount: boolean
  has: (id: string) => boolean
  add: CartStore['add']
  remove: CartStore['remove']
  clear: CartStore['clear']
}

export const CartContext = createContext<CartContextValue | null>(null)

export function useCart(): CartContextValue {
  const value = useContext(CartContext)
  if (!value) throw new Error('useCart must be used inside <CartProvider>')
  return value
}
