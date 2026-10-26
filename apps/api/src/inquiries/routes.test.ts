import type { Inquiry } from '@reclo/shared'
import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../app'
import { SESSION_COOKIE } from '../auth/session'
import { createMemoryAuthStore } from '../test-helpers'
import { OpenInquiryExistsError, type InquiryStore } from './store'

const PLACEMENT_ID = 'b1e0696a-54c3-4d40-84c4-f2a89326e680'
const VENDOR_ID = 'vendor-123'

const credentials = { email: 'client@example.com', password: 'correct-horse' }

const validBody = {
  placementId: PLACEMENT_ID,
  message: 'We would like to run a two-month campaign on this billboard.',
  contactName: 'Aziza Karimova',
  contactPhone: '+998 90 123 45 67',
  contactEmail: 'Aziza@Example.COM',
  desiredStartDate: '2026-12-01',
  durationMonths: 3,
}

const createdInquiry: Inquiry = {
  id: '8f1e2bb6-6ad8-4a2e-9f6e-1c2f6f2a31aa',
  placementId: PLACEMENT_ID,
  status: 'NEW',
  message: validBody.message,
  contactName: validBody.contactName,
  contactPhone: '+998901234567',
  contactEmail: 'aziza@example.com',
  desiredStartDate: '2026-12-01',
  durationMonths: 3,
  createdAt: '2026-10-26T10:00:00.000Z',
}

