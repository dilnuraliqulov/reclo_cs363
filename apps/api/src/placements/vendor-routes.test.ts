import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { errorCodeSchema, type PlacementStatus, type VendorPlacement } from '@reclo/shared'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../app'
import { SESSION_COOKIE } from '../auth/session'
import { createMemoryAuthStore } from '../test-helpers'
import type { PhotoStorage } from './photo-storage'
import type { VendorPlacementStore } from './vendor-store'

const ID = 'b1e0696a-54c3-4d40-84c4-f2a89326e680'
const FILE = '0b3f2f0a-7f0e-4a3c-9a43-0d6b1d1b8b11.jpg'
const PASSWORD = 'correct-horse'

const listing: VendorPlacement = {
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
  photos: [],
  vendorId: 'ignored',
  createdAt: '2026-10-10T10:00:00.000Z',
  updatedAt: '2026-10-12T15:00:00.000Z',
  archivedAt: null,
}

const validBody = {
  title: 'Amir Temur Billboard',
  type: 'BILLBOARD',
  latitude: 41.311,
  longitude: 69.279,
  address: 'Amir Temur Ave 10',
  city: 'Tashkent',
  pricePerMonth: 5_000_000,
}

// Magic bytes only: the route must never need a decodable image.
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46])
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 ')])

let tempDirs: string[] = []
afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })))
  tempDirs = []
})

