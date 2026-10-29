import type { Inquiry } from '@reclo/shared'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../app'
import { SESSION_COOKIE } from '../auth/session'
import type { MailMessage, Mailer } from '../email/mailer'
import { createMemoryAuthStore } from '../test-helpers'
import { OpenInquiryExistsError, type InquiryPlacement, type InquiryStore } from './store'

/** The new-inquiry vendor email (KAN-17), as the inquiry route sends it. */

const PLACEMENT_ID = 'b1e0696a-54c3-4d40-84c4-f2a89326e680'
const VENDOR_ID = 'vendor-123'
const WEB_PUBLIC_URL = 'https://reclo.example'

const credentials = { email: 'client@example.com', password: 'correct-horse' }

const placement: InquiryPlacement = {
  id: PLACEMENT_ID,
  vendorId: VENDOR_ID,
  title: 'Amir Temur Billboard',
  address: 'Amir Temur shoh ko‘chasi 1',
  city: 'Tashkent',
  type: 'BILLBOARD',
  vendor: { email: 'vendor@example.com', companyName: 'Outdoor Media' },
}

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

/** Records every email instead of sending it. */
function createRecordingMailer(send?: Mailer['send']) {
  const sent: MailMessage[] = []
  const mailer: Mailer = {
    send: vi.fn(async (message: MailMessage) => {
      sent.push(message)
      await send?.(message)
    }),
  }
  return { mailer, sent }
}

function setup({
  store: storeOverride = {},
  mailer = createRecordingMailer().mailer,
}: { store?: Partial<InquiryStore>; mailer?: Mailer } = {}) {
  const memory = createMemoryAuthStore()
  const store: InquiryStore = {
    findActivePlacement: vi.fn().mockResolvedValue(placement),
    findOpenInquiry: vi.fn().mockResolvedValue(null),
    closeStaleInquiry: vi.fn().mockResolvedValue(true),
    createInquiry: vi.fn().mockResolvedValue(createdInquiry),
    listClientInquiries: vi.fn().mockResolvedValue([]),
    ...storeOverride,
  }
  const app = createApp({
    checkDatabase: async () => {},
    authStore: memory.store,
    inquiryStore: store,
    mailer,
    webPublicUrl: WEB_PUBLIC_URL,
  })
  return { app, store }
}

async function signIn(app: ReturnType<typeof setup>['app']): Promise<string> {
  const response = await request(app).post('/api/auth/register').send(credentials)
  const header = response.headers['set-cookie'] as unknown as string[] | undefined
  const cookie = header?.find((value) => value.startsWith(`${SESSION_COOKIE}=`))
  if (!cookie) throw new Error('no session cookie in response')
  return cookie.split(';')[0]!
}

/** Lets the un-awaited send settle, so "no email" is a real observation and not a race. */
async function flushPendingSends() {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('POST /api/inquiries: vendor email', () => {
  it('emails the vendor once, with Reply-To set to the client', async () => {
    const { mailer, sent } = createRecordingMailer()
    const { app } = setup({ mailer })
    const cookie = await signIn(app)

    const response = await request(app).post('/api/inquiries').set('Cookie', cookie).send(validBody)

    expect(response.status).toBe(201)
    await vi.waitFor(() => expect(sent).toHaveLength(1))
    const [email] = sent
    expect(email!.to).toBe('vendor@example.com')
    expect(email!.replyTo).toBe('aziza@example.com')
    expect(email!.subject).toBe("Yangi so'rov / Новый запрос: Amir Temur Billboard")
    expect(email!.text).toContain('+998 90 123 45 67')
    expect(email!.text).toContain(validBody.message)
    expect(email!.html).toContain(`href="${WEB_PUBLIC_URL}/vendor/placements/${PLACEMENT_ID}/edit"`)
  })

  it('still answers 201 with the inquiry when the mailer rejects, and logs ids only', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { mailer } = createRecordingMailer(async () => {
      throw new Error('SMTP down')
    })
    const { app } = setup({ mailer })
    const cookie = await signIn(app)

    const response = await request(app).post('/api/inquiries').set('Cookie', cookie).send(validBody)

    expect(response.status).toBe(201)
    expect(response.body).toEqual({ inquiry: createdInquiry })
    await vi.waitFor(() => expect(consoleError).toHaveBeenCalledTimes(1))
    const [message, context] = consoleError.mock.calls[0]!
    expect(message).toBe('Failed to send new-inquiry email')
    expect(context).toEqual({ inquiryId: createdInquiry.id, vendorId: VENDOR_ID })
    expect(JSON.stringify(consoleError.mock.calls[0]!.slice(0, 2))).not.toContain('aziza')
  })

  it('does not wait for the mailer before answering', async () => {
    // A send that never settles: if the route awaited it, this request would time out.
    const { mailer } = createRecordingMailer(() => new Promise<void>(() => {}))
    const { app } = setup({ mailer })
    const cookie = await signIn(app)

    const response = await request(app).post('/api/inquiries').set('Cookie', cookie).send(validBody)

    expect(response.status).toBe(201)
    expect(mailer.send).toHaveBeenCalledTimes(1)
  })

  it('sends nothing when the placement is not found', async () => {
    const { mailer } = createRecordingMailer()
    const { app } = setup({
      mailer,
      store: { findActivePlacement: vi.fn().mockResolvedValue(null) },
    })
    const cookie = await signIn(app)

    const response = await request(app).post('/api/inquiries').set('Cookie', cookie).send(validBody)
    await flushPendingSends()

    expect(response.status).toBe(404)
    expect(mailer.send).not.toHaveBeenCalled()
  })

  it('sends nothing when the database rejects a duplicate', async () => {
    const { mailer } = createRecordingMailer()
    const { app } = setup({
      mailer,
      store: { createInquiry: vi.fn().mockRejectedValue(new OpenInquiryExistsError()) },
    })
    const cookie = await signIn(app)

    const response = await request(app).post('/api/inquiries').set('Cookie', cookie).send(validBody)
    await flushPendingSends()

    expect(response.status).toBe(409)
    expect(mailer.send).not.toHaveBeenCalled()
  })

  it('sends nothing, and fails nothing, when no mailer is configured', async () => {
    const memory = createMemoryAuthStore()
    const app = createApp({
      checkDatabase: async () => {},
      authStore: memory.store,
      inquiryStore: {
        findActivePlacement: vi.fn().mockResolvedValue(placement),
        findOpenInquiry: vi.fn().mockResolvedValue(null),
        closeStaleInquiry: vi.fn().mockResolvedValue(true),
        createInquiry: vi.fn().mockResolvedValue(createdInquiry),
        listClientInquiries: vi.fn().mockResolvedValue([]),
      },
    })
    const cookie = await signIn(app)

    const response = await request(app).post('/api/inquiries').set('Cookie', cookie).send(validBody)

    expect(response.status).toBe(201)
  })
})