function setup(storeOverride: Partial<InquiryStore> = {}) {
  const memory = createMemoryAuthStore()
  const store: InquiryStore = {
    findActivePlacement: vi.fn().mockResolvedValue({ id: PLACEMENT_ID, vendorId: VENDOR_ID }),
    findOpenInquiry: vi.fn().mockResolvedValue(null),
    createInquiry: vi.fn().mockResolvedValue(createdInquiry),
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

/** Registers a client and returns its session cookie, e.g. "reclo_session=abc". */
async function signIn(app: ReturnType<typeof setup>['app']): Promise<string> {
  const response = await request(app).post('/api/auth/register').send(credentials)
  const header = response.headers['set-cookie'] as unknown as string[] | undefined
  const cookie = header?.find((value) => value.startsWith(`${SESSION_COOKIE}=`))
  if (!cookie) throw new Error('no session cookie in response')
  return cookie.split(';')[0]!
}

describe('POST /api/inquiries', () => {
  it('creates the inquiry with normalized contact details and returns 201', async () => {
    const { app, store, users } = setup()
    const cookie = await signIn(app)

    const response = await request(app).post('/api/inquiries').set('Cookie', cookie).send(validBody)

    expect(response.status).toBe(201)
    expect(response.body).toEqual({ inquiry: createdInquiry })
    expect(store.createInquiry).toHaveBeenCalledTimes(1)
    expect(store.createInquiry).toHaveBeenCalledWith({
      placementId: PLACEMENT_ID,
      clientId: users[0]!.id,
      vendorId: VENDOR_ID,
      message: validBody.message,
      contactName: validBody.contactName,
      contactPhone: '+998901234567',
      contactEmail: 'aziza@example.com',
      desiredStartDate: new Date('2026-12-01T00:00:00.000Z'),
      durationMonths: 3,
    })
  })

  it('takes clientId and vendorId from the session and the placement, never from the body', async () => {
    const { app, store, users } = setup()
    const cookie = await signIn(app)

    await request(app)
      .post('/api/inquiries')
      .set('Cookie', cookie)
      .send({ ...validBody, clientId: 'spoofed', vendorId: 'spoofed', status: 'CLOSED' })

    expect(store.createInquiry).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: users[0]!.id, vendorId: VENDOR_ID }),
    )
    expect(store.createInquiry).toHaveBeenCalledWith(
      expect.not.objectContaining({ status: 'CLOSED' }),
    )
  })

  it('stores the optional campaign fields as null when they are omitted', async () => {
    const { app, store } = setup()
    const cookie = await signIn(app)

    const response = await request(app).post('/api/inquiries').set('Cookie', cookie).send({
      placementId: PLACEMENT_ID,
      message: validBody.message,
      contactName: validBody.contactName,
      contactPhone: '901234567',
      contactEmail: validBody.contactEmail,
    })

    expect(response.status).toBe(201)
    expect(store.createInquiry).toHaveBeenCalledWith(
      expect.objectContaining({
        contactPhone: '+998901234567',
        desiredStartDate: null,
        durationMonths: null,
      }),
    )
  })

  it('returns 401 when the request carries no session', async () => {
    const { app, store } = setup()

    const response = await request(app).post('/api/inquiries').send(validBody)

    expect(response.status).toBe(401)
    expect(response.body).toEqual({ error: 'Not authenticated' })
    expect(store.createInquiry).not.toHaveBeenCalled()
  })

  it('returns 403 when the signed-in user is not a CLIENT', async () => {
    const { app, store, setRole } = setup()
    const cookie = await signIn(app)
    setRole(credentials.email, 'VENDOR')

    const response = await request(app).post('/api/inquiries').set('Cookie', cookie).send(validBody)

    expect(response.status).toBe(403)
    expect(response.body).toEqual({ error: 'Forbidden' })
    expect(store.createInquiry).not.toHaveBeenCalled()
  })

  it('returns 400 with field errors for an invalid body', async () => {
    const { app, store } = setup()
    const cookie = await signIn(app)

    const response = await request(app).post('/api/inquiries').set('Cookie', cookie).send({
      placementId: 'not-a-uuid',
      message: 'too short',
      contactName: 'A',
      contactPhone: '+7 495 123 45 67',
      contactEmail: 'not-an-email',
      durationMonths: 36,
    })

    expect(response.status).toBe(400)
    expect(response.body.error).toBe('Invalid input')
    expect(Object.keys(response.body.fieldErrors)).toEqual(
      expect.arrayContaining([
        'placementId',
        'message',
        'contactName',
        'contactPhone',
        'contactEmail',
        'durationMonths',
      ]),
    )
    expect(store.createInquiry).not.toHaveBeenCalled()
  })

  it('returns 404 when the placement does not exist or is not ACTIVE', async () => {
    const { app, store } = setup({ findActivePlacement: vi.fn().mockResolvedValue(null) })
    const cookie = await signIn(app)

    const response = await request(app).post('/api/inquiries').set('Cookie', cookie).send(validBody)

    expect(response.status).toBe(404)
    expect(response.body).toEqual({ error: 'Placement not found' })
    expect(store.createInquiry).not.toHaveBeenCalled()
  })

  it('returns 409 and the earlier date when an open inquiry already exists', async () => {
    const existing = { id: 'earlier', createdAt: new Date('2026-10-20T08:00:00.000Z') }
    const { app, store } = setup({ findOpenInquiry: vi.fn().mockResolvedValue(existing) })
    const cookie = await signIn(app)

    const response = await request(app).post('/api/inquiries').set('Cookie', cookie).send(validBody)

    expect(response.status).toBe(409)
    expect(response.body).toEqual({
      error: 'You already have an open inquiry for this placement',
      existingInquiryCreatedAt: existing.createdAt.toISOString(),
    })
    expect(store.createInquiry).not.toHaveBeenCalled()
  })

  it('only counts open inquiries from the last 14 days', async () => {
    const now = new Date('2026-10-26T10:00:00.000Z')
    const memory = createMemoryAuthStore()
    const store: InquiryStore = {
      findActivePlacement: vi.fn().mockResolvedValue({ id: PLACEMENT_ID, vendorId: VENDOR_ID }),
      findOpenInquiry: vi.fn().mockResolvedValue(null),
      createInquiry: vi.fn().mockResolvedValue(createdInquiry),
    }
    const app = createApp({
      checkDatabase: async () => {},
      authStore: memory.store,
      inquiryStore: store,
      now: () => now,
    })
    const cookie = await signIn(app)

    const response = await request(app).post('/api/inquiries').set('Cookie', cookie).send(validBody)

    expect(response.status).toBe(201)
    expect(store.findOpenInquiry).toHaveBeenCalledWith({
      clientId: memory.users[0]!.id,
      placementId: PLACEMENT_ID,
      since: new Date('2026-10-12T10:00:00.000Z'),
    })
  })

  it('returns 409 when the database rejects a racing second submit', async () => {
    const { app } = setup({
      createInquiry: vi.fn().mockRejectedValue(new OpenInquiryExistsError()),
    })
    const cookie = await signIn(app)

    const response = await request(app).post('/api/inquiries').set('Cookie', cookie).send(validBody)

    expect(response.status).toBe(409)
    expect(response.body).toEqual({
      error: 'You already have an open inquiry for this placement',
    })
  })

  it('returns 500 and no details when the store fails unexpectedly', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { app } = setup({ createInquiry: vi.fn().mockRejectedValue(new Error('db is on fire')) })
    const cookie = await signIn(app)

    const response = await request(app).post('/api/inquiries').set('Cookie', cookie).send(validBody)

    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Something went wrong' })
    expect(JSON.stringify(response.body)).not.toContain('on fire')
    consoleError.mockRestore()
  })

  it('rate limits repeated submissions from one IP', async () => {
    const memory = createMemoryAuthStore()
    const app = createApp({
      checkDatabase: async () => {},
      authStore: memory.store,
      inquiryStore: {
        findActivePlacement: vi.fn().mockResolvedValue({ id: PLACEMENT_ID, vendorId: VENDOR_ID }),
        findOpenInquiry: vi.fn().mockResolvedValue(null),
        createInquiry: vi.fn().mockResolvedValue(createdInquiry),
      },
      inquiryRateLimitMax: 2,
    })
    const cookie = await signIn(app)

    const statuses: number[] = []
    for (let attempt = 0; attempt < 3; attempt++) {
      const response = await request(app)
        .post('/api/inquiries')
        .set('Cookie', cookie)
        .send(validBody)
      statuses.push(response.status)
    }

    expect(statuses).toEqual([201, 201, 429])
  })
})