function setup(options: { withPhotos?: boolean; rateLimit?: number; uploadsDir?: string } = {}) {
  const { withPhotos = true } = options
  const memory = createMemoryAuthStore()

  // Ownership lives in the stub the way it lives in the real store: one vendor owns ID.
  let ownerId = ''
  const owned = (vendorId: string, id: string) => vendorId === ownerId && id === ID
  const ok = (status: PlacementStatus = 'PENDING_REVIEW') => ({
    kind: 'ok' as const,
    placement: { ...listing, status },
  })
  const mutation = (status: PlacementStatus) =>
    vi.fn(async (vendorId: string, id: string) =>
      owned(vendorId, id) ? ok(status) : { kind: 'not_found' as const },
    )

  const store = {
    create: vi.fn<VendorPlacementStore['create']>(async (vendorId) => ({ ...listing, vendorId })),
    list: vi.fn(async () => ({ placements: [listing], total: 1 })),
    find: vi.fn(async (vendorId: string, id: string) => (owned(vendorId, id) ? listing : null)),
    update: mutation('PENDING_REVIEW'),
    archive: mutation('ARCHIVED'),
    restore: mutation('PENDING_REVIEW'),
    pause: mutation('INACTIVE'),
    resume: mutation('ACTIVE'),
    addPhoto: vi.fn(async (vendorId: string, id: string, photoPath: string) =>
      owned(vendorId, id)
        ? { kind: 'ok' as const, placement: { ...listing, photos: [photoPath] } }
        : { kind: 'not_found' as const },
    ),
    removePhoto: mutation('PENDING_REVIEW'),
  } satisfies VendorPlacementStore & Record<string, unknown>

  const photos: PhotoStorage = {
    save: vi.fn(async (placementId, _bytes, extension) => {
      return `/uploads/placements/${placementId}/${FILE.replace('jpg', extension)}`
    }),
    remove: vi.fn(async () => {}),
  }

  const app = createApp({
    checkDatabase: async () => {},
    authStore: memory.store,
    vendorPlacementStore: store as VendorPlacementStore,
    ...(withPhotos ? { photoStorage: photos } : {}),
    ...(options.uploadsDir ? { uploadsDir: options.uploadsDir } : {}),
    ...(options.rateLimit ? { vendorRateLimitMax: options.rateLimit } : {}),
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
    photos,
    signIn,
    /** A vendor who owns ID. */
    async owner() {
      const cookie = await signIn('owner@example.com', 'VENDOR')
      ownerId = memory.users.find((u) => u.email === 'owner@example.com')?.id ?? ''
      return { cookie, id: ownerId }
    },
  }
}

type Verb = 'get' | 'post' | 'patch' | 'delete'
const routes: [string, Verb, string][] = [
  ['create', 'post', '/api/vendor/placements'],
  ['list', 'get', '/api/vendor/placements'],
  ['get', 'get', `/api/vendor/placements/${ID}`],
  ['patch', 'patch', `/api/vendor/placements/${ID}`],
  ['archive', 'post', `/api/vendor/placements/${ID}/archive`],
  ['restore', 'post', `/api/vendor/placements/${ID}/restore`],
  ['pause', 'post', `/api/vendor/placements/${ID}/pause`],
  ['resume', 'post', `/api/vendor/placements/${ID}/resume`],
  ['upload photo', 'post', `/api/vendor/placements/${ID}/photos`],
  ['delete photo', 'delete', `/api/vendor/placements/${ID}/photos/${FILE}`],
]
// Routes that work on an existing listing and so can answer 404 for someone else's.
const idRoutes = routes.filter(([, , url]) => url.includes(ID))

describe('access', () => {
  it.each(routes)('%s answers 401 with a code and no session', async (_name, verb, url) => {
    const { app, store } = setup()

    const res = await request(app)[verb](url).send({})

    expect(res.status).toBe(401)
    expect(res.body).toEqual({ error: 'Not authenticated', code: 'NOT_AUTHENTICATED' })
    for (const fn of Object.values(store)) expect(fn).not.toHaveBeenCalled()
  })

  it.each(['CLIENT', 'ADMIN'] as const)('%s gets 403 on every route', async (role) => {
    const { app, store, signIn } = setup()
    const cookie = await signIn(`${role.toLowerCase()}@example.com`, role)

    for (const [name, verb, url] of routes) {
      const res = await request(app)[verb](url).set('Cookie', cookie).send({})
      expect(res.status, name).toBe(403)
      expect(res.body, name).toEqual({ error: 'Forbidden', code: 'FORBIDDEN' })
    }
    for (const fn of Object.values(store)) expect(fn).not.toHaveBeenCalled()
  })

  it.each(idRoutes)(
    '%s answers 404 (never 403) for a listing another vendor owns',
    async (_name, verb, url) => {
      const { app, owner, signIn } = setup()
      await owner()
      const stranger = await signIn('stranger@example.com', 'VENDOR')

      const req = request(app)[verb](url).set('Cookie', stranger)
      const res = url.endsWith('/photos')
        ? await req.attach('photo', JPEG, 'a.jpg')
        : await req.send(verb === 'patch' ? { title: 'Stolen title' } : {})

      expect(res.status).toBe(404)
      expect(res.body.code).toBe('PLACEMENT_NOT_FOUND')
    },
  )

  it('answers 404 for an id that does not exist at all, with the same body', async () => {
    const { app, owner } = setup()
    const { cookie } = await owner()

    const res = await request(app)
      .get('/api/vendor/placements/00000000-0000-4000-8000-000000000000')
      .set('Cookie', cookie)

    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'Placement not found', code: 'PLACEMENT_NOT_FOUND' })
  })

  it('answers 400 INVALID_PLACEMENT_ID for a malformed id, on every id route', async () => {
    const { app, owner } = setup()
    const { cookie } = await owner()

    for (const [name, verb, url] of idRoutes) {
      const res = await request(app)
        [verb](url.replace(ID, 'not-a-uuid'))
        .set('Cookie', cookie)
        .send({})
      expect(res.status, name).toBe(400)
      expect(res.body.code, name).toBe('INVALID_PLACEMENT_ID')
    }
  })

  it('rate limits mutating requests but not reads', async () => {
    const { app, owner } = setup({ rateLimit: 2 })
    const { cookie } = await owner()

    for (let i = 0; i < 3; i++) {
      await request(app).get('/api/vendor/placements').set('Cookie', cookie)
    }
    const statuses: number[] = []
    for (let i = 0; i < 3; i++) {
      const res = await request(app)
        .post(`/api/vendor/placements/${ID}/pause`)
        .set('Cookie', cookie)
      statuses.push(res.status)
      if (res.status === 429) expect(res.body.code).toBe('RATE_LIMITED')
    }

    expect(statuses).toEqual([200, 200, 429])
  })
})

