import { errorCodeSchema } from '@reclo/shared'
import type { Express } from 'express'
import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import { createApp } from './app'
import { generateSessionToken, hashSessionToken, SESSION_COOKIE } from './auth/session'
import type { AuthStore } from './auth/store'
import type { InquiryStore } from './inquiries/store'
import type { AdminPlacementStore } from './placements/admin-store'
import type { PhotoStorage } from './placements/photo-storage'
import type { VendorPlacementStore } from './placements/vendor-store'
import { createMemoryAuthStore } from './test-helpers'

/**
 * KAN-80: every state-changing route is hit with the same hostile inputs and must answer with a
 * 4xx in the standard `{ error, code, fieldErrors? }` shape, never a 5xx.
 *
 * The first test compares `WRITE_ROUTES` with the routes registered on the Express app, so a new
 * POST/PUT/PATCH/DELETE route fails this file until it is added to the table (and so audited).
 */

type Role = 'CLIENT' | 'VENDOR' | 'ADMIN'
type Method = 'post' | 'patch' | 'delete'

interface WriteRoute {
  method: Method
  /** As registered, e.g. `/api/vendor/placements/:id/archive`. */
  pattern: string
  /** `none`: the route reads no body. `json`: validated by a shared schema. `multipart`: photo. */
  body: 'none' | 'json' | 'multipart'
  /** Signed in as this role; `null` for the public routes. */
  role: Role | null
  /** A body that passes validation (json routes). */
  valid?: Record<string, unknown>
}

const ID = 'b1e0696a-54c3-4d40-84c4-f2a89326e680'
const PHOTO = '0b3f2f0a-7f0e-4a3c-9a43-0d6b1d1b8b11.jpg'
const SENTINEL = 'EVIL-SENTINEL'

const WRITE_ROUTES: WriteRoute[] = [
  {
    method: 'post',
    pattern: '/api/auth/register',
    body: 'json',
    role: null,
    valid: { email: 'new@example.com', password: 'correct-horse' },
  },
  {
    method: 'post',
    pattern: '/api/auth/login',
    body: 'json',
    role: null,
    valid: { email: 'user@example.com', password: 'correct-horse' },
  },
  { method: 'post', pattern: '/api/auth/logout', body: 'none', role: null },
  {
    method: 'post',
    pattern: '/api/inquiries',
    body: 'json',
    role: 'CLIENT',
    valid: {
      placementId: ID,
      message: 'I would like to rent this billboard.',
      contactName: 'Ann',
      contactPhone: '+998901234567',
      contactEmail: 'ann@example.com',
    },
  },
  {
    method: 'post',
    pattern: '/api/vendor/placements',
    body: 'json',
    role: 'VENDOR',
    valid: {
      title: 'Amir Temur Billboard',
      type: 'BILLBOARD',
      latitude: 41.311,
      longitude: 69.279,
      address: 'Amir Temur Ave 10',
      city: 'Tashkent',
      pricePerMonth: 5_000_000,
    },
  },
  {
    method: 'patch',
    pattern: '/api/vendor/placements/:id',
    body: 'json',
    role: 'VENDOR',
    valid: { title: 'A new title here' },
  },
  { method: 'post', pattern: '/api/vendor/placements/:id/archive', body: 'none', role: 'VENDOR' },
  { method: 'post', pattern: '/api/vendor/placements/:id/restore', body: 'none', role: 'VENDOR' },
  { method: 'post', pattern: '/api/vendor/placements/:id/pause', body: 'none', role: 'VENDOR' },
  { method: 'post', pattern: '/api/vendor/placements/:id/resume', body: 'none', role: 'VENDOR' },
  {
    method: 'post',
    pattern: '/api/vendor/placements/:id/photos',
    body: 'multipart',
    role: 'VENDOR',
  },
  {
    method: 'delete',
    pattern: '/api/vendor/placements/:id/photos/:file',
    body: 'none',
    role: 'VENDOR',
  },
  {
    method: 'post',
    pattern: '/api/admin/vendors',
    body: 'json',
    role: 'ADMIN',
    valid: {
      email: 'new-vendor@example.com',
      companyName: 'Silk Road Media',
      password: 'correct-horse-battery',
    },
  },
  {
    method: 'post',
    pattern: '/api/admin/placements/:id/approve',
    body: 'json',
    role: 'ADMIN',
    valid: { expectedUpdatedAt: '2026-10-12T15:00:00.000Z' },
  },
  {
    method: 'post',
    pattern: '/api/admin/placements/:id/reject',
    body: 'json',
    role: 'ADMIN',
    valid: { expectedUpdatedAt: '2026-10-12T15:00:00.000Z', reason: 'The photos are too dark.' },
  },
]

