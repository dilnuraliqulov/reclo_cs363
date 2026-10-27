import type { Inquiry, InquiryStatus } from '@reclo/shared'
import { OPEN_INQUIRY_STATUSES } from '@reclo/shared'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createApp } from '../app'
import { SESSION_COOKIE } from '../auth/session'
import { createMemoryAuthStore } from '../test-helpers'
import { OpenInquiryExistsError, type InquiryStore } from './store'

/**
 * Duplicate suppression across the 14-day window, exercised against a store that applies the same
 * rule the partial unique index does. The route tests in routes.test.ts stub the store's answer;
 * these check that the window itself lets the right inquiries through.
 */

const PLACEMENT_ID = 'b1e0696a-54c3-4d40-84c4-f2a89326e680'
const VENDOR_ID = 'vendor-123'
const NOW = new Date('2026-10-26T10:00:00.000Z')

const credentials = { email: 'client@example.com', password: 'correct-horse' }

const validBody = {
  placementId: PLACEMENT_ID,
  message: 'We would like to run a two-month campaign on this billboard.',
  contactName: 'Aziza Karimova',
  contactPhone: '+998901234567',
  contactEmail: 'aziza@example.com',
}

/** Open means the partial unique index covers the row. */
function isOpen(status: InquiryStatus): boolean {
  return OPEN_INQUIRY_STATUSES.includes(status as (typeof OPEN_INQUIRY_STATUSES)[number])
}

interface SeededInquiry {
  clientId: string
  placementId: string
  status: InquiryStatus
  createdAt: Date
}

/** An InquiryStore over an array, enforcing one open inquiry per client and placement. */
function createMemoryInquiryStore(seed: SeededInquiry[] = []) {
  const rows = [...seed]

  const store: InquiryStore = {
    async findActivePlacement(id) {
      return id === PLACEMENT_ID ? { id: PLACEMENT_ID, vendorId: VENDOR_ID } : null
    },

    async findOpenInquiry({ clientId, placementId }) {
      const open = rows
        .map((row, index) => ({ row, id: `row-${index}` }))
        .filter(
          ({ row }) =>
            row.clientId === clientId && row.placementId === placementId && isOpen(row.status),
        )
        .sort((a, b) => b.row.createdAt.getTime() - a.row.createdAt.getTime())
      return open[0] ? { id: open[0].id, createdAt: open[0].row.createdAt } : null
    },

    async closeStaleInquiry(id) {
      const row = rows[Number(id.replace('row-', ''))]
      if (!row || !isOpen(row.status)) return false
      row.status = 'CLOSED'
      return true
    },

    async createInquiry(input) {
      // What the partial unique index enforces: open rows are unique per client and placement,
      // with no regard for how old they are.
      const clash = rows.some(
        (row) =>
          row.clientId === input.clientId &&
          row.placementId === input.placementId &&
          isOpen(row.status),
      )
      if (clash) throw new OpenInquiryExistsError()
      rows.push({
        clientId: input.clientId,
        placementId: input.placementId,
        status: 'NEW',
        createdAt: NOW,
      })
      return {
        id: '8f1e2bb6-6ad8-4a2e-9f6e-1c2f6f2a31aa',
        placementId: input.placementId,
        status: 'NEW',
        message: input.message,
        contactName: input.contactName,
        contactPhone: input.contactPhone,
        contactEmail: input.contactEmail,
        desiredStartDate: null,
        durationMonths: null,
        createdAt: NOW.toISOString(),
      } satisfies Inquiry
    },
  }

  return { store, rows }
}

/** An app whose clock is fixed at NOW, with `seed` already in the inquiry store. */
async function setup(seed: (clientId: string) => SeededInquiry[] = () => []) {
  const memory = createMemoryAuthStore()
  // The seed needs the client's id, which only exists once the account does.
  const placeholder = createMemoryInquiryStore()
  const app = createApp({
    checkDatabase: async () => {},
    authStore: memory.store,
    inquiryStore: placeholder.store,
    now: () => NOW,
  })
  const registered = await request(app).post('/api/auth/register').send(credentials)
  const header = registered.headers['set-cookie'] as unknown as string[] | undefined
  const cookie = header?.find((value) => value.startsWith(`${SESSION_COOKIE}=`))?.split(';')[0]
  if (!cookie) throw new Error('no session cookie in response')
  const clientId = memory.users[0]!.id

  // Rebuild the app now that the seed can reference the client.
  const seeded = createMemoryInquiryStore(seed(clientId))
  const seededApp = createApp({
    checkDatabase: async () => {},
    authStore: memory.store,
    inquiryStore: seeded.store,
    now: () => NOW,
  })

  return { app: seededApp, cookie, clientId, rows: seeded.rows }
}