describe('create', () => {
  it('creates for the signed-in vendor and returns 201', async () => {
    const { app, store, owner } = setup()
    const { cookie, id } = await owner()

    const res = await request(app)
      .post('/api/vendor/placements')
      .set('Cookie', cookie)
      .send(validBody)

    expect(res.status).toBe(201)
    expect(res.body.placement.vendorId).toBe(id)
    expect(store.create).toHaveBeenCalledWith(
      id,
      expect.objectContaining({ title: validBody.title }),
    )
  })

  it('ignores vendorId, status, archivedAt, photos and tier in the body', async () => {
    const { app, store, owner } = setup()
    const { cookie, id } = await owner()

    await request(app)
      .post('/api/vendor/placements')
      .set('Cookie', cookie)
      .send({
        ...validBody,
        vendorId: 'someone-else',
        status: 'ACTIVE',
        archivedAt: '2026-01-01T00:00:00.000Z',
        photos: ['https://evil.example/x.jpg'],
        tier: 'GOLD',
      })

    const [vendorId, data] = store.create.mock.calls[0] ?? []
    expect(vendorId).toBe(id)
    expect(Object.keys(data ?? {}).sort()).toEqual(
      [
        'address',
        'city',
        'latitude',
        'lighting',
        'longitude',
        'pricePerMonth',
        'title',
        'type',
      ].sort(),
    )
  })

  it('answers 400 with INVALID_INPUT and validation codes per field', async () => {
    const { app, store, owner } = setup()
    const { cookie } = await owner()

    const res = await request(app)
      .post('/api/vendor/placements')
      .set('Cookie', cookie)
      .send({ ...validBody, title: 'abc', pricePerMonth: 10, latitude: 69.2, longitude: 41.3 })

    expect(res.status).toBe(400)
    expect(res.body).toMatchObject({ error: 'Invalid input', code: 'INVALID_INPUT' })
    expect(res.body.fieldErrors).toEqual({
      title: ['validation.title.length'],
      pricePerMonth: ['validation.price.range'],
      latitude: ['validation.latitude.range'],
      longitude: ['validation.longitude.range'],
    })
    expect(store.create).not.toHaveBeenCalled()
  })

  it('reports every missing required field', async () => {
    const { app, owner } = setup()
    const { cookie } = await owner()

    const res = await request(app).post('/api/vendor/placements').set('Cookie', cookie).send({})

    expect(Object.keys(res.body.fieldErrors).sort()).toEqual(
      ['address', 'city', 'latitude', 'longitude', 'pricePerMonth', 'title', 'type'].sort(),
    )
    for (const messages of Object.values<string[]>(res.body.fieldErrors)) {
      expect(messages).toEqual(['validation.required'])
    }
  })

  it('answers 400 MALFORMED_JSON for a broken body', async () => {
    const { app, owner } = setup()
    const { cookie } = await owner()

    const res = await request(app)
      .post('/api/vendor/placements')
      .set('Cookie', cookie)
      .set('Content-Type', 'application/json')
      .send('{"title":')

    expect(res.status).toBe(400)
    expect(res.body.code).toBe('MALFORMED_JSON')
  })
})

describe('list and get', () => {
  it('passes the parsed query to the store for this vendor', async () => {
    const { app, store, owner } = setup()
    const { cookie, id } = await owner()

    const res = await request(app)
      .get('/api/vendor/placements?status=ARCHIVED&page=2&pageSize=5')
      .set('Cookie', cookie)

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ placements: [listing], total: 1 })
    expect(store.list).toHaveBeenCalledWith(id, { status: 'ARCHIVED', page: 2, pageSize: 5 })
  })

  it('defaults to page 1 of 20 with no status filter', async () => {
    const { app, store, owner } = setup()
    const { cookie, id } = await owner()

    await request(app).get('/api/vendor/placements').set('Cookie', cookie)

    expect(store.list).toHaveBeenCalledWith(id, { page: 1, pageSize: 20 })
  })

  it('answers 400 with INVALID_INPUT for a bad query', async () => {
    const { app, owner } = setup()
    const { cookie } = await owner()

    const res = await request(app)
      .get('/api/vendor/placements?status=DELETED&pageSize=500')
      .set('Cookie', cookie)

    expect(res.status).toBe(400)
    expect(res.body.code).toBe('INVALID_INPUT')
    expect(Object.keys(res.body.fieldErrors).sort()).toEqual(['pageSize', 'status'])
  })

  it('returns the owner their listing', async () => {
    const { app, owner } = setup()
    const { cookie } = await owner()

    const res = await request(app).get(`/api/vendor/placements/${ID}`).set('Cookie', cookie)

    expect(res.status).toBe(200)
    expect(res.body.placement.id).toBe(ID)
  })
})