/** Where each router is mounted (app.ts). A router mounted anywhere else fails the audit test. */
const MOUNTS = [
  '/api/auth',
  '/api/placements',
  '/api/vendor/placements',
  '/api/admin/placements',
  '/api/admin/vendors',
  '/api/inquiries',
]

const concrete = (pattern: string) => pattern.replace(':id', ID).replace(':file', PHOTO)

// Only the parts of Express's internals this walk needs.
interface RouterLayer {
  name: string
  route?: { path: string; methods: Record<string, boolean> }
  matchers: Array<(path: string) => unknown>
  handle: { stack?: RouterLayer[] }
}

/** `METHOD pattern` for every non-GET route registered on the app. */
function registeredWriteRoutes(app: Express): string[] {
  const found: string[] = []
  const stack = (app as unknown as { router: { stack: RouterLayer[] } }).router.stack
  for (const layer of stack) {
    if (layer.route) {
      collect('', layer.route)
    } else if (layer.handle.stack) {
      const mount = MOUNTS.find((candidate) => layer.matchers.some((m) => m(`${candidate}/x`)))
      if (!mount) throw new Error('A router is mounted at a path missing from MOUNTS')
      for (const inner of layer.handle.stack) {
        if (inner.route) collect(mount, inner.route)
        else if (inner.handle.stack) throw new Error('Nested routers are not walked; extend this')
      }
    }
  }
  function collect(prefix: string, route: NonNullable<RouterLayer['route']>) {
    for (const method of Object.keys(route.methods)) {
      if (method !== 'get' && method !== 'head') {
        found.push(`${method.toUpperCase()} ${prefix}${route.path}`.replace(/\/$/, ''))
      }
    }
  }
  return found
}

function setup(limit = 1000) {
  const memory = createMemoryAuthStore()
  const recorded: unknown[][] = []
  const spy = <T extends (...args: never[]) => unknown>(fn: T): T =>
    vi.fn((...args: Parameters<T>) => {
      recorded.push(args)
      return fn(...args)
    }) as unknown as T

  const authStore: AuthStore = {
    findUserByEmail: spy(memory.store.findUserByEmail),
    createClient: spy(memory.store.createClient),
    createSession: spy(memory.store.createSession),
    findSessionByTokenHash: memory.store.findSessionByTokenHash,
    deleteSessionByTokenHash: spy(memory.store.deleteSessionByTokenHash),
    createVendor: spy(memory.store.createVendor),
    listVendors: memory.store.listVendors,
  }
  const notFound = async () => ({ kind: 'not_found' as const })
  const vendorStore: VendorPlacementStore = {
    create: spy(async () => ({ id: ID }) as never),
    list: async () => ({ placements: [], total: 0 }),
    find: async () => ({ status: 'ACTIVE', photos: [] }) as never,
    update: spy(notFound),
    archive: spy(notFound),
    restore: spy(notFound),
    pause: spy(notFound),
    resume: spy(notFound),
    addPhoto: spy(notFound),
    removePhoto: spy(notFound),
  }
  const adminStore: AdminPlacementStore = {
    list: async () => ({ placements: [], total: 0 }),
    findById: async () => null,
    approve: spy(async () => ({ ok: false as const, reason: 'NOT_FOUND' as const })),
    reject: spy(async () => ({ ok: false as const, reason: 'NOT_FOUND' as const })),
  }
  const inquiryStore: InquiryStore = {
    findActivePlacement: spy(async () => null),
    findOpenInquiry: spy(async () => null),
    closeStaleInquiry: spy(async () => false),
    createInquiry: spy(async () => ({}) as never),
    listClientInquiries: async () => [],
  }
  const photoStorage: PhotoStorage = { save: spy(async () => '/x'), remove: spy(async () => {}) }

  const app = createApp({
    checkDatabase: async () => {},
    authStore,
    placementStore: { findMarkers: async () => ({ markers: [], total: 0 }) } as never,
    vendorPlacementStore: vendorStore,
    adminPlacementStore: adminStore,
    inquiryStore,
    photoStorage,
    authRateLimitMax: limit,
    inquiryRateLimitMax: limit,
    vendorRateLimitMax: limit,
    adminRateLimitMax: limit,
  })

  /** A session cookie for a fresh user of this role, made without the slow password hash. */
  const cookies = new Map<Role, string>()
  async function cookieFor(role: Role): Promise<string> {
    const existing = cookies.get(role)
    if (existing) return existing
    const email = `${role.toLowerCase()}@example.com`
    const user = await memory.store.createClient({ email, passwordHash: 'x' })
    memory.setRole(email, role)
    const token = generateSessionToken()
    await memory.store.createSession({
      userId: user.id,
      tokenHash: hashSessionToken(token),
      expiresAt: new Date(Date.now() + 60_000),
    })
    const cookie = `${SESSION_COOKIE}=${token}`
    cookies.set(role, cookie)
    return cookie
  }

  return { app, recorded, cookieFor }
}

