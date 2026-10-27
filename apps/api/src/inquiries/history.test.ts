import { INQUIRY_PAGE_SIZE, type InquiryHistoryItem } from '@reclo/shared'
import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../app'
import { SESSION_COOKIE } from '../auth/session'
import { createMemoryAuthStore } from '../test-helpers'
import { decodeCursor, encodeCursor } from './cursor'
import type { InquiryStore, ListClientInquiriesInput } from './store'

const PLACEMENT_ID = 'b1e0696a-54c3-4d40-84c4-f2a89326e680'
const VENDOR_ID = 'vendor-123'

const credentials = { email: 'client@example.com', password: 'correct-horse' }

/** A history row, varied per test. The index into a page keeps ids and dates distinct. */
function historyItem(index: number, overrides: Partial<InquiryHistoryItem> = {}) {
  return {
    id: `inquiry-${index}`,
    placementId: PLACEMENT_ID,
    status: 'NEW',
    message: 'We would like to run a two-month campaign on this billboard.',
    contactName: 'Aziza Karimova',
    contactPhone: '+998901234567',
    contactEmail: 'aziza@example.com',
    desiredStartDate: null,
    durationMonths: null,
    // Descending, so index 0 is the newest — the order the route returns them in.
    createdAt: new Date(Date.UTC(2026, 9, 26, 10, 0, 0) - index * 60_000).toISOString(),
    placement: {
      id: PLACEMENT_ID,
      title: 'Amir Temur Avenue billboard',
      city: 'Tashkent',
      type: 'BILLBOARD',
      isViewable: true,
    },
    ...overrides,
  } satisfies InquiryHistoryItem
}

function setup(storeOverride: Partial<InquiryStore> = {}) {
  const memory = createMemoryAuthStore()
  const store: InquiryStore = {
    findActivePlacement: vi.fn().mockResolvedValue({ id: PLACEMENT_ID, vendorId: VENDOR_ID }),
    findOpenInquiry: vi.fn().mockResolvedValue(null),
    closeStaleInquiry: vi.fn().mockResolvedValue(true),
    createInquiry: vi.fn(),
    listClientInquiries: vi.fn().mockResolvedValue([]),
    ...storeOverride,
  }
  const app = createApp({
    checkDatabase: async () => {},
    authStore: memory.store,
    inquiryStore: store,
  })
  // `memory` is spread first: it also has a `store`, which is the auth one.
  return { app, ...memory, store }
}

async function signIn(app: ReturnType<typeof setup>['app']): Promise<string> {
  const response = await request(app).post('/api/auth/register').send(credentials)
  const header = response.headers['set-cookie'] as unknown as string[] | undefined
  const cookie = header?.find((value) => value.startsWith(`${SESSION_COOKIE}=`))
  if (!cookie) throw new Error('no session cookie in response')
  return cookie.split(';')[0]!
}

/** The arguments the route passed to the store on its only call. */
function lastQuery(store: InquiryStore): ListClientInquiriesInput {
  const mock = vi.mocked(store.listClientInquiries)
  return mock.mock.calls[0]![0]
}

