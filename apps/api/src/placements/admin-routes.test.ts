import {
  adminPlacementListResponseSchema,
  adminPlacementResponseSchema,
  errorCodeSchema,
  type AdminPlacementDetail,
} from '@reclo/shared'
import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../app'
import { SESSION_COOKIE } from '../auth/session'
import { createMemoryAuthStore } from '../test-helpers'
import type { AdminPlacementStore, DecisionResult } from './admin-store'

const ID = 'b1e0696a-54c3-4d40-84c4-f2a89326e680'
const PASSWORD = 'correct-horse'
const UPDATED_AT = '2026-10-12T15:00:00.000Z'

const detail: AdminPlacementDetail = {
  id: ID,
  title: 'Amir Temur Billboard',
  type: 'BILLBOARD',
  status: 'PENDING_REVIEW',
  latitude: 41.311,
  longitude: 69.279,
  address: 'Amir Temur Ave 10',
  city: 'Tashkent',
  pricePerMonth: 5_000_000,
  tier: 'SILVER',
  description: null,
  width: null,
  height: null,
  lighting: false,
  ledDurationSeconds: null,
  ledPlaysPerDay: null,
  photos: ['https://api.example.com/uploads/placements/x/a.jpg'],
  vendorId: 'vendor-1',
  createdAt: '2026-10-10T10:00:00.000Z',
  updatedAt: UPDATED_AT,
  archivedAt: null,
  vendor: { id: 'vendor-1', name: 'vendor', email: 'vendor@example.com' },
  events: [],
}

