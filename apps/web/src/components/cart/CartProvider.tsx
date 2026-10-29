import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import { CART_STORAGE_KEY, type CartItem, type PlacementDetail } from '@reclo/shared'
import { toast } from 'sonner'
import { useAuth } from '@/auth/useAuth'
import {
  ApiRequestError,
  addCartItem,
  clearCart,
  fetchCart,
  fetchPlacementDetail,
  mergeCart,
  removeCartItem,
} from '@/lib/api'
import { createCartStore } from '@/lib/cartStore'
import { useMessages } from '@/lib/messages'
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

/** Not yet decided: the first GET /api/auth/me has not answered. */
const UNKNOWN = Symbol('unknown')

export function CartProvider({ children }: { children: ReactNode }) {
  const t = useT()
  const { apiErrorText } = useMessages()
  const { user, isLoading } = useAuth()
  const store = useState(createCartStore)[0]
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot)

  // Only a signed-in CLIENT has an account cart (docs/media-plan-cart-design.md). Everyone else
  // keeps the browser cart of KAN-18.
  const clientId = user?.role === 'CLIENT' ? user.id : null
  const clientRef = useRef(clientId)
  useEffect(() => {
    clientRef.current = clientId
  }, [clientId])

  // Another tab writes through its own store, so this tab only hears about it here. A null key is
  // `localStorage.clear()`.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === CART_STORAGE_KEY) store.sync()
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [store])

  const tRef = useRef(t)
  const errorTextRef = useRef(apiErrorText)
  useEffect(() => {
    tRef.current = t
    errorTextRef.current = apiErrorText
  }, [t, apiErrorText])

  // Once the session is known, and again whenever it changes: a client's browser cart is merged
  // into the account and the server's answer replaces it; a visitor's cart is revalidated once.
  const settledFor = useRef<string | null | typeof UNKNOWN>(UNKNOWN)
  useEffect(() => {
    if (isLoading || settledFor.current === clientId) return
    // Once per page load for a visitor: drop placements that are gone and refresh the rest.
    function restoreLocal() {
      const localIds = store.getSnapshot().items.map((item) => item.id)
      if (localIds.length === 0) return
      void Promise.all(localIds.map(revalidate)).then((results) => {
        const removed = results.filter((r) => r.gone).map((r) => r.id)
        const refreshed = results.flatMap((r) => (r.fresh ? [r.fresh] : []))
        if (removed.length === 0 && refreshed.length === 0) return
        // Announce only items still in the cart: the client may have removed some meanwhile.
        const present = new Set(store.getSnapshot().items.map((item) => item.id))
        const dropped = removed.filter((id) => present.has(id)).length
        store.applyRestore(refreshed, removed)
        if (dropped > 0) toast.info(tRef.current('cart.pruned', { count: dropped }))
      })
    }

    const previous = settledFor.current
    settledFor.current = clientId

    if (clientId === null) {
      // Signed out: the plan is safe on the account, and a shared computer must not show it.
      if (previous !== UNKNOWN && previous !== null) store.clear()
      else if (previous === UNKNOWN) restoreLocal()
      return
    }

    const ids = store.getSnapshot().items.map((item) => item.id)
    mergeCart(ids)
      .then((items) => {
        if (clientRef.current !== clientId) return
        const kept = new Set(items.map((item) => item.id))
        const dropped = ids.filter((id) => !kept.has(id)).length
        store.replace(items)
        if (dropped > 0) toast.info(tRef.current('cart.pruned', { count: dropped }))
      })
      .catch(() => {
        // Offline or a server error: keep the local list; the next write talks to the API again.
      })
  }, [isLoading, clientId, store])

  /** Writes are optimistic: the local list changes first, then the server's cart replaces it. */
  const sync = useCallback(
    (write: () => Promise<CartItem[]>) => {
      const owner = clientRef.current
      if (owner === null) return
      write()
        .then((items) => {
          if (clientRef.current === owner) store.replace(items)
        })
        .catch((error: unknown) => {
          toast.error(tRef.current('cart.syncFailed'), {
            description: errorTextRef.current(error),
          })
          fetchCart()
            .then((items) => {
              if (clientRef.current === owner) store.replace(items)
            })
            .catch(() => {
              // Still unreachable: the local list stays as it is.
            })
        })
    },
    [store],
  )

  const add = useCallback<CartContextValue['add']>(
    (placement) => {
      const result = store.add(placement)
      if (result === 'added') sync(() => addCartItem(placement.id))
      return result
    },
    [store, sync],
  )
  const remove = useCallback<CartContextValue['remove']>(
    (id) => {
      const present = store.getSnapshot().items.some((item) => item.id === id)
      store.remove(id)
      if (present) sync(() => removeCartItem(id))
    },
    [store, sync],
  )
  const clear = useCallback<CartContextValue['clear']>(() => {
    store.clear()
    sync(clearCart)
  }, [store, sync])

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
      isAccount: clientId !== null,
      has: (id) => snapshot.items.some((item) => item.id === id),
      add,
      remove,
      clear,
    }),
    [snapshot, clientId, add, remove, clear],
  )

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}