/** The standard error body: a known `code`, a string `error`, and codes (not sentences) per field. */
function expectStandardError(res: request.Response, status: number, code?: string): void {
  expect(res.status).toBe(status)
  expect(res.headers['content-type']).toMatch(/application\/json/)
  expect(typeof res.body.error).toBe('string')
  expect(errorCodeSchema.safeParse(res.body.code).success).toBe(true)
  if (code) expect(res.body.code).toBe(code)
  expect(JSON.stringify(res.body)).not.toMatch(/\bat .*\.(ts|js):\d+|node_modules|Error:/)
  if (res.body.fieldErrors !== undefined) {
    for (const messages of Object.values<string[]>(res.body.fieldErrors)) {
      for (const message of messages) expect(message).toMatch(/^validation\./)
    }
  }
}

async function send(
  ctx: ReturnType<typeof setup>,
  route: WriteRoute,
  options: { raw?: string; type?: string; role?: Role | null; omitBody?: boolean } = {},
): Promise<request.Response> {
  const req = request(ctx.app)[route.method](concrete(route.pattern))
  const role = options.role === undefined ? route.role : options.role
  if (role) req.set('Cookie', await ctx.cookieFor(role))
  if (options.type) req.set('Content-Type', options.type)
  if (options.raw !== undefined) req.send(options.raw)
  return req
}

const jsonRoutes = WRITE_ROUTES.filter((route) => route.body === 'json')

describe('write route audit', () => {
  it('lists every write route registered on the app, and nothing else', () => {
    const registered = registeredWriteRoutes(setup().app).sort()
    const listed = WRITE_ROUTES.map((r) => `${r.method.toUpperCase()} ${r.pattern}`).sort()
    expect(registered).toEqual(listed)
  })
})

describe.each(WRITE_ROUTES)('$method $pattern', (route) => {
  it('answers malformed JSON with 400 MALFORMED_JSON', async () => {
    const res = await send(setup(), route, { raw: '{"a":', type: 'application/json' })
    expectStandardError(res, 400, 'MALFORMED_JSON')
  })

  it('answers a body that is not JSON with 415', async () => {
    const res = await send(setup(), route, { raw: 'hello', type: 'text/plain' })
    expectStandardError(res, 415, 'UNSUPPORTED_MEDIA_TYPE')
  })

  it('answers an oversized body with 413 PAYLOAD_TOO_LARGE', async () => {
    const raw = JSON.stringify({ filler: 'x'.repeat(20_000) })
    const res = await send(setup(), route, { raw, type: 'application/json' })
    expectStandardError(res, 413, 'PAYLOAD_TOO_LARGE')
  })

  it('never fails with a 5xx on JSON it did not expect, and strips unknown keys', async () => {
    const ctx = setup()
    const extras = {
      role: SENTINEL,
      status: SENTINEL,
      vendorId: SENTINEL,
      clientId: SENTINEL,
      userId: SENTINEL,
      id: SENTINEL,
      isAdmin: SENTINEL,
    }
    const raw = JSON.stringify({ ...route.valid, ...extras })
    const res = await send(ctx, route, { raw, type: 'application/json' })
    expect(res.status).toBeLessThan(500)
    if (res.status >= 400) expectStandardError(res, res.status)
    // Whatever reached a store must not carry anything the client was not allowed to set.
    expect(JSON.stringify(ctx.recorded)).not.toContain(SENTINEL)
  })

  if (route.role) {
    it('answers 401 without a session', async () => {
      const raw = JSON.stringify(route.valid ?? {})
      const res = await send(setup(), route, { raw, type: 'application/json', role: null })
      expectStandardError(res, 401, 'NOT_AUTHENTICATED')
    })
  }

  if (route.pattern.includes(':id')) {
    it('answers a non-UUID id with 400 INVALID_PLACEMENT_ID', async () => {
      const ctx = setup()
      const path = concrete(route.pattern).replace(ID, 'not-a-uuid')
      const req = request(ctx.app)[route.method](path)
      req.set('Cookie', await ctx.cookieFor(route.role!))
      expectStandardError(await req, 400, 'INVALID_PLACEMENT_ID')
    })
  }

  it('is rate limited', async () => {
    const ctx = setup(1)
    const raw = JSON.stringify(route.valid ?? {})
    const first = await send(ctx, route, { raw, type: 'application/json' })
    expect(first.status).not.toBe(429)
    const second = await send(ctx, route, { raw, type: 'application/json' })
    expectStandardError(second, 429, 'RATE_LIMITED')
  })
})