function setup(options: { rateLimit?: number } = {}) {
  const memory = createMemoryAuthStore()
  const decision = (placement: AdminPlacementDetail): DecisionResult => ({ ok: true, placement })
  const store = {
    list: vi.fn<AdminPlacementStore['list']>(async () => ({
      placements: [
        {
          id: ID,
          title: detail.title,
          type: detail.type,
          city: detail.city,
          pricePerMonth: detail.pricePerMonth,
          status: detail.status,
          cover: detail.photos[0] ?? null,
          photoCount: 1,
          vendorName: 'vendor',
          updatedAt: UPDATED_AT,
        },
      ],
      total: 1,
    })),
    findById: vi.fn<AdminPlacementStore['findById']>(async (id) => (id === ID ? detail : null)),
    approve: vi.fn<AdminPlacementStore['approve']>(async () =>
      decision({ ...detail, status: 'ACTIVE' }),
    ),
    reject: vi.fn<AdminPlacementStore['reject']>(async () =>
      decision({ ...detail, status: 'REJECTED' }),
    ),
  }

  const app = createApp({
    checkDatabase: async () => {},
    authStore: memory.store,
    adminPlacementStore: store,
    ...(options.rateLimit ? { adminRateLimitMax: options.rateLimit } : {}),
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
    async admin() {
      const cookie = await signIn('admin@example.com', 'ADMIN')
      const id = memory.users.find((user) => user.email === 'admin@example.com')?.id ?? ''
      return { cookie, id }
    },
  }
}

const approveBody = { expectedUpdatedAt: UPDATED_AT }
const rejectBody = { expectedUpdatedAt: UPDATED_AT, reason: 'The photo is blurry and unreadable' }

type Verb = 'get' | 'post'
const routes: [string, Verb, string][] = [
  ['list', 'get', '/api/admin/placements'],
  ['get', 'get', `/api/admin/placements/${ID}`],
  ['approve', 'post', `/api/admin/placements/${ID}/approve`],
  ['reject', 'post', `/api/admin/placements/${ID}/reject`],
]

describe('access', () => {
  it.each(routes)('%s answers 401 with a code and no session', async (_name, verb, url) => {
    const { app, store } = setup()

    const res = await request(app)[verb](url).send(approveBody)

    expect(res.status).toBe(401)
    expect(res.body).toEqual({ error: 'Not authenticated', code: 'NOT_AUTHENTICATED' })
    for (const fn of Object.values(store)) expect(fn).not.toHaveBeenCalled()
  })

  it.each(['VENDOR', 'CLIENT'] as const)('%s gets 403 on every route', async (role) => {
    const { app, store, signIn } = setup()
    const cookie = await signIn(`${role.toLowerCase()}@example.com`, role)

    for (const [name, verb, url] of routes) {
      const res = await request(app)[verb](url).set('Cookie', cookie).send(rejectBody)
      expect(res.status, name).toBe(403)
      expect(res.body, name).toEqual({ error: 'Forbidden', code: 'FORBIDDEN' })
    }
    for (const fn of Object.values(store)) expect(fn).not.toHaveBeenCalled()
  })

  it('does not mount the routes without a store', async () => {
    const memory = createMemoryAuthStore()
    const app = createApp({ checkDatabase: async () => {}, authStore: memory.store })

    const res = await request(app).get('/api/admin/placements')

    expect(res.status).toBe(404)
  })
})

describe('GET /api/admin/placements', () => {
  it('defaults to the pending queue, first page of 20, and returns a schema-valid body', async () => {
    const { app, store, admin } = setup()
    const { cookie } = await admin()

    const res = await request(app).get('/api/admin/placements').set('Cookie', cookie)

    expect(res.status).toBe(200)
    expect(adminPlacementListResponseSchema.safeParse(res.body).success).toBe(true)
    expect(store.list).toHaveBeenCalledWith({ status: 'PENDING_REVIEW', page: 1, pageSize: 20 })
  })

  it('passes the status, type, city and paging filters to the store', async () => {
    const { app, store, admin } = setup()
    const { cookie } = await admin()

    await request(app)
      .get('/api/admin/placements')
      .query({ status: 'REJECTED', type: 'LED_SCREEN', city: ' Samarkand ', page: 2, pageSize: 5 })
      .set('Cookie', cookie)

    expect(store.list).toHaveBeenCalledWith({
      status: 'REJECTED',
      type: 'LED_SCREEN',
      city: 'Samarkand',
      page: 2,
      pageSize: 5,
    })
  })

  it.each([
    { status: 'DELETED' },
    { type: 'TRAIN' },
    { page: 0 },
    { pageSize: 51 },
    { pageSize: 'many' },
  ])('answers 400 INVALID_QUERY for %o', async (query) => {
    const { app, store, admin } = setup()
    const { cookie } = await admin()

    const res = await request(app).get('/api/admin/placements').query(query).set('Cookie', cookie)

    expect(res.status).toBe(400)
    expect(res.body.code).toBe('INVALID_QUERY')
    expect(store.list).not.toHaveBeenCalled()
  })
})

describe('GET /api/admin/placements/:id', () => {
  it('returns the listing with its vendor and events', async () => {
    const { app, admin } = setup()
    const { cookie } = await admin()

    const res = await request(app).get(`/api/admin/placements/${ID}`).set('Cookie', cookie)

    expect(res.status).toBe(200)
    expect(adminPlacementResponseSchema.parse(res.body).placement.vendor.email).toBe(
      'vendor@example.com',
    )
  })

  it('answers 404 PLACEMENT_NOT_FOUND for an unknown listing', async () => {
    const { app, admin } = setup()
    const { cookie } = await admin()

    const res = await request(app)
      .get('/api/admin/placements/00000000-0000-4000-8000-000000000000')
      .set('Cookie', cookie)

    expect(res.status).toBe(404)
    expect(res.body.code).toBe('PLACEMENT_NOT_FOUND')
  })

  it.each(routes.slice(1))('%s answers 400 INVALID_PLACEMENT_ID for a bad id', async (_n, verb) => {
    const { app, store, admin } = setup()
    const { cookie } = await admin()
    const suffix = _n === 'get' ? '' : `/${_n}`

    const res = await request(app)
      [verb](`/api/admin/placements/not-a-uuid${suffix}`)
      .set('Cookie', cookie)
      .send(rejectBody)

    expect(res.status).toBe(400)
    expect(res.body.code).toBe('INVALID_PLACEMENT_ID')
    expect(store.findById).not.toHaveBeenCalled()
    expect(store.approve).not.toHaveBeenCalled()
  })
})

describe('POST approve', () => {
  it('approves for the signed-in admin and the version they saw', async () => {
    const { app, store, admin } = setup()
    const { cookie, id } = await admin()

    const res = await request(app)
      .post(`/api/admin/placements/${ID}/approve`)
      .set('Cookie', cookie)
      .send(approveBody)

    expect(res.status).toBe(200)
    expect(res.body.placement.status).toBe('ACTIVE')
    expect(store.approve).toHaveBeenCalledWith(ID, id, new Date(UPDATED_AT))
  })

  it.each([
    [{}, 'expectedUpdatedAt'],
    [{ expectedUpdatedAt: 'yesterday' }, 'expectedUpdatedAt'],
    [{ expectedUpdatedAt: '2026-10-12' }, 'expectedUpdatedAt'],
  ])('answers 400 INVALID_INPUT for %o', async (body, field) => {
    const { app, store, admin } = setup()
    const { cookie } = await admin()

    const res = await request(app)
      .post(`/api/admin/placements/${ID}/approve`)
      .set('Cookie', cookie)
      .send(body)

    expect(res.status).toBe(400)
    expect(res.body.code).toBe('INVALID_INPUT')
    expect(res.body.fieldErrors).toHaveProperty(field)
    expect(store.approve).not.toHaveBeenCalled()
  })

  it('ignores a status or adminId in the body', async () => {
    const { app, store, admin } = setup()
    const { cookie, id } = await admin()

    await request(app)
      .post(`/api/admin/placements/${ID}/approve`)
      .set('Cookie', cookie)
      .send({ ...approveBody, status: 'ARCHIVED', adminId: 'someone-else' })

    expect(store.approve).toHaveBeenCalledWith(ID, id, new Date(UPDATED_AT))
  })
})

describe('POST reject', () => {
  it('rejects with the trimmed reason', async () => {
    const { app, store, admin } = setup()
    const { cookie, id } = await admin()

    const res = await request(app)
      .post(`/api/admin/placements/${ID}/reject`)
      .set('Cookie', cookie)
      .send({ ...rejectBody, reason: '   The photo is blurry and unreadable   ' })

    expect(res.status).toBe(200)
    expect(res.body.placement.status).toBe('REJECTED')
    expect(store.reject).toHaveBeenCalledWith(
      ID,
      id,
      new Date(UPDATED_AT),
      'The photo is blurry and unreadable',
    )
  })

  it.each([
    ['is missing', undefined, 'validation.required'],
    ['is whitespace only', '          ', 'validation.reason.tooShort'],
    ['has 9 characters', 'x'.repeat(9), 'validation.reason.tooShort'],
    ['has 501 characters', 'x'.repeat(501), 'validation.reason.tooLong'],
  ])('answers 400 with a validation code when the reason %s', async (_name, reason, code) => {
    const { app, store, admin } = setup()
    const { cookie } = await admin()

    const res = await request(app)
      .post(`/api/admin/placements/${ID}/reject`)
      .set('Cookie', cookie)
      .send({ expectedUpdatedAt: UPDATED_AT, ...(reason === undefined ? {} : { reason }) })

    expect(res.status).toBe(400)
    expect(res.body.code).toBe('INVALID_INPUT')
    expect(res.body.fieldErrors.reason).toHaveLength(1)
    expect(res.body.fieldErrors.reason[0]).toMatch(/^validation\./)
    if (reason !== undefined) expect(res.body.fieldErrors.reason).toEqual([code])
    expect(store.reject).not.toHaveBeenCalled()
  })

  it.each([10, 500])('accepts a reason of exactly %i characters', async (length) => {
    const { app, store, admin } = setup()
    const { cookie } = await admin()

    const res = await request(app)
      .post(`/api/admin/placements/${ID}/reject`)
      .set('Cookie', cookie)
      .send({ expectedUpdatedAt: UPDATED_AT, reason: 'x'.repeat(length) })

    expect(res.status).toBe(200)
    expect(store.reject).toHaveBeenCalledTimes(1)
  })
})

describe('refusals', () => {
  const cases = [
    ['NOT_FOUND', 404, 'PLACEMENT_NOT_FOUND'],
    ['NOT_PENDING', 409, 'PLACEMENT_NOT_PENDING'],
    ['CHANGED', 409, 'PLACEMENT_CHANGED'],
    ['NO_PHOTOS', 409, 'PLACEMENT_NO_PHOTOS'],
  ] as const

  it.each(cases)('approve maps %s to %i %s', async (reason, status, code) => {
    const { app, store, admin } = setup()
    const { cookie } = await admin()
    store.approve.mockResolvedValueOnce({ ok: false, reason })

    const res = await request(app)
      .post(`/api/admin/placements/${ID}/approve`)
      .set('Cookie', cookie)
      .send(approveBody)

    expect(res.status).toBe(status)
    expect(res.body.code).toBe(code)
    expect(errorCodeSchema.safeParse(res.body.code).success).toBe(true)
    expect(typeof res.body.error).toBe('string')
  })

  it.each(cases.filter(([reason]) => reason !== 'NO_PHOTOS'))(
    'reject maps %s to %i %s',
    async (reason, status, code) => {
      const { app, store, admin } = setup()
      const { cookie } = await admin()
      store.reject.mockResolvedValueOnce({ ok: false, reason })

      const res = await request(app)
        .post(`/api/admin/placements/${ID}/reject`)
        .set('Cookie', cookie)
        .send(rejectBody)

      expect(res.status).toBe(status)
      expect(res.body.code).toBe(code)
    },
  )

  it('a stale updatedAt is a 409 that says nothing about who changed it', async () => {
    const { app, store, admin } = setup()
    const { cookie } = await admin()
    store.approve.mockResolvedValueOnce({ ok: false, reason: 'CHANGED' })

    const res = await request(app)
      .post(`/api/admin/placements/${ID}/approve`)
      .set('Cookie', cookie)
      .send({ expectedUpdatedAt: '2026-01-01T00:00:00.000Z' })

    expect(res.status).toBe(409)
    expect(Object.keys(res.body).sort()).toEqual(['code', 'error'])
  })
})

describe('rate limit', () => {
  it('limits approve and reject together and leaves reads alone', async () => {
    const { app, admin } = setup({ rateLimit: 2 })
    const { cookie } = await admin()

    const statuses: number[] = []
    for (const action of ['approve', 'reject', 'approve']) {
      const res = await request(app)
        .post(`/api/admin/placements/${ID}/${action}`)
        .set('Cookie', cookie)
        .send(rejectBody)
      statuses.push(res.status)
      if (res.status === 429) expect(res.body.code).toBe('RATE_LIMITED')
    }
    const read = await request(app).get('/api/admin/placements').set('Cookie', cookie)

    expect(statuses).toEqual([200, 200, 429])
    expect(read.status).toBe(200)
  })
})
