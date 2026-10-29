import {
  CART_MAX_ITEMS,
  CART_STORAGE_KEY,
  CART_VERSION,
  type CartItem,
  type Locale,
  type PlacementDetail,
  type PlacementMarker,
} from '@reclo/shared'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthState } from '@/auth/useAuth'
import { LocaleProvider } from '@/i18n/LocaleProvider'
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
import { pinLocale } from '@/test/locale'
import { AddToCartButton } from './AddToCartButton'
import { CartDialog } from './CartDialog'
import { CartProvider } from './CartProvider'

const toastMock = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
}))
vi.mock('sonner', () => ({ toast: toastMock }))

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  fetchPlacementDetail: vi.fn(),
  fetchCart: vi.fn(),
  addCartItem: vi.fn(),
  removeCartItem: vi.fn(),
  clearCart: vi.fn(),
  mergeCart: vi.fn(),
}))
const fetchDetail = vi.mocked(fetchPlacementDetail)

const SIGNED_OUT: AuthState = {
  user: null,
  isLoading: false,
  setUser: () => undefined,
  signOut: () => Promise.resolve(),
}

const ID_A = 'b1e0696a-54c3-4d40-84c4-f2a89326e680'
const ID_B = '0d6c3c2e-0a52-4b0e-9d52-5f7a1d7d2b11'
const ID_C = '7a1f2b9c-3c44-4f1a-8a55-2c3b1e9d0f22'

const marker: PlacementMarker = {
  id: ID_A,
  title: 'Amir Temur Billboard',
  type: 'BILLBOARD',
  status: 'ACTIVE',
  latitude: 41.31,
  longitude: 69.28,
  address: 'Amir Temur Ave 10',
  city: 'Tashkent',
  pricePerMonth: 5_000_000,
}

function item(id: string, title: string, pricePerMonth = 1_000_000): CartItem {
  return {
    id,
    title,
    type: 'BILLBOARD',
    city: 'Tashkent',
    address: 'Somewhere 1',
    pricePerMonth,
    addedAt: '2026-10-01T10:00:00.000Z',
  }
}

function detailOf(base: CartItem, overrides: Partial<PlacementDetail> = {}): PlacementDetail {
  return {
    id: base.id,
    title: base.title,
    type: base.type,
    status: 'ACTIVE',
    latitude: 41.3,
    longitude: 69.2,
    address: base.address,
    city: base.city,
    pricePerMonth: base.pricePerMonth,
    tier: 'SILVER',
    description: null,
    width: null,
    height: null,
    lighting: false,
    photos: [],
    ledDurationSeconds: null,
    ledPlaysPerDay: null,
    vendorId: 'v1',
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
    ...overrides,
  }
}

function seed(items: CartItem[]) {
  window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify({ version: CART_VERSION, items }))
}

function storedIds(): string[] {
  const raw = window.localStorage.getItem(CART_STORAGE_KEY)
  return raw ? (JSON.parse(raw) as { items: CartItem[] }).items.map((i) => i.id) : []
}

function Harness({ auth = SIGNED_OUT }: { auth?: AuthState }) {
  return (
    <LocaleProvider>
      <AuthContext.Provider value={auth}>
        <CartProvider>
          <AddToCartButton placement={marker} />
          <CartDialog />
        </CartProvider>
      </AuthContext.Provider>
    </LocaleProvider>
  )
}

function renderApp(locale: Locale = 'en', auth: AuthState = SIGNED_OUT) {
  pinLocale(locale)
  return render(<Harness auth={auth} />)
}

async function openCart(user: ReturnType<typeof userEvent.setup>, name: RegExp) {
  await user.click(screen.getByRole('button', { name }))
}