describe('GET /api/inquiries', () => {
  it('returns the client history with the rows the store gave it', async () => {
    const rows = [historyItem(0), historyItem(1)]
    const { app, store } = setup({ listClientInquiries: vi.fn().mockResolvedValue(rows) })
    const cookie = await signIn(app)

    const response = await request(app).get('/api/inquiries').set('Cookie', cookie)

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ inquiries: rows, nextCursor: null })
    expect(store.listClientInquiries).toHaveBeenCalledTimes(1)
  })

  it('returns 401 when not signed in', async () => {
    const { app, store } = setup()

    const response = await request(app).get('/api/inquiries')

    expect(response.status).toBe(401)
    expect(store.listClientInquiries).not.toHaveBeenCalled()
  })

  it('returns 403 when the signed-in user is not a CLIENT', async () => {
    const { app, store, setRole } = setup()
    const cookie = await signIn(app)
    setRole(credentials.email, 'VENDOR')

    const response = await request(app).get('/api/inquiries').set('Cookie', cookie)

    expect(response.status).toBe(403)
    expect(store.listClientInquiries).not.toHaveBeenCalled()
  })

  it('reads clientId from the session, ignoring one in the query', async () => {
    const { app, store, users } = setup()
    const cookie = await signIn(app)

    const response = await request(app)
      .get('/api/inquiries')
      .query({ clientId: 'someone-else' })
      .set('Cookie', cookie)

    expect(response.status).toBe(200)
    // The whole point of there being no clientId parameter: another client's history must not be
    // reachable by guessing an id.
    expect(lastQuery(store).clientId).toBe(users[0]!.id)
  })

  describe('paging', () => {
    it('asks for one row past the page, so a full page is distinguishable from the last', async () => {
      const { app, store } = setup()
      const cookie = await signIn(app)

      await request(app).get('/api/inquiries').set('Cookie', cookie)

      expect(lastQuery(store).limit).toBe(INQUIRY_PAGE_SIZE + 1)
    })

    it('trims the extra row and returns a cursor when more remain', async () => {
      const rows = Array.from({ length: INQUIRY_PAGE_SIZE + 1 }, (_, index) => historyItem(index))
      const { app } = setup({ listClientInquiries: vi.fn().mockResolvedValue(rows) })
      const cookie = await signIn(app)

      const response = await request(app).get('/api/inquiries').set('Cookie', cookie)

      expect(response.body.inquiries).toHaveLength(INQUIRY_PAGE_SIZE)
      // The extra row is the signal that there is more, not part of the page.
      expect(response.body.inquiries.at(-1).id).toBe(`inquiry-${INQUIRY_PAGE_SIZE - 1}`)
      expect(response.body.nextCursor).not.toBeNull()
    })

    it('points the cursor at the last row returned, not at the row it trimmed', async () => {
      const rows = Array.from({ length: INQUIRY_PAGE_SIZE + 1 }, (_, index) => historyItem(index))
      const last = rows[INQUIRY_PAGE_SIZE - 1]!
      const { app } = setup({ listClientInquiries: vi.fn().mockResolvedValue(rows) })
      const cookie = await signIn(app)

      const response = await request(app).get('/api/inquiries').set('Cookie', cookie)

      // Resuming from the trimmed row instead would skip it entirely.
      expect(decodeCursor(response.body.nextCursor)).toEqual({
        createdAt: new Date(last.createdAt),
        id: last.id,
      })
    })

    it('returns a null cursor on a short page', async () => {
      const rows = [historyItem(0)]
      const { app } = setup({ listClientInquiries: vi.fn().mockResolvedValue(rows) })
      const cookie = await signIn(app)

      const response = await request(app).get('/api/inquiries').set('Cookie', cookie)

      expect(response.body.nextCursor).toBeNull()
    })

    it('returns a null cursor on an exactly-full page, so the next page is never empty', async () => {
      const rows = Array.from({ length: INQUIRY_PAGE_SIZE }, (_, index) => historyItem(index))
      const { app } = setup({ listClientInquiries: vi.fn().mockResolvedValue(rows) })
      const cookie = await signIn(app)

      const response = await request(app).get('/api/inquiries').set('Cookie', cookie)

      expect(response.body.inquiries).toHaveLength(INQUIRY_PAGE_SIZE)
      expect(response.body.nextCursor).toBeNull()
    })

    it('returns an empty page rather than 404 when the client has no inquiries', async () => {
      const { app } = setup()
      const cookie = await signIn(app)

      const response = await request(app).get('/api/inquiries').set('Cookie', cookie)

      expect(response.status).toBe(200)
      expect(response.body).toEqual({ inquiries: [], nextCursor: null })
    })

    it('passes a decoded cursor through to the store', async () => {
      const position = { createdAt: new Date('2026-10-26T10:00:00.000Z'), id: 'inquiry-7' }
      const { app, store } = setup()
      const cookie = await signIn(app)

      await request(app)
        .get('/api/inquiries')
        .query({ cursor: encodeCursor(position) })
        .set('Cookie', cookie)

      expect(lastQuery(store).cursor).toEqual(position)
    })

    it('rejects a malformed cursor rather than silently restarting at page one', async () => {
      const { app, store } = setup()
      const cookie = await signIn(app)

      const response = await request(app)
        .get('/api/inquiries')
        .query({ cursor: 'not-a-cursor' })
        .set('Cookie', cookie)

      expect(response.status).toBe(400)
      expect(response.body.fieldErrors.cursor).toEqual(['Invalid cursor'])
      expect(store.listClientInquiries).not.toHaveBeenCalled()
    })
  })

  describe('query validation', () => {
    it('filters by status when one is given', async () => {
      const { app, store } = setup()
      const cookie = await signIn(app)

      const response = await request(app)
        .get('/api/inquiries')
        .query({ status: 'RESPONDED' })
        .set('Cookie', cookie)

      expect(response.status).toBe(200)
      expect(lastQuery(store).status).toBe('RESPONDED')
    })

    it('leaves status unset when none is given, so All means all', async () => {
      const { app, store } = setup()
      const cookie = await signIn(app)

      await request(app).get('/api/inquiries').set('Cookie', cookie)

      expect(lastQuery(store).status).toBeUndefined()
    })

    it('rejects a status outside the enum', async () => {
      const { app, store } = setup()
      const cookie = await signIn(app)

      const response = await request(app)
        .get('/api/inquiries')
        .query({ status: 'PENDING' })
        .set('Cookie', cookie)

      expect(response.status).toBe(400)
      expect(store.listClientInquiries).not.toHaveBeenCalled()
    })

    it('coerces the limit a query string carries', async () => {
      const { app, store } = setup()
      const cookie = await signIn(app)

      await request(app).get('/api/inquiries').query({ limit: '5' }).set('Cookie', cookie)

      expect(lastQuery(store).limit).toBe(6)
    })

    it.each([
      ['zero', '0'],
      ['a negative limit', '-1'],
      ['past the cap', '51'],
      ['a fraction', '1.5'],
      ['a non-numeric limit', 'all'],
    ])('rejects %s', async (_label, limit) => {
      const { app, store } = setup()
      const cookie = await signIn(app)

      const response = await request(app)
        .get('/api/inquiries')
        .query({ limit })
        .set('Cookie', cookie)

      expect(response.status).toBe(400)
      expect(store.listClientInquiries).not.toHaveBeenCalled()
    })
  })

  it('returns an archived placement without a link flag, rather than hiding the inquiry', async () => {
    const archived = historyItem(0, {
      placement: {
        id: PLACEMENT_ID,
        title: 'Amir Temur Avenue billboard',
        city: 'Tashkent',
        type: 'BILLBOARD',
        isViewable: false,
      },
    })
    const { app } = setup({ listClientInquiries: vi.fn().mockResolvedValue([archived]) })
    const cookie = await signIn(app)

    const response = await request(app).get('/api/inquiries').set('Cookie', cookie)

    // A vendor archiving a listing must not erase the client's record of what they sent.
    expect(response.body.inquiries).toHaveLength(1)
    expect(response.body.inquiries[0].placement.isViewable).toBe(false)
  })

  it('returns a hard-deleted placement as null, still keeping the row', async () => {
    const orphan = historyItem(0, { placement: null })
    const { app } = setup({ listClientInquiries: vi.fn().mockResolvedValue([orphan]) })
    const cookie = await signIn(app)

    const response = await request(app).get('/api/inquiries').set('Cookie', cookie)

    expect(response.body.inquiries[0].placement).toBeNull()
  })

  it('does not expose the vendor, as the submission response does not either', async () => {
    const { app } = setup({ listClientInquiries: vi.fn().mockResolvedValue([historyItem(0)]) })
    const cookie = await signIn(app)

    const response = await request(app).get('/api/inquiries').set('Cookie', cookie)

    expect(response.body.inquiries[0]).not.toHaveProperty('vendorId')
    expect(response.body.inquiries[0]).not.toHaveProperty('clientId')
  })
})
