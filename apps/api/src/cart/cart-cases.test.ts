import { CART_MAX_ITEMS, type CartItem } from '@reclo/shared'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createApp } from '../app'
import { SESSION_COOKIE } from '../auth/session'
import { createMemoryAuthStore } from '../test-helpers'
import type { CartStore } from './store'

// KAN-33: the cart rules end to end through the routes, against an in-memory store with the same
// semantics as PrismaCartStore (one row per user and placement, ACTIVE placements only, a limit).

const PASSWORD = 'correct-horse'
const ID_A = 'b1e0696a-54c3-4d40-84c4-f2a89326e680'
const ID_B = '0d6c3c2e-0a52-4b0e-9d52-5f7a1d7d2b11'
const MISSING = '7a1f2b9c-3c44-4f1a-8a55-2c3b1e9d0f22'

function placement(id: string, title: string): CartItem {
  return {
    id,
    title,
    type: 'BILLBOARD',
    city: 'Tashkent',
    address: 'Amir Temur Ave 10',
    pricePerMonth: 1_000_000,
    addedAt: '2026-10-29T10:00:00.000Z',
  }
}

function createMemoryCartStore(active: CartItem[]): CartStore {
  const catalog = new Map(active.map((item) => [item.id, item]))
  const carts = new Map<string, string[]>()
  const ids = (userId: string) => carts.get(userId) ?? []
  const read = (userId: string) => ids(userId).map((id) => catalog.get(id)!)

  return {
    list: async (userId) => read(userId),
    add: async (userId, placementId) => {
      if (!catalog.has(placementId)) return { outcome: 'not_found' }
      if (ids(userId).includes(placementId)) return { outcome: 'present', items: read(userId) }
      if (ids(userId).length >= CART_MAX_ITEMS) return { outcome: 'full' }
      carts.set(userId, [...ids(userId), placementId])
      return { outcome: 'added', items: read(userId) }
    },
    remove: async (userId, placementId) => {
      carts.set(
        userId,
        ids(userId).filter((id) => id !== placementId),
      )
      return read(userId)
    },
    clear: async (userId) => {
      carts.delete(userId)
    },
    merge: async (userId, placementIds) => {
      for (const id of placementIds) {
        if (catalog.has(id) && !ids(userId).includes(id) && ids(userId).length < CART_MAX_ITEMS) {
          carts.set(userId, [...ids(userId), id])
        }
      }
      return read(userId)
    },
  }
}

async function setup() {
  const memory = createMemoryAuthStore()
  const app = createApp({
    checkDatabase: async () => {},
    authStore: memory.store,
    cartStore: createMemoryCartStore([placement(ID_A, 'A'), placement(ID_B, 'B')]),
  })

  async function client(email: string): Promise<string> {
    const response = await request(app)
      .post('/api/auth/register')
      .send({ email, password: PASSWORD })
    memory.setRole(email, 'CLIENT')
    const header = response.headers['set-cookie'] as unknown as string[]
    return (header.find((value) => value.startsWith(`${SESSION_COOKIE}=`)) ?? '').split(';')[0]!
  }

  return { app, alice: await client('alice@example.com'), bob: await client('bob@example.com') }
}

const idsOf = (body: { items: CartItem[] }) => body.items.map((item) => item.id)

describe('cart rules (KAN-33)', () => {
  it('answers an empty cart for a client who has added nothing', async () => {
    const { app, alice } = await setup()

    const res = await request(app).get('/api/cart').set('Cookie', alice)

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ items: [] })
  })

  it('keeps one row when the same placement is added twice', async () => {
    const { app, alice } = await setup()

    const first = await request(app).put(`/api/cart/items/${ID_A}`).set('Cookie', alice)
    const second = await request(app).put(`/api/cart/items/${ID_A}`).set('Cookie', alice)

    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    expect(idsOf(second.body)).toEqual([ID_A])
  })

  it('holds several placements and keeps the order they were added in', async () => {
    const { app, alice } = await setup()

    await request(app).put(`/api/cart/items/${ID_B}`).set('Cookie', alice)
    const res = await request(app).put(`/api/cart/items/${ID_A}`).set('Cookie', alice)

    expect(idsOf(res.body)).toEqual([ID_B, ID_A])
  })

  it('answers 200 and the unchanged cart when removing a placement that is not in it', async () => {
    const { app, alice } = await setup()
    await request(app).put(`/api/cart/items/${ID_A}`).set('Cookie', alice)

    const res = await request(app).delete(`/api/cart/items/${ID_B}`).set('Cookie', alice)

    expect(res.status).toBe(200)
    expect(idsOf(res.body)).toEqual([ID_A])
  })

  it('answers 200 when removing from an empty cart', async () => {
    const { app, alice } = await setup()

    const res = await request(app).delete(`/api/cart/items/${ID_A}`).set('Cookie', alice)

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ items: [] })
  })

  it('answers 404 PLACEMENT_NOT_FOUND for a placement that does not exist', async () => {
    const { app, alice } = await setup()

    const res = await request(app).put(`/api/cart/items/${MISSING}`).set('Cookie', alice)

    expect(res.status).toBe(404)
    expect(res.body.code).toBe('PLACEMENT_NOT_FOUND')
  })

  it("never shows or changes another client's cart", async () => {
    const { app, alice, bob } = await setup()
    await request(app).put(`/api/cart/items/${ID_A}`).set('Cookie', alice)

    const bobsCart = await request(app).get('/api/cart').set('Cookie', bob)
    await request(app).delete(`/api/cart/items/${ID_A}`).set('Cookie', bob)
    await request(app).delete('/api/cart').set('Cookie', bob)
    const alicesCart = await request(app).get('/api/cart').set('Cookie', alice)

    expect(bobsCart.body).toEqual({ items: [] })
    expect(idsOf(alicesCart.body)).toEqual([ID_A])
  })

  it('clears to an empty cart, and clearing an empty cart is not an error', async () => {
    const { app, alice } = await setup()
    await request(app).put(`/api/cart/items/${ID_A}`).set('Cookie', alice)

    const cleared = await request(app).delete('/api/cart').set('Cookie', alice)
    const again = await request(app).delete('/api/cart').set('Cookie', alice)
    const after = await request(app).get('/api/cart').set('Cookie', alice)

    expect(cleared.body).toEqual({ items: [] })
    expect(again.status).toBe(200)
    expect(after.body).toEqual({ items: [] })
  })

  it('merges without duplicating what is already in the cart', async () => {
    const { app, alice } = await setup()
    await request(app).put(`/api/cart/items/${ID_A}`).set('Cookie', alice)

    const res = await request(app)
      .post('/api/cart/merge')
      .set('Cookie', alice)
      .send({ placementIds: [ID_A, ID_B, MISSING] })

    expect(res.status).toBe(200)
    expect(idsOf(res.body)).toEqual([ID_A, ID_B])
  })

  it('rejects a merge with duplicate ids as INVALID_INPUT', async () => {
    const { app, alice } = await setup()

    const res = await request(app)
      .post('/api/cart/merge')
      .set('Cookie', alice)
      .send({ placementIds: [ID_A, ID_A] })

    expect(res.status).toBe(400)
    expect(res.body.code).toBe('INVALID_INPUT')
  })
})