beforeEach(() => {
  vi.clearAllMocks()
  // Default: revalidation finds nothing to change, so a test only mocks what it cares about.
  fetchDetail.mockRejectedValue(new ApiRequestError(0, 'offline'))
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('cart persistence', () => {
  it('survives an unmount and a fresh mount', async () => {
    const user = userEvent.setup()
    const first = renderApp()

    await user.click(screen.getByRole('button', { name: 'Add to media plan' }))
    expect(screen.getByRole('button', { name: 'In media plan' })).toBeInTheDocument()
    expect(storedIds()).toEqual([ID_A])
    first.unmount()

    renderApp()
    expect(screen.getByRole('button', { name: 'In media plan' })).toBeInTheDocument()
    await openCart(user, /^Media plan/)
    expect(await screen.findByText('1 placement')).toBeInTheDocument()
  })

  it('removes the item and the stored value when toggled off', async () => {
    const user = userEvent.setup()
    renderApp()

    await user.click(screen.getByRole('button', { name: 'Add to media plan' }))
    await user.click(screen.getByRole('button', { name: 'In media plan' }))

    expect(screen.getByRole('button', { name: 'Add to media plan' })).toBeInTheDocument()
    expect(window.localStorage.getItem(CART_STORAGE_KEY)).toBeNull()
  })

  it('lists items with a total, and clears them', async () => {
    seed([item(ID_B, 'Chilanzar LED', 2_000_000), item(ID_C, 'Yunusabad Billboard', 3_000_000)])
    const user = userEvent.setup()
    renderApp()

    await openCart(user, /^Media plan/)
    expect(await screen.findByText('Chilanzar LED')).toBeInTheDocument()
    expect(screen.getByText('Yunusabad Billboard')).toBeInTheDocument()
    expect(screen.getByText(/5\s000\s000 UZS/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Clear all' }))
    expect(screen.getByText('Your media plan is empty')).toBeInTheDocument()
    expect(window.localStorage.getItem(CART_STORAGE_KEY)).toBeNull()
  })

  it('removes a single row', async () => {
    seed([item(ID_B, 'Chilanzar LED'), item(ID_C, 'Yunusabad Billboard')])
    const user = userEvent.setup()
    renderApp()

    await openCart(user, /^Media plan/)
    await user.click(
      await screen.findByRole('button', { name: 'Remove from media plan: Chilanzar LED' }),
    )

    expect(screen.queryByText('Chilanzar LED')).not.toBeInTheDocument()
    expect(storedIds()).toEqual([ID_C])
  })
})

describe('unreadable stored data', () => {
  it.each([
    ['corrupt JSON', '{not json'],
    ['a wrong version', JSON.stringify({ version: 99, items: [item(ID_B, 'Old')] })],
    ['no version', JSON.stringify({ items: [item(ID_B, 'Old')] })],
    ['foreign data', JSON.stringify({ hello: 'world' })],
    ['a non-object', '42'],
    ['a malformed item', JSON.stringify({ version: 1, items: [{ id: 'nope' }] })],
    [
      'duplicate ids',
      JSON.stringify({ version: 1, items: [item(ID_B, 'One'), item(ID_B, 'Two')] }),
    ],
    [
      'more items than the maximum',
      JSON.stringify({
        version: 1,
        items: Array.from({ length: CART_MAX_ITEMS + 1 }, (_, n) =>
          item(`00000000-0000-4000-8000-${String(n).padStart(12, '0')}`, `P${n}`),
        ),
      }),
    ],
  ])('starts with an empty cart for %s', async (_name, raw) => {
    window.localStorage.setItem(CART_STORAGE_KEY, raw)
    const user = userEvent.setup()
    renderApp()

    expect(screen.getByRole('button', { name: 'Add to media plan' })).toBeInTheDocument()
    await openCart(user, /^Media plan/)
    expect(await screen.findByText('Your media plan is empty')).toBeInTheDocument()
    // Reading must not rewrite, let alone delete, what it could not understand.
    expect(window.localStorage.getItem(CART_STORAGE_KEY)).toBe(raw)
    expect(fetchDetail).not.toHaveBeenCalled()
  })

  it('replaces unreadable data on the next add', async () => {
    window.localStorage.setItem(CART_STORAGE_KEY, '{not json')
    const user = userEvent.setup()
    renderApp()

    await user.click(screen.getByRole('button', { name: 'Add to media plan' }))
    expect(storedIds()).toEqual([ID_A])
  })
})

describe('unavailable storage', () => {
  it('keeps working in memory when writes throw (quota exceeded)', async () => {
    pinLocale('en')
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError')
    })
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(screen.getByRole('button', { name: 'Add to media plan' }))

    expect(screen.getByRole('button', { name: 'In media plan' })).toBeInTheDocument()
    await waitFor(() =>
      expect(toastMock.warning).toHaveBeenCalledWith(
        'Your media plan cannot be saved on this device and will be lost on reload',
      ),
    )
    expect(toastMock.warning).toHaveBeenCalledTimes(1)
  })

  it('does not crash when reads throw, and still accepts items', async () => {
    pinLocale('en')
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(screen.getByRole('button', { name: 'Add to media plan' }))
    expect(screen.getByRole('button', { name: 'In media plan' })).toBeInTheDocument()
  })

  it('does not crash when the localStorage property itself throws', () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })

    expect(() => createCartStore()).not.toThrow()
    const store = createCartStore()
    expect(store.getSnapshot()).toEqual({ items: [], isPersistent: false })
    expect(store.add(marker)).toBe('added')
    expect(store.getSnapshot().items).toHaveLength(1)
  })
})