describe('patch', () => {
  it('returns the listing with the status the store moved it to', async () => {
    const { app, store, owner } = setup()
    const { cookie, id } = await owner()

    const res = await request(app)
      .patch(`/api/vendor/placements/${ID}`)
      .set('Cookie', cookie)
      .send({ title: 'A better title', status: 'ACTIVE', vendorId: 'x' })

    expect(res.status).toBe(200)
    expect(res.body.placement.status).toBe('PENDING_REVIEW')
    expect(store.update).toHaveBeenCalledWith(id, ID, { title: 'A better title' })
  })

  it('answers 409 LISTING_STATE_INVALID for an archived listing', async () => {
    const { app, store, owner } = setup()
    const { cookie } = await owner()
    store.update.mockResolvedValueOnce({ kind: 'conflict', status: 'ARCHIVED' } as never)

    const res = await request(app)
      .patch(`/api/vendor/placements/${ID}`)
      .set('Cookie', cookie)
      .send({ title: 'A better title' })

    expect(res.status).toBe(409)
    expect(res.body.code).toBe('LISTING_STATE_INVALID')
    expect(res.body.error).toMatch(/archived/i)
  })

  it.each([
    ['an empty body', {}],
    ['only fields the server owns', { status: 'ACTIVE', vendorId: 'x' }],
  ])('answers 400 for %s, under _form', async (_label, body) => {
    const { app, store, owner } = setup()
    const { cookie } = await owner()

    const res = await request(app)
      .patch(`/api/vendor/placements/${ID}`)
      .set('Cookie', cookie)
      .send(body)

    expect(res.status).toBe(400)
    expect(res.body.code).toBe('INVALID_INPUT')
    expect(res.body.fieldErrors).toEqual({ _form: ['validation.update.empty'] })
    expect(store.update).not.toHaveBeenCalled()
  })

  it('validates the fields it is given and rejects null', async () => {
    const { app, owner } = setup()
    const { cookie } = await owner()

    const res = await request(app)
      .patch(`/api/vendor/placements/${ID}`)
      .set('Cookie', cookie)
      .send({ pricePerMonth: 5, description: null })

    expect(res.status).toBe(400)
    expect(res.body.fieldErrors.pricePerMonth).toEqual(['validation.price.range'])
    expect(res.body.fieldErrors).toHaveProperty('description')
  })
})

describe('archive, restore, pause, resume', () => {
  const actions = [
    ['archive', 'ARCHIVED'],
    ['restore', 'PENDING_REVIEW'],
    ['pause', 'INACTIVE'],
    ['resume', 'ACTIVE'],
  ] as const

  it.each(actions)('%s answers 200 with the new status', async (action, status) => {
    const { app, owner } = setup()
    const { cookie } = await owner()

    const res = await request(app)
      .post(`/api/vendor/placements/${ID}/${action}`)
      .set('Cookie', cookie)

    expect(res.status).toBe(200)
    expect(res.body.placement.status).toBe(status)
  })

  it.each(actions)(
    '%s answers 409 naming the current status when the state is wrong',
    async (action) => {
      const { app, store, owner } = setup()
      const { cookie } = await owner()
      store[action].mockResolvedValueOnce({ kind: 'conflict', status: 'ACTIVE' } as never)

      const res = await request(app)
        .post(`/api/vendor/placements/${ID}/${action}`)
        .set('Cookie', cookie)

      expect(res.status).toBe(409)
      expect(res.body.code).toBe('LISTING_STATE_INVALID')
      expect(typeof res.body.error).toBe('string')
    },
  )

  it('names the status in the English message', async () => {
    const { app, store, owner } = setup()
    const { cookie } = await owner()
    store.restore.mockResolvedValueOnce({ kind: 'conflict', status: 'ACTIVE' } as never)

    const res = await request(app)
      .post(`/api/vendor/placements/${ID}/restore`)
      .set('Cookie', cookie)

    expect(res.body.error).toBe('Only an archived listing can be restored (it is ACTIVE)')
  })
})

