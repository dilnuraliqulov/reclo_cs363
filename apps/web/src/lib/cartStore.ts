import {
  CART_MAX_ITEMS,
  CART_STORAGE_KEY,
  CART_VERSION,
  cartStateSchema,
  toCartItem,
  type CartItem,
  type CartState,
  type PlacementDetail,
  type PlacementMarker,
} from '@reclo/shared'

export interface CartSnapshot {
  items: readonly CartItem[]
  /** False once storage has failed: the cart still works, but will not survive a reload. */
  isPersistent: boolean
}

export type AddResult = 'added' | 'duplicate' | 'full'

export interface CartStore {
  subscribe: (listener: () => void) => () => void
  getSnapshot: () => CartSnapshot
  add: (placement: PlacementMarker | PlacementDetail) => AddResult
  remove: (id: string) => void
  clear: () => void
  /** Re-reads storage, for when another tab changed it. */
  sync: () => void
  /** Applies the outcome of revalidation to whatever the cart holds now. */
  applyRestore: (refreshed: readonly PlacementDetail[], removedIds: readonly string[]) => void
  /** Replaces the whole list with the account cart the server answered (KAN-32). */
  replace: (items: readonly CartItem[]) => void
}

function getStorage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    // Reading the property itself throws when storage is blocked.
    return null
  }
}

/**
 * Storage is never trusted: malformed JSON, a wrong shape, a wrong version or foreign data under
 * the key all read as an empty cart. `ok` is false only when storage itself is unavailable.
 */
export function readCart(): { items: CartItem[]; ok: boolean } {
  let raw: string | null
  try {
    const storage = getStorage()
    if (!storage) return { items: [], ok: false }
    raw = storage.getItem(CART_STORAGE_KEY)
  } catch {
    return { items: [], ok: false }
  }
  if (raw === null) return { items: [], ok: true }
  try {
    const parsed = cartStateSchema.safeParse(JSON.parse(raw))
    return { items: parsed.success ? parsed.data.items : [], ok: true }
  } catch {
    // JSON.parse on garbage.
    return { items: [], ok: true }
  }
}

function writeCart(items: readonly CartItem[]): boolean {
  try {
    const storage = getStorage()
    if (!storage) return false
    if (items.length === 0) {
      storage.removeItem(CART_STORAGE_KEY)
    } else {
      const state: CartState = { version: CART_VERSION, items: [...items] }
      storage.setItem(CART_STORAGE_KEY, JSON.stringify(state))
    }
    return true
  } catch {
    // Quota exceeded or storage blocked: keep the cart in memory.
    return false
  }
}

export function createCartStore(): CartStore {
  const initial = readCart()
  let snapshot: CartSnapshot = { items: initial.items, isPersistent: initial.ok }
  const listeners = new Set<() => void>()

  function commit(items: readonly CartItem[]) {
    snapshot = { items, isPersistent: writeCart(items) }
    listeners.forEach((listener) => listener())
  }

  return {
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    getSnapshot: () => snapshot,
    add(placement) {
      if (snapshot.items.some((item) => item.id === placement.id)) return 'duplicate'
      if (snapshot.items.length >= CART_MAX_ITEMS) return 'full'
      commit([...snapshot.items, toCartItem(placement)])
      return 'added'
    },
    remove(id) {
      if (!snapshot.items.some((item) => item.id === id)) return
      commit(snapshot.items.filter((item) => item.id !== id))
    },
    clear() {
      if (snapshot.items.length === 0) return
      commit([])
    },
    sync() {
      const next = readCart()
      snapshot = { items: next.items, isPersistent: next.ok }
      listeners.forEach((listener) => listener())
    },
    applyRestore(refreshed, removedIds) {
      const byId = new Map(refreshed.map((placement) => [placement.id, placement]))
      const removed = new Set(removedIds)
      commit(
        snapshot.items
          .filter((item) => !removed.has(item.id))
          .map((item) => {
            const fresh = byId.get(item.id)
            return fresh ? toCartItem(fresh, item.addedAt) : item
          }),
      )
    },
    replace(items) {
      commit(items)
    },
  }
}