describe('adding', () => {
  it('ignores a duplicate add', () => {
    const store = createCartStore()

    expect(store.add(marker)).toBe('added')
    expect(store.add(marker)).toBe('duplicate')
    expect(store.getSnapshot().items).toHaveLength(1)
    expect(storedIds()).toEqual([ID_A])
  })

  it('refuses to go past the maximum and says so', async () => {
    const full = Array.from({ length: CART_MAX_ITEMS }, (_, n) =>
      item(`00000000-0000-4000-8000-${String(n).padStart(12, '0')}`, `P${n}`),
    )
    seed(full)
    const user = userEvent.setup()
    renderApp()

    await user.click(screen.getByRole('button', { name: 'Add to media plan' }))

    expect(screen.getByRole('button', { name: 'Add to media plan' })).toBeInTheDocument()
    expect(storedIds()).toHaveLength(CART_MAX_ITEMS)
    expect(toastMock.error).toHaveBeenCalledWith(
      `Your media plan is full (${CART_MAX_ITEMS} placements maximum)`,
    )
  })

  it('accepts exactly the maximum', () => {
    const store = createCartStore()
    for (let n = 0; n < CART_MAX_ITEMS; n++) {
      const id = `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
      expect(store.add({ ...marker, id })).toBe('added')
    }
    expect(store.add({ ...marker, id: ID_B })).toBe('full')
    expect(store.getSnapshot().items).toHaveLength(CART_MAX_ITEMS)
  })
})

describe('multi-tab sync', () => {
  function otherTabWrites(items: CartItem[]) {
    seed(items)
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: CART_STORAGE_KEY }))
    })
  }

  it('shows an item added in another tab', () => {
    renderApp()
    expect(screen.getByRole('button', { name: 'Add to media plan' })).toBeInTheDocument()

    otherTabWrites([item(ID_A, 'Amir Temur Billboard')])

    expect(screen.getByRole('button', { name: 'In media plan' })).toBeInTheDocument()
  })

  it('drops an item removed in another tab', async () => {
    const user = userEvent.setup()
    renderApp()
    await user.click(screen.getByRole('button', { name: 'Add to media plan' }))

    window.localStorage.removeItem(CART_STORAGE_KEY)
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: CART_STORAGE_KEY }))
    })

    expect(screen.getByRole('button', { name: 'Add to media plan' })).toBeInTheDocument()
  })

  it('treats localStorage.clear() in another tab (null key) as an empty cart', async () => {
    const user = userEvent.setup()
    renderApp()
    await user.click(screen.getByRole('button', { name: 'Add to media plan' }))

    window.localStorage.clear()
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: null }))
    })

    expect(screen.getByRole('button', { name: 'Add to media plan' })).toBeInTheDocument()
  })

  it('falls back to empty when another tab writes garbage', async () => {
    const user = userEvent.setup()
    renderApp()
    await user.click(screen.getByRole('button', { name: 'Add to media plan' }))

    window.localStorage.setItem(CART_STORAGE_KEY, '<<<')
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: CART_STORAGE_KEY }))
    })

    expect(screen.getByRole('button', { name: 'Add to media plan' })).toBeInTheDocument()
  })

  it('ignores storage events for other keys', async () => {
    const user = userEvent.setup()
    renderApp()
    await user.click(screen.getByRole('button', { name: 'Add to media plan' }))
    const getItem = vi.spyOn(Storage.prototype, 'getItem')

    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'reclo.locale' }))
    })

    expect(getItem).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'In media plan' })).toBeInTheDocument()
  })
})

describe('restoring a stored cart', () => {
  it('prunes placements that are gone or inactive, refreshes the rest, keeps the unknown', async () => {
    const active = item(ID_A, 'Old title', 1_000_000)
    const missing = item(ID_B, 'Deleted one')
    const archived = item('11111111-1111-4111-8111-111111111111', 'Archived one')
    const unknown = item(ID_C, 'Offline one')
    seed([active, missing, archived, unknown])
    fetchDetail.mockImplementation(async (id) => {
      if (id === active.id)
        return detailOf(active, { title: 'New title', pricePerMonth: 2_500_000 })
      if (id === missing.id) throw new ApiRequestError(404, 'Placement not found')
      if (id === archived.id) return detailOf(archived, { status: 'ARCHIVED' })
      throw new ApiRequestError(503, 'down')
    })
    const user = userEvent.setup()
    renderApp()

    await waitFor(() => expect(storedIds()).toEqual([active.id, unknown.id]))
    expect(toastMock.info).toHaveBeenCalledTimes(1)
    expect(toastMock.info).toHaveBeenCalledWith(
      '2 placements are no longer available and were removed from your media plan',
    )

    await openCart(user, /^Media plan/)
    expect(await screen.findByText('New title')).toBeInTheDocument()
    expect(screen.queryByText('Old title')).not.toBeInTheDocument()
    expect(screen.getByText('Offline one')).toBeInTheDocument()
  })

  it('keeps everything when the network is down', async () => {
    seed([item(ID_B, 'One'), item(ID_C, 'Two')])
    fetchDetail.mockRejectedValue(new ApiRequestError(0, 'Cannot reach the server'))
    renderApp()

    await waitFor(() => expect(fetchDetail).toHaveBeenCalledTimes(2))
    await act(async () => {})
    expect(storedIds()).toEqual([ID_B, ID_C])
    expect(toastMock.info).not.toHaveBeenCalled()
  })

  it('does not announce a placement the client already removed', async () => {
    const gone = item(ID_B, 'Gone')
    seed([gone])
    let reject: (error: Error) => void = () => {}
    fetchDetail.mockImplementation(() => new Promise((_, r) => (reject = r)))
    const user = userEvent.setup()
    renderApp()

    await openCart(user, /^Media plan/)
    await user.click(await screen.findByRole('button', { name: 'Remove from media plan: Gone' }))
    await act(async () => reject(new ApiRequestError(404, 'nope')))

    expect(toastMock.info).not.toHaveBeenCalled()
    expect(window.localStorage.getItem(CART_STORAGE_KEY)).toBeNull()
  })

  it('only revalidates once per page load', async () => {
    seed([item(ID_B, 'One')])
    renderApp()
    await waitFor(() => expect(fetchDetail).toHaveBeenCalledTimes(1))

    otherTab()
    await act(async () => {})
    expect(fetchDetail).toHaveBeenCalledTimes(1)

    function otherTab() {
      act(() => {
        window.dispatchEvent(new StorageEvent('storage', { key: CART_STORAGE_KEY }))
      })
    }
  })
})

describe('localized labels', () => {
  it('renders Russian', async () => {
    seed([item(ID_B, 'Chilanzar LED'), item(ID_C, 'Other'), item(ID_A, 'Third')])
    const user = userEvent.setup()
    renderApp('ru')

    expect(screen.getByRole('button', { name: 'В медиаплане' })).toBeInTheDocument()
    await openCart(user, /^Медиаплан/)
    expect(await screen.findByText('Ваш медиаплан')).toBeInTheDocument()
    expect(screen.getByText('3 места')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Очистить всё' })).toBeInTheDocument()
    expect(screen.getByText(/Всего в месяц/)).toBeInTheDocument()
  })

  it('renders Uzbek, including the empty state', async () => {
    const user = userEvent.setup()
    renderApp('uz')

    expect(screen.getByRole('button', { name: "Media rejaga qo'shish" })).toBeInTheDocument()
    await openCart(user, /^Media reja$/)
    expect(await screen.findByText("Media rejangiz bo'sh")).toBeInTheDocument()
  })

  it('uses the Russian plural form for the pruned toast', async () => {
    seed([item(ID_B, 'A')])
    fetchDetail.mockRejectedValue(new ApiRequestError(404, 'nope'))
    renderApp('ru')

    await waitFor(() =>
      expect(toastMock.info).toHaveBeenCalledWith(
        '1 место больше недоступно и удалено из медиаплана',
      ),
    )
  })
})

describe('account cart (KAN-32)', () => {
  const CLIENT: AuthState = {
    ...SIGNED_OUT,
    user: { id: 'client-1', email: 'client@example.com', role: 'CLIENT' },
  }
  const VENDOR: AuthState = {
    ...SIGNED_OUT,
    user: { id: 'vendor-1', email: 'vendor@example.com', role: 'VENDOR' },
  }

  beforeEach(() => {
    vi.mocked(mergeCart).mockResolvedValue([])
    vi.mocked(fetchCart).mockResolvedValue([])
    vi.mocked(addCartItem).mockResolvedValue([])
    vi.mocked(removeCartItem).mockResolvedValue([])
    vi.mocked(clearCart).mockResolvedValue([])
  })

  it('merges the browser cart into the account and shows the server answer', async () => {
    seed([item(ID_B, 'Kept'), item(ID_C, 'Gone')])
    vi.mocked(mergeCart).mockResolvedValue([item(ID_B, 'Kept'), item(ID_A, 'From account')])
    const user = userEvent.setup()
    renderApp('en', CLIENT)

    await waitFor(() => expect(storedIds()).toEqual([ID_B, ID_A]))
    expect(mergeCart).toHaveBeenCalledWith([ID_B, ID_C])
    expect(fetchDetail).not.toHaveBeenCalled()
    expect(toastMock.info).toHaveBeenCalledWith(
      '1 placement is no longer available and was removed from your media plan',
    )
    await openCart(user, /^Media plan/)
    expect(await screen.findByText('From account')).toBeInTheDocument()
  })

  it('says an empty account cart is saved to the account', async () => {
    const user = userEvent.setup()
    renderApp('en', CLIENT)
    await waitFor(() => expect(mergeCart).toHaveBeenCalledWith([]))

    await openCart(user, /^Media plan/)
    expect(
      await screen.findByText('Placements you have collected. They are saved to your account.'),
    ).toBeInTheDocument()
    expect(screen.getByText('Your media plan is empty')).toBeInTheDocument()
  })

  it('sends adds, removes and clear to the API', async () => {
    vi.mocked(addCartItem).mockResolvedValue([item(ID_A, marker.title)])
    const user = userEvent.setup()
    renderApp('en', CLIENT)
    await waitFor(() => expect(mergeCart).toHaveBeenCalled())

    await user.click(screen.getByRole('button', { name: 'Add to media plan' }))
    await waitFor(() => expect(addCartItem).toHaveBeenCalledWith(ID_A))
    await openCart(user, /^Media plan/)
    await user.click(
      await screen.findByRole('button', { name: `Remove from media plan: ${marker.title}` }),
    )
    await waitFor(() => expect(removeCartItem).toHaveBeenCalledWith(ID_A))
    expect(storedIds()).toEqual([])
  })

  it('does not call the API to remove an item that is not in the cart', async () => {
    seed([item(ID_B, 'Only')])
    vi.mocked(mergeCart).mockResolvedValue([item(ID_B, 'Only')])
    const user = userEvent.setup()
    renderApp('en', CLIENT)
    await waitFor(() => expect(mergeCart).toHaveBeenCalled())

    await openCart(user, /^Media plan/)
    await user.click(await screen.findByRole('button', { name: 'Clear all' }))
    await waitFor(() => expect(clearCart).toHaveBeenCalledTimes(1))
    expect(removeCartItem).not.toHaveBeenCalled()
  })

  it('reloads the account cart and explains when a write fails', async () => {
    vi.mocked(addCartItem).mockRejectedValue(
      new ApiRequestError(409, 'full', undefined, null, 'CART_FULL'),
    )
    const user = userEvent.setup()
    renderApp('en', CLIENT)
    await waitFor(() => expect(mergeCart).toHaveBeenCalled())

    await user.click(screen.getByRole('button', { name: 'Add to media plan' }))
    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith(
        'Your media plan could not be saved to your account',
        { description: 'Your media plan is full' },
      ),
    )
    await waitFor(() => expect(storedIds()).toEqual([]))
    expect(fetchCart).toHaveBeenCalledTimes(1)
  })

  it('keeps the local cart for vendors and visitors', async () => {
    seed([item(ID_B, 'Local')])
    const user = userEvent.setup()
    renderApp('en', VENDOR)

    await user.click(screen.getByRole('button', { name: 'Add to media plan' }))
    expect(storedIds()).toEqual([ID_B, ID_A])
    expect(mergeCart).not.toHaveBeenCalled()
    expect(addCartItem).not.toHaveBeenCalled()
  })

  it('clears the browser copy when the client signs out', async () => {
    vi.mocked(mergeCart).mockResolvedValue([item(ID_B, 'Mine')])
    const view = renderApp('en', CLIENT)
    await waitFor(() => expect(storedIds()).toEqual([ID_B]))

    view.rerender(<Harness auth={SIGNED_OUT} />)
    await waitFor(() => expect(storedIds()).toEqual([]))
    expect(clearCart).not.toHaveBeenCalled()
  })
})
