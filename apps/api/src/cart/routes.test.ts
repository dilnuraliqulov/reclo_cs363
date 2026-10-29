import { CART_MAX_ITEMS, cartResponseSchema, errorCodeSchema, type CartItem } from '@reclo/shared'
import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../app'
import { SESSION_COOKIE } from '../auth/session'
import { createMemoryAuthStore } from '../test-helpers'
import type { CartStore } from './store'

const ID = 'b1e0696a-54c3-4d40-84c4-f2a89326e680'
const OTHER_ID = '6f1f3c55-8a1e-4f7a-9d1c-2b6f0d1e9a10'
const PASSWORD = 'correct-horse'

const item: CartItem = {
  id: ID,
  title: 'Amir Temur Billboard',
  type: 'BILLBOARD',
  city: 'Tashkent',
  address: 'Amir Temur Ave 10',
  pricePerMonth: 5_000_000,
  photo: 'https://api.example.com/uploads/placements/x/a.jpg',
  addedAt: '2026-10-29T10:00:00.000Z',
}

function setup(options: { rateLimit?: number } = {}) {
  const memory = createMemoryAuthStore()
  const store = {
    list: vi.fn<CartStore['list']>(async () => [item]),
    add: vi.fn<CartStore['add']>(async () => ({ outcome: 'added', items: [item] })),
    remove: vi.fn<CartStore['remove']>(async () => []),
    clear: vi.fn<CartStore['clear']>(async () => {}),
    merge: vi.fn<CartStore['merge']>(async () => [item]),
  }

  const app = createApp({
    checkDatabase: async () => {},
    authStore: memory.store,
    cartStore: store,
    ...(options.rateLimit ? { cartRateLimitMax: options.rateLimit } : {}),
  })

  async function signIn(email: string, role: 'CLIENT' | 'VENDOR' | 'ADMIN'): Promise<string> {
    const response = await request(app)
      .post('/api/auth/register')
      .send({ email, password: PASSWORD })
    memory.setRole(email, role)
    const header = response.headers['set-cookie'] as unknown as string[]
    const cookie = header.find((value) => value.startsWith(`${SESSION_COOKIE}=`)) ?? ''
    return cookie.split(';')[0] ?? ''
  }

  return {
    app,
    store,
    signIn,
    async client(email = 'client@example.com') {
      const cookie = await signIn(email, 'CLIENT')
      const id = memory.users.find((user) => user.email === email)?.id ?? ''
      return { cookie, id }
    },
  }
}

type Verb = 'get' | 'put' | 'delete' | 'post'
const routes: [string, Verb, string][] = [
  ['list', 'get', '/api/cart'],
  ['add', 'put', `/api/cart/items/${ID}`],
  ['remove', 'delete', `/api/cart/items/${ID}`],
  ['clear', 'delete', '/api/cart'],
  ['merge', 'post', '/api/cart/merge'],
]

describe('access', () => {
  it.each(routes)('%s answers 401 with a code and no session', async (_name, verb, url) => {
    const { app, store } = setup()

    const res = await request(app)[verb](url).send({ placementIds: [] })

    expect(res.status).toBe(401)
    expect(res.body).toEqual({ error: 'Not authenticated', code: 'NOT_AUTHENTICATED' })
    for (const fn of Object.values(store)) expect(fn).not.toHaveBeenCalled()
  })

  it.each(['VENDOR', 'ADMIN'] as const)('%s gets 403 on every route', async (role) => {
    const { app, store, signIn } = setup()
    const cookie = await signIn(`${role.toLowerCase()}@example.com`, role)

    for (const [, verb, url] of routes) {
      const res = await request(app)[verb](url).set('Cookie', cookie).send({ placementIds: [] })
      expect(res.status).toBe(403)
      expect(res.body.code).toBe('FORBIDDEN')
    }
    for (const fn of Object.values(store)) expect(fn).not.toHaveBeenCalled()
  })

  it('reads the user id from the session on every route', async () => {
    const { app, store, client } = setup()
    const { cookie, id } = await client()

    for (const [, verb, url] of routes) {
      const res = await request(app)[verb](url).set('Cookie', cookie).send({ placementIds: [] })
      expect(res.status).toBe(200)
    }
    expect(store.list).toHaveBeenCalledWith(id)
    expect(store.add).toHaveBeenCalledWith(id, ID)
    expect(store.remove).toHaveBeenCalledWith(id, ID)
    expect(store.clear).toHaveBeenCalledWith(id)
    expect(store.merge).toHaveBeenCalledWith(id, [])
  })
})

describe('GET /api/cart', () => {
  it('answers the cart in the shared response shape', async () => {
    const { app, client } = setup()
    const { cookie } = await client()

    const res = await request(app).get('/api/cart').set('Cookie', cookie)

    expect(res.status).toBe(200)
    expect(cartResponseSchema.parse(res.body)).toEqual({ items: [item] })
  })

  it('answers 500 with a code when the store fails', async () => {
    const { app, store, client } = setup()
    const { cookie } = await client()
    store.list.mockRejectedValueOnce(new Error('db down'))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await request(app).get('/api/cart').set('Cookie', cookie)

    expect(res.status).toBe(500)
    expect(res.body.code).toBe('INTERNAL')
  })
})

