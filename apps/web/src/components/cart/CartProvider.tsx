import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { CART_STORAGE_KEY, type PlacementDetail } from '@reclo/shared'
import { toast } from 'sonner'
import { ApiRequestError, fetchPlacementDetail } from '@/lib/api'
import { createCartStore } from '@/lib/cartStore'
import { useT } from '@/i18n/useLocale'
import { CartContext, type CartContextValue } from './context'

interface Revalidated {
  id: string
  fresh: PlacementDetail | null
  gone: boolean
}

async function revalidate(id: string): Promise<Revalidated> {
  try {
    const detail = await fetchPlacementDetail(id)
    const active = detail.status === 'ACTIVE'
    return { id, fresh: active ? detail : null, gone: !active }
  } catch (error) {
    // A network or server error says nothing about the placement, so the item stays.
    return { id, fresh: null, gone: error instanceof ApiRequestError && error.status === 404 }
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const t = useT()
  const store = useState(createCartStore)[0]
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot)

  // Another tab writes through its own store, so this tab only hears about it here. A null key is
  // `localStorage.clear()`.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === CART_STORAGE_KEY) store.sync()
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [store])

  // Once per page load: drop placements that are gone and refresh the snapshots of the rest.
  const restored = useRef(false)
  const tRef = useRef(t)
  useEffect(() => {
    tRef.current = t
  }, [t])
  useEffect(() => {
    if (restored.current) return
    restored.current = true
    const ids = store.getSnapshot().items.map((item) => item.id)
    if (ids.length === 0) return

    void Promise.all(ids.map(revalidate)).then((results) => {
      const removed = results.filter((r) => r.gone).map((r) => r.id)
      const refreshed = results.flatMap((r) => (r.fresh ? [r.fresh] : []))
      if (removed.length === 0 && refreshed.length === 0) return
      // Announce only items still in the cart: the client may have removed some meanwhile.
      const present = new Set(store.getSnapshot().items.map((item) => item.id))
      const dropped = removed.filter((id) => present.has(id)).length
      store.applyRestore(refreshed, removed)
      if (dropped > 0) toast.info(tRef.current('cart.pruned', { count: dropped }))
    })
  }, [store])

  const warned = useRef(false)
  useEffect(() => {
    if (!snapshot.isPersistent && snapshot.items.length > 0 && !warned.current) {
      warned.current = true
      toast.warning(t('cart.notPersistent'))
    }
  }, [snapshot, t])

  const value = useMemo<CartContextValue>(
    () => ({
      items: snapshot.items,
      count: snapshot.items.length,
      isPersistent: snapshot.isPersistent,
      has: (id) => snapshot.items.some((item) => item.id === id),
      add: store.add,
      remove: store.remove,
      clear: store.clear,
    }),
    [snapshot, store],
  )

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}