function daysBefore(days: number): Date {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000)
}

describe('the 14-day duplicate window', () => {
  it('refuses a second inquiry while an earlier one is open', async () => {
    const { app, cookie } = await setup((clientId) => [
      { clientId, placementId: PLACEMENT_ID, status: 'NEW', createdAt: daysBefore(1) },
    ])

    const response = await request(app).post('/api/inquiries').set('Cookie', cookie).send(validBody)

    expect(response.status).toBe(409)
    expect(response.body.error).toBe('You already have an open inquiry for this placement')
    expect(response.body.existingInquiryCreatedAt).toBe(daysBefore(1).toISOString())
  })

  it('still refuses one day before the window closes', async () => {
    const { app, cookie } = await setup((clientId) => [
      { clientId, placementId: PLACEMENT_ID, status: 'READ', createdAt: daysBefore(13) },
    ])

    expect(
      (await request(app).post('/api/inquiries').set('Cookie', cookie).send(validBody)).status,
    ).toBe(409)
  })

  it('lets a new inquiry through once the earlier one is over 14 days old', async () => {
    // A vendor who opens an inquiry and never replies must not lock the client out of that
    // placement forever, which a status-only rule would do.
    const { app, cookie } = await setup((clientId) => [
      { clientId, placementId: PLACEMENT_ID, status: 'READ', createdAt: daysBefore(15) },
    ])

    const response = await request(app).post('/api/inquiries').set('Cookie', cookie).send(validBody)

    expect(response.status).toBe(201)
    expect(response.body.inquiry.status).toBe('NEW')
  })

  it.each([
    ['RESPONDED', 'RESPONDED' as const],
    ['CLOSED', 'CLOSED' as const],
  ])('ignores a recent %s inquiry, which is not open', async (_label, status) => {
    const { app, cookie } = await setup((clientId) => [
      { clientId, placementId: PLACEMENT_ID, status, createdAt: daysBefore(1) },
    ])

    expect(
      (await request(app).post('/api/inquiries').set('Cookie', cookie).send(validBody)).status,
    ).toBe(201)
  })

  it('does not block a different placement', async () => {
    const other = 'c2f1797b-65d4-4e51-95d5-03b9a4437791'
    const { app, cookie } = await setup((clientId) => [
      { clientId, placementId: other, status: 'NEW', createdAt: daysBefore(1) },
    ])

    expect(
      (await request(app).post('/api/inquiries').set('Cookie', cookie).send(validBody)).status,
    ).toBe(201)
  })

  it('does not block a different client', async () => {
    const { app, cookie } = await setup(() => [
      {
        clientId: 'someone-else',
        placementId: PLACEMENT_ID,
        status: 'NEW',
        createdAt: daysBefore(1),
      },
    ])

    expect(
      (await request(app).post('/api/inquiries').set('Cookie', cookie).send(validBody)).status,
    ).toBe(201)
  })

  it('closes the stale inquiry it replaced, rather than leaving two open', async () => {
    const { app, cookie, rows } = await setup((clientId) => [
      { clientId, placementId: PLACEMENT_ID, status: 'NEW', createdAt: daysBefore(20) },
    ])

    expect(
      (await request(app).post('/api/inquiries').set('Cookie', cookie).send(validBody)).status,
    ).toBe(201)
    expect(rows).toHaveLength(2)
    expect(rows[0]!.status).toBe('CLOSED')
    expect(rows[1]!.status).toBe('NEW')
  })

  it('records exactly one row when the same client submits twice in a row', async () => {
    const { app, cookie, rows } = await setup()

    const first = await request(app).post('/api/inquiries').set('Cookie', cookie).send(validBody)
    const second = await request(app).post('/api/inquiries').set('Cookie', cookie).send(validBody)

    expect(first.status).toBe(201)
    expect(second.status).toBe(409)
    expect(rows).toHaveLength(1)
  })
})