describe('PUT /api/cart/items/:placementId', () => {
  it('adds and answers the whole cart', async () => {
    const { app, client } = setup()
    const { cookie } = await client()

    const res = await request(app).put(`/api/cart/items/${ID}`).set('Cookie', cookie)

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ items: [item] })
  })

  it('answers 200 when the placement is already in the cart', async () => {
    const { app, store, client } = setup()
    const { cookie } = await client()
    store.add.mockResolvedValueOnce({ outcome: 'present', items: [item] })

    const res = await request(app).put(`/api/cart/items/${ID}`).set('Cookie', cookie)

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ items: [item] })
  })

  it('answers 400 INVALID_PLACEMENT_ID for an id that is not a uuid', async () => {
    const { app, store, client } = setup()
    const { cookie } = await client()

    const res = await request(app).put('/api/cart/items/not-a-uuid').set('Cookie', cookie)

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'Invalid placement id', code: 'INVALID_PLACEMENT_ID' })
    expect(store.add).not.toHaveBeenCalled()
  })

  it('answers 404 PLACEMENT_NOT_FOUND for a missing or inactive placement', async () => {
    const { app, store, client } = setup()
    const { cookie } = await client()
    store.add.mockResolvedValueOnce({ outcome: 'not_found' })

    const res = await request(app).put(`/api/cart/items/${ID}`).set('Cookie', cookie)

    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'Placement not found', code: 'PLACEMENT_NOT_FOUND' })
  })

  it('answers 409 CART_FULL when the cart holds the maximum', async () => {
    const { app, store, client } = setup()
    const { cookie } = await client()
    store.add.mockResolvedValueOnce({ outcome: 'full' })

    const res = await request(app).put(`/api/cart/items/${ID}`).set('Cookie', cookie)

    expect(res.status).toBe(409)
    expect(res.body).toEqual({ error: 'The media plan is full', code: 'CART_FULL' })
    expect(errorCodeSchema.safeParse(res.body.code).success).toBe(true)
  })
})

describe('DELETE /api/cart/items/:placementId', () => {
  it('removes and answers the cart', async () => {
    const { app, client } = setup()
    const { cookie } = await client()

    const res = await request(app).delete(`/api/cart/items/${OTHER_ID}`).set('Cookie', cookie)

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ items: [] })
  })

  it('answers 400 INVALID_PLACEMENT_ID for an id that is not a uuid', async () => {
    const { app, store, client } = setup()
    const { cookie } = await client()

    const res = await request(app).delete('/api/cart/items/123').set('Cookie', cookie)

    expect(res.status).toBe(400)
    expect(res.body.code).toBe('INVALID_PLACEMENT_ID')
    expect(store.remove).not.toHaveBeenCalled()
  })
})

describe('DELETE /api/cart', () => {
  it('clears and answers an empty cart', async () => {
    const { app, store, client } = setup()
    const { cookie, id } = await client()

    const res = await request(app).delete('/api/cart').set('Cookie', cookie)

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ items: [] })
    expect(store.clear).toHaveBeenCalledWith(id)
  })
})

describe('POST /api/cart/merge', () => {
  it('passes the ids in order and answers the merged cart', async () => {
    const { app, store, client } = setup()
    const { cookie, id } = await client()

    const res = await request(app)
      .post('/api/cart/merge')
      .set('Cookie', cookie)
      .send({ placementIds: [OTHER_ID, ID] })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ items: [item] })
    expect(store.merge).toHaveBeenCalledWith(id, [OTHER_ID, ID])
  })

  it.each([
    ['a missing body', undefined],
    ['ids that are not uuids', { placementIds: ['nope'] }],
    ['duplicate ids', { placementIds: [ID, ID] }],
    [
      'more ids than the cart holds',
      { placementIds: Array.from({ length: CART_MAX_ITEMS + 1 }, () => crypto.randomUUID()) },
    ],
  ])('answers 400 INVALID_INPUT for %s', async (_name, body) => {
    const { app, store, client } = setup()
    const { cookie } = await client()

    const res = await request(app).post('/api/cart/merge').set('Cookie', cookie).send(body)

    expect(res.status).toBe(400)
    expect(res.body.code).toBe('INVALID_INPUT')
    expect(store.merge).not.toHaveBeenCalled()
  })
})

describe('rate limit', () => {
  it('answers 429 RATE_LIMITED past the write limit, and still serves reads', async () => {
    const { app, client } = setup({ rateLimit: 2 })
    const { cookie } = await client()

    await request(app).put(`/api/cart/items/${ID}`).set('Cookie', cookie)
    await request(app).delete(`/api/cart/items/${ID}`).set('Cookie', cookie)
    const limited = await request(app).put(`/api/cart/items/${ID}`).set('Cookie', cookie)
    const read = await request(app).get('/api/cart').set('Cookie', cookie)

    expect(limited.status).toBe(429)
    expect(limited.body.code).toBe('RATE_LIMITED')
    expect(read.status).toBe(200)
  })
})
