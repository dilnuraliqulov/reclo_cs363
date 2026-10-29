import type { CartItem } from '@reclo/shared'

/** What `add` did. `not_found` covers a placement that is missing or not ACTIVE. */
export type AddToCartResult =
  | { outcome: 'added' | 'present'; items: CartItem[] }
  | { outcome: 'not_found' }
  | { outcome: 'full' }

/**
 * Persistence for a signed-in client's media plan (KAN-31). Injected into `createApp` so route
 * tests need no database. Every method that returns items returns the whole cart, oldest first,
 * after dropping rows whose placement is no longer ACTIVE.
 */
export interface CartStore {
  list: (userId: string) => Promise<CartItem[]>
  /** Idempotent: a placement already in the cart is `present`, not an error. */
  add: (userId: string, placementId: string) => Promise<AddToCartResult>
  /** Idempotent: removing a placement that is not in the cart is not an error. */
  remove: (userId: string, placementId: string) => Promise<CartItem[]>
  clear: (userId: string) => Promise<void>
  /**
   * Adds the ACTIVE placements among `placementIds` that are not in the cart yet, in the order
   * given, until the cart is full. The rest are skipped silently: the caller compares the answer
   * with what it sent.
   */
  merge: (userId: string, placementIds: readonly string[]) => Promise<CartItem[]>
}