describe('photo upload', () => {
  const url = `/api/vendor/placements/${ID}/photos`

  it.each([
    ['jpg', JPEG],
    ['png', PNG],
    ['webp', WEBP],
  ] as const)('accepts a %s and stores it under a server-made name', async (extension, bytes) => {
    const { app, store, photos, owner } = setup()
    const { cookie, id } = await owner()

    const res = await request(app)
      .post(url)
      .set('Cookie', cookie)
      .attach('photo', bytes, 'whatever.bin')

    expect(res.status).toBe(201)
    expect(photos.save).toHaveBeenCalledWith(ID, expect.any(Buffer), extension)
    const stored = vi.mocked(photos.save).mock.results[0]
    expect(await stored?.value).toMatch(new RegExp(`^/uploads/placements/${ID}/.+\\.${extension}$`))
    expect(store.addPhoto).toHaveBeenCalledWith(id, ID, expect.stringContaining('/uploads/'))
  })

  it('decides the type from the bytes, not the client Content-Type or file name', async () => {
    const { app, photos, owner } = setup()
    const { cookie } = await owner()

    const res = await request(app)
      .post(url)
      .set('Cookie', cookie)
      .attach('photo', PNG, { filename: 'looks-like.jpg', contentType: 'image/jpeg' })

    expect(res.status).toBe(201)
    expect(photos.save).toHaveBeenCalledWith(ID, expect.any(Buffer), 'png')
  })

  it.each([
    ['text called .jpg', Buffer.from('<script>alert(1)</script>'), 'a.jpg', 'image/jpeg'],
    ['an empty file', Buffer.alloc(0), 'a.jpg', 'image/jpeg'],
    ['a GIF', Buffer.from('GIF89a......'), 'a.gif', 'image/gif'],
    [
      'RIFF that is not WEBP',
      Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVEfmt ')]),
      'a.webp',
      'image/webp',
    ],
  ])('answers 415 PHOTO_TYPE_INVALID for %s', async (_label, bytes, filename, contentType) => {
    const { app, store, photos, owner } = setup()
    const { cookie } = await owner()

    const res = await request(app)
      .post(url)
      .set('Cookie', cookie)
      .attach('photo', bytes, { filename, contentType })

    expect(res.status).toBe(415)
    expect(res.body.code).toBe('PHOTO_TYPE_INVALID')
    expect(photos.save).not.toHaveBeenCalled()
    expect(store.addPhoto).not.toHaveBeenCalled()
  })

  it('answers 413 PHOTO_TOO_LARGE above 5 MB and stores nothing', async () => {
    const { app, photos, owner } = setup()
    const { cookie } = await owner()
    const big = Buffer.concat([JPEG, Buffer.alloc(5 * 1024 * 1024)])

    const res = await request(app).post(url).set('Cookie', cookie).attach('photo', big, 'big.jpg')

    expect(res.status).toBe(413)
    expect(res.body.code).toBe('PHOTO_TOO_LARGE')
    expect(photos.save).not.toHaveBeenCalled()
  })

  it('accepts a file of exactly 5 MB', async () => {
    const { app, owner } = setup()
    const { cookie } = await owner()
    const exact = Buffer.concat([JPEG, Buffer.alloc(5 * 1024 * 1024 - JPEG.length)])

    const res = await request(app)
      .post(url)
      .set('Cookie', cookie)
      .attach('photo', exact, 'exact.jpg')

    expect(res.status).toBe(201)
  })

  it.each([
    ['no multipart body', (req: request.Test) => req.send({})],
    ['the wrong field name', (req: request.Test) => req.attach('file', JPEG, 'a.jpg')],
    ['a field but no file', (req: request.Test) => req.field('photo', 'text')],
  ])('answers 400 PHOTO_REQUIRED for %s', async (_label, build) => {
    const { app, owner } = setup()
    const { cookie } = await owner()

    const res = await build(request(app).post(url).set('Cookie', cookie))

    expect(res.status).toBe(400)
    expect(res.body.code).toBe('PHOTO_REQUIRED')
  })

  it('answers 409 PHOTO_LIMIT when the listing already has 8 photos, before reading the body', async () => {
    const { app, store, photos, owner } = setup()
    const { cookie } = await owner()
    store.find.mockResolvedValueOnce({
      ...listing,
      photos: Array.from({ length: 8 }, (_, i) => `https://api/p${i}.jpg`),
    })

    const res = await request(app).post(url).set('Cookie', cookie).attach('photo', JPEG, 'a.jpg')

    expect(res.status).toBe(409)
    expect(res.body.code).toBe('PHOTO_LIMIT')
    expect(photos.save).not.toHaveBeenCalled()
  })

  it('answers 409 LISTING_STATE_INVALID for an archived listing', async () => {
    const { app, store, photos, owner } = setup()
    const { cookie } = await owner()
    store.find.mockResolvedValueOnce({ ...listing, status: 'ARCHIVED' })

    const res = await request(app).post(url).set('Cookie', cookie).attach('photo', JPEG, 'a.jpg')

    expect(res.status).toBe(409)
    expect(res.body.code).toBe('LISTING_STATE_INVALID')
    expect(photos.save).not.toHaveBeenCalled()
  })

  it('deletes the saved file when it lost the race for the last slot', async () => {
    const { app, store, photos, owner } = setup()
    const { cookie } = await owner()
    store.addPhoto.mockResolvedValueOnce({ kind: 'photo_limit' } as never)

    const res = await request(app).post(url).set('Cookie', cookie).attach('photo', JPEG, 'a.jpg')

    expect(res.status).toBe(409)
    expect(res.body.code).toBe('PHOTO_LIMIT')
    expect(photos.remove).toHaveBeenCalledTimes(1)
  })

  it('deletes the saved file when the listing was archived in between', async () => {
    const { app, store, photos, owner } = setup()
    const { cookie } = await owner()
    store.addPhoto.mockResolvedValueOnce({ kind: 'conflict', status: 'ARCHIVED' } as never)

    const res = await request(app).post(url).set('Cookie', cookie).attach('photo', JPEG, 'a.jpg')

    expect(res.status).toBe(409)
    expect(res.body.code).toBe('LISTING_STATE_INVALID')
    expect(photos.remove).toHaveBeenCalledTimes(1)
  })

  it('does not mount the photo routes without a PhotoStorage', async () => {
    const { app, owner } = setup({ withPhotos: false })
    const { cookie } = await owner()

    const res = await request(app).post(url).set('Cookie', cookie).attach('photo', JPEG, 'a.jpg')

    expect(res.status).toBe(404)
  })
})

