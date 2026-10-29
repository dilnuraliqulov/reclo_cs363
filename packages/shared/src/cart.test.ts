import { describe, expect, it } from 'vitest'
import { CART_MAX_ITEMS, CART_VERSION, cartItemSchema, cartStateSchema, toCartItem } from './cart'
import type { PlacementMarker } from './placement'

const marker: PlacementMarker = {
  id: 'b1e0696a-54c3-4d40-84c4-f2a89326e680',
  title: 'Amir Temur Billboard',
  type: 'BILLBOARD',
  status: 'ACTIVE',
  latitude: 41.3,
  longitude: 69.2,
  address: 'Amir Temur Ave 10',
  city: 'Tashkent',
  pricePerMonth: 5_000_000,
  photo: 'https://example.com/a.jpg',
}

describe('cartStateSchema', () => {
  it('accepts a snapshot built from a marker', () => {
    const state = { version: CART_VERSION, items: [toCartItem(marker)] }
    expect(cartStateSchema.safeParse(state).success).toBe(true)
  })

  it('omits the photo when the marker has none', () => {
    const bare: PlacementMarker = { ...marker }
    delete bare.photo
    expect(toCartItem(bare)).not.toHaveProperty('photo')
    expect(cartItemSchema.safeParse(toCartItem(bare)).success).toBe(true)
  })

  it('rejects another version', () => {
    expect(cartStateSchema.safeParse({ version: 2, items: [] }).success).toBe(false)
  })

  it('rejects duplicate ids', () => {
    const one = toCartItem(marker)
    expect(cartStateSchema.safeParse({ version: CART_VERSION, items: [one, one] }).success).toBe(
      false,
    )
  })

  it('rejects more than the maximum', () => {
    const items = Array.from({ length: CART_MAX_ITEMS + 1 }, (_, n) =>
      toCartItem({ ...marker, id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}` }),
    )
    expect(cartStateSchema.safeParse({ version: CART_VERSION, items }).success).toBe(false)
  })

  it('rejects an item with a bad id or price', () => {
    const good = toCartItem(marker)
    expect(cartItemSchema.safeParse({ ...good, id: 'x' }).success).toBe(false)
    expect(cartItemSchema.safeParse({ ...good, pricePerMonth: -1 }).success).toBe(false)
    expect(cartItemSchema.safeParse({ ...good, addedAt: 'yesterday' }).success).toBe(false)
  })
})