describe.each(jsonRoutes)('$method $pattern validation', (route) => {
  it.each([
    ['an empty object', '{}'],
    ['an array', '[]'],
    ['a string', '"text"'],
    ['null', 'null'],
    ['a number', '42'],
  ])('rejects %s with a 400', async (_name, raw) => {
    const res = await send(setup(), route, { raw, type: 'application/json' })
    expect(res.status).toBe(400)
    expectStandardError(res, 400)
  })

  it('rejects a request with no body at all with INVALID_INPUT', async () => {
    const res = await send(setup(), route)
    expectStandardError(res, 400, 'INVALID_INPUT')
    expect(res.body.fieldErrors).toBeDefined()
  })

  it('rejects wrong types on every field, with a code per field', async () => {
    const wrong = Object.fromEntries(Object.keys(route.valid!).map((key) => [key, { nested: 1 }]))
    const res = await send(setup(), route, {
      raw: JSON.stringify(wrong),
      type: 'application/json',
    })
    expectStandardError(res, 400, 'INVALID_INPUT')
    expect(Object.keys(res.body.fieldErrors).sort()).toEqual(Object.keys(route.valid!).sort())
  })

  it('rejects a NUL character in a string, which Postgres cannot store', async () => {
    const key = Object.keys(route.valid!)[0]!
    const raw = JSON.stringify({ ...route.valid, [key]: 'a\u0000b' })
    const res = await send(setup(), route, { raw, type: 'application/json' })
    expectStandardError(res, 400, 'INVALID_INPUT')
  })

  it('accepts its valid body without a 4xx from validation', async () => {
    const res = await send(setup(), route, {
      raw: JSON.stringify(route.valid),
      type: 'application/json',
    })
    // The stores are stubs, so a 404/409/401 is fine; a 400 would mean the table is wrong.
    expect(res.status).not.toBe(400)
    expect(res.status).toBeLessThan(500)
  })
})

describe('POST /api/admin/vendors mass assignment', () => {
  const body = {
    email: 'mass@example.com',
    companyName: 'Mass Media',
    password: 'correct-horse-battery',
  }

  it.each(['ADMIN', 'CLIENT', 'VENDOR'])('ignores a role of %s in the body', async (role) => {
    const ctx = setup()
    const res = await request(ctx.app)
      .post('/api/admin/vendors')
      .set('Cookie', await ctx.cookieFor('ADMIN'))
      .send({ ...body, role, createdById: 'someone-else' })

    expect(res.status).toBe(201)
    expect(JSON.stringify(res.body)).not.toMatch(/passw|hash/i)
    // The creator is the signed-in admin, whatever the body claims.
    expect(JSON.stringify(ctx.recorded)).not.toContain('someone-else')
    const stored = await request(ctx.app)
      .get('/api/admin/vendors')
      .set('Cookie', await ctx.cookieFor('ADMIN'))
    expect(stored.body.vendors).toHaveLength(1)
    const login = await request(ctx.app)
      .post('/api/auth/login')
      .send({ email: body.email, password: body.password })
    expect(login.body.user.role).toBe('VENDOR')
  })

  it.each(['CLIENT', 'VENDOR'] as const)('answers a %s with 403 FORBIDDEN', async (role) => {
    const ctx = setup()
    const res = await request(ctx.app)
      .post('/api/admin/vendors')
      .set('Cookie', await ctx.cookieFor(role))
      .send(body)
    expectStandardError(res, 403, 'FORBIDDEN')
  })
})

describe('unknown routes', () => {
  it('answer in the standard shape rather than an HTML page', async () => {
    const res = await request(setup().app).post('/api/nope').send({})
    expectStandardError(res, 404, 'NOT_FOUND')
  })
})