describe('photo delete', () => {
  const url = `/api/vendor/placements/${ID}/photos/${FILE}`

  it('drops the photo from the listing and deletes the file', async () => {
    const { app, store, photos, owner } = setup()
    const { cookie, id } = await owner()

    const res = await request(app).delete(url).set('Cookie', cookie)

    expect(res.status).toBe(200)
    expect(store.removePhoto).toHaveBeenCalledWith(id, ID, `/uploads/placements/${ID}/${FILE}`)
    expect(photos.remove).toHaveBeenCalledWith(`/uploads/placements/${ID}/${FILE}`)
  })

  it('still succeeds when the file cannot be deleted', async () => {
    const { app, photos, owner } = setup()
    const { cookie } = await owner()
    vi.mocked(photos.remove).mockRejectedValueOnce(new Error('EPERM'))
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await request(app).delete(url).set('Cookie', cookie)

    expect(res.status).toBe(200)
    expect(logged).toHaveBeenCalled()
    logged.mockRestore()
  })

  it('answers 404 PHOTO_NOT_FOUND for a photo the listing does not have, and keeps any file', async () => {
    const { app, store, photos, owner } = setup()
    const { cookie } = await owner()
    store.removePhoto.mockResolvedValueOnce({ kind: 'photo_missing' } as never)

    const res = await request(app).delete(url).set('Cookie', cookie)

    expect(res.status).toBe(404)
    expect(res.body.code).toBe('PHOTO_NOT_FOUND')
    expect(photos.remove).not.toHaveBeenCalled()
  })

  it.each(['..%2F..%2Fsecret.jpg', 'cover.jpg', `${FILE}.exe`])(
    'answers 404 for the file name %s without asking the store',
    async (file) => {
      const { app, store, photos, owner } = setup()
      const { cookie } = await owner()

      const res = await request(app)
        .delete(`/api/vendor/placements/${ID}/photos/${file}`)
        .set('Cookie', cookie)

      expect(res.status).toBe(404)
      expect(res.body.code).toBe('PHOTO_NOT_FOUND')
      expect(store.removePhoto).not.toHaveBeenCalled()
      expect(photos.remove).not.toHaveBeenCalled()
    },
  )

  it('answers 409 for an archived listing and keeps the file', async () => {
    const { app, store, photos, owner } = setup()
    const { cookie } = await owner()
    store.removePhoto.mockResolvedValueOnce({ kind: 'conflict', status: 'ARCHIVED' } as never)

    const res = await request(app).delete(url).set('Cookie', cookie)

    expect(res.status).toBe(409)
    expect(res.body.code).toBe('LISTING_STATE_INVALID')
    expect(photos.remove).not.toHaveBeenCalled()
  })
})

describe('every error carries a known code', () => {
  it('uses only codes from errorCodeSchema across the failure paths exercised here', async () => {
    const { app, owner, signIn } = setup()
    const { cookie } = await owner()
    const client = await signIn('c@example.com', 'CLIENT')
    const bodies = [
      (await request(app).get('/api/vendor/placements')).body,
      (await request(app).get('/api/vendor/placements').set('Cookie', client)).body,
      (await request(app).get('/api/vendor/placements/nope').set('Cookie', cookie)).body,
      (await request(app).post('/api/vendor/placements').set('Cookie', cookie).send({})).body,
      (await request(app).delete(`/api/vendor/placements/${ID}/photos/x`).set('Cookie', cookie))
        .body,
    ]

    for (const body of bodies) expect(errorCodeSchema.safeParse(body.code).success).toBe(true)
  })
})

describe('/uploads', () => {
  it('serves stored photos with nosniff, and nothing outside the directory', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'reclo-uploads-'))
    tempDirs.push(dir)
    await mkdir(path.join(dir, 'placements', ID), { recursive: true })
    await writeFile(path.join(dir, 'placements', ID, FILE), JPEG)
    await writeFile(path.join(path.dirname(dir), 'reclo-secret.txt'), 'secret')
    const { app } = setup({ uploadsDir: dir })

    const found = await request(app).get(`/uploads/placements/${ID}/${FILE}`)
    const missing = await request(app).get('/uploads/placements/nope.jpg')
    const traversal = await request(app).get('/uploads/..%2Freclo-secret.txt')

    expect(found.status).toBe(200)
    expect(found.headers['content-type']).toBe('image/jpeg')
    expect(found.headers['x-content-type-options']).toBe('nosniff')
    expect(missing.status).toBe(404)
    expect(traversal.status).not.toBe(200)
    await rm(path.join(path.dirname(dir), 'reclo-secret.txt'), { force: true })
  })

  it('serves nothing when no uploads directory is configured', async () => {
    const { app } = setup()

    expect((await request(app).get(`/uploads/placements/${ID}/${FILE}`)).status).toBe(404)
  })
})
