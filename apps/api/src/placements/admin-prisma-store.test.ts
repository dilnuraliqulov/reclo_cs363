import { describe, expect, it } from 'vitest'
import { PrismaAdminPlacementStore } from './admin-prisma-store'
import { createFakePrisma, type FakeRow } from './fake-prisma'
import { PrismaVendorPlacementStore } from './vendor-prisma-store'

const ID = 'b1e0696a-54c3-4d40-84c4-f2a89326e680'
const ADMIN = 'admin-1'
const OTHER_ADMIN = 'admin-2'
const VENDOR = 'vendor-1'
const SEEN = new Date(Date.UTC(2026, 9, 1, 0, 0, 0)) // the fake's default updatedAt
const PHOTO = '/uploads/placements/x/a.jpg'
const REASON = 'The photo does not show the billboard'

const users = [
  { id: ADMIN, email: 'aziza@reclo.test' },
  { id: OTHER_ADMIN, email: 'rustam@reclo.test' },
  { id: VENDOR, email: 'vendor@example.com' },
]

function setup(rows: Partial<FakeRow>[] = [{ id: ID, vendorId: VENDOR, photos: [PHOTO] }]) {
  const fake = createFakePrisma(rows, users)
  const store = new PrismaAdminPlacementStore(fake.prisma, 'https://api.example.com')
  return { ...fake, store }
}

describe('approve', () => {
  it('activates a pending listing with a photo and writes one APPROVED event', async () => {
    const { store, rows, events } = setup()

    const result = await store.approve(ID, ADMIN, SEEN)

    expect(result.ok).toBe(true)
    expect(rows[0]?.status).toBe('ACTIVE')
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      placementId: ID,
      adminId: ADMIN,
      action: 'APPROVED',
      reason: null,
    })
    if (result.ok) {
      expect(result.placement.status).toBe('ACTIVE')
      expect(result.placement.events).toEqual([
        expect.objectContaining({ action: 'APPROVED', adminName: 'aziza' }),
      ])
    }
  })

  it('puts status, updatedAt and a photo in the where of the one conditional update', async () => {
    const { store, calls } = setup()

    await store.approve(ID, ADMIN, SEEN)

    expect(calls.updateMany).toEqual([
      { id: ID, status: 'PENDING_REVIEW', updatedAt: SEEN, photos: { isEmpty: false } },
    ])
  })

  it('refuses a listing without photos, changes nothing and writes no event', async () => {
    const { store, rows, events } = setup([{ id: ID, vendorId: VENDOR, photos: [] }])

    expect(await store.approve(ID, ADMIN, SEEN)).toEqual({ ok: false, reason: 'NO_PHOTOS' })
    expect(rows[0]?.status).toBe('PENDING_REVIEW')
    expect(events).toHaveLength(0)
  })

  it.each(['ACTIVE', 'INACTIVE', 'REJECTED', 'ARCHIVED'] as const)(
    'refuses a %s listing as NOT_PENDING',
    async (status) => {
      const { store, rows, events } = setup([{ id: ID, vendorId: VENDOR, status, photos: [PHOTO] }])

      expect(await store.approve(ID, ADMIN, SEEN)).toEqual({ ok: false, reason: 'NOT_PENDING' })
      expect(rows[0]?.status).toBe(status)
      expect(events).toHaveLength(0)
    },
  )

  it('answers NOT_FOUND for a missing listing', async () => {
    const { store } = setup([])

    expect(await store.approve(ID, ADMIN, SEEN)).toEqual({ ok: false, reason: 'NOT_FOUND' })
  })

  it('two admins deciding the same listing: one winner, one event, one NOT_PENDING', async () => {
    const { store, events } = setup()

    const [first, second] = await Promise.all([
      store.approve(ID, ADMIN, SEEN),
      store.reject(ID, OTHER_ADMIN, SEEN, REASON),
    ])

    expect([first.ok, second.ok].filter(Boolean)).toHaveLength(1)
    expect(events).toHaveLength(1)
    const loser = first.ok ? second : first
    expect(loser).toEqual({ ok: false, reason: 'NOT_PENDING' })
  })

  it('a vendor edit between the admin reading and approving makes it CHANGED', async () => {
    const { store, prisma, rows, events } = setup()
    const vendorStore = new PrismaVendorPlacementStore(prisma)
    const opened = await store.findById(ID)

    await vendorStore.update(VENDOR, ID, { title: 'Edited after the admin opened it' })
    const result = await store.approve(ID, ADMIN, new Date(opened!.updatedAt))

    expect(result).toEqual({ ok: false, reason: 'CHANGED' })
    expect(rows[0]?.status).toBe('PENDING_REVIEW')
    expect(events).toHaveLength(0)
  })

  it('rolls the status change back when the event insert fails', async () => {
    const { store, rows, events, hooks } = setup()
    hooks.beforeEventCreate = () => {
      throw new Error('event insert failed')
    }

    await expect(store.approve(ID, ADMIN, SEEN)).rejects.toThrow('event insert failed')

    expect(rows[0]?.status).toBe('PENDING_REVIEW')
    expect(events).toHaveLength(0)
  })
})

describe('reject', () => {
  it('rejects a pending listing and stores the reason on the event', async () => {
    const { store, rows, events } = setup()

    const result = await store.reject(ID, ADMIN, SEEN, REASON)

    expect(result.ok).toBe(true)
    expect(rows[0]?.status).toBe('REJECTED')
    expect(events[0]).toMatchObject({ action: 'REJECTED', reason: REASON, adminId: ADMIN })
  })

  it('does not need a photo, and does not put one in the where', async () => {
    const { store, rows, calls } = setup([{ id: ID, vendorId: VENDOR, photos: [] }])

    const result = await store.reject(ID, ADMIN, SEEN, REASON)

    expect(result.ok).toBe(true)
    expect(rows[0]?.status).toBe('REJECTED')
    expect(calls.updateMany[0]).toEqual({ id: ID, status: 'PENDING_REVIEW', updatedAt: SEEN })
  })

  it('refuses a stale updatedAt as CHANGED and a decided listing as NOT_PENDING', async () => {
    const { store, events } = setup()

    expect(await store.reject(ID, ADMIN, new Date(SEEN.getTime() - 1000), REASON)).toEqual({
      ok: false,
      reason: 'CHANGED',
    })
    expect((await store.reject(ID, ADMIN, SEEN, REASON)).ok).toBe(true)
    expect(await store.reject(ID, OTHER_ADMIN, SEEN, REASON)).toEqual({
      ok: false,
      reason: 'NOT_PENDING',
    })
    expect(events).toHaveLength(1)
  })

  it('rolls back when the event insert fails', async () => {
    const { store, rows, hooks } = setup()
    hooks.beforeEventCreate = () => {
      throw new Error('boom')
    }

    await expect(store.reject(ID, ADMIN, SEEN, REASON)).rejects.toThrow('boom')

    expect(rows[0]?.status).toBe('PENDING_REVIEW')
  })

  it('shows the reason to the vendor and lets a vendor edit resubmit it', async () => {
    const { store, prisma } = setup()
    const vendorStore = new PrismaVendorPlacementStore(prisma)
    await store.reject(ID, ADMIN, SEEN, REASON)

    expect((await vendorStore.find(VENDOR, ID))?.rejectionReason).toBe(REASON)
    expect(await vendorStore.pause(VENDOR, ID)).toEqual({ kind: 'conflict', status: 'REJECTED' })
    expect(await vendorStore.resume(VENDOR, ID)).toEqual({ kind: 'conflict', status: 'REJECTED' })

    const edited = await vendorStore.update(VENDOR, ID, { title: 'Now with a proper photo' })
    expect(edited.kind === 'ok' && edited.placement.status).toBe('PENDING_REVIEW')
    expect(edited.kind === 'ok' && edited.placement.rejectionReason).toBeNull()
    // The history keeps the rejection even though the vendor no longer sees it.
    expect((await store.findById(ID))?.events).toHaveLength(1)
  })
})

describe('list', () => {
  const at = (second: number) => new Date(Date.UTC(2026, 9, 1, 12, 0, second))
  const rows: Partial<FakeRow>[] = [
    { id: 'c', vendorId: VENDOR, updatedAt: at(3), city: 'Tashkent', photos: [PHOTO] },
    { id: 'a', vendorId: VENDOR, updatedAt: at(1), city: 'Samarkand' },
    { id: 'b', vendorId: VENDOR, updatedAt: at(1), city: 'Tashkent', type: 'LED_SCREEN' },
    { id: 'd', vendorId: VENDOR, updatedAt: at(0), status: 'ACTIVE' },
  ]
  const query = { status: 'PENDING_REVIEW' as const, page: 1, pageSize: 20 }

  it('lists pending listings oldest first, id as the tie-break, and counts the same filter', async () => {
    const { store } = setup(rows)

    const result = await store.list(query)

    expect(result.placements.map((p) => p.id)).toEqual(['a', 'b', 'c'])
    expect(result.total).toBe(3)
  })

  it('filters by status, type and city', async () => {
    const { store } = setup(rows)

    expect((await store.list({ ...query, status: 'ACTIVE' })).placements.map((p) => p.id)).toEqual([
      'd',
    ])
    expect(
      (await store.list({ ...query, type: 'LED_SCREEN' })).placements.map((p) => p.id),
    ).toEqual(['b'])
    expect((await store.list({ ...query, city: 'Tashkent' })).total).toBe(2)
  })

  it('pages, and summarises with cover, photo count and vendor name', async () => {
    const { store } = setup(rows)

    const second = await store.list({ ...query, page: 2, pageSize: 2 })

    expect(second.placements).toHaveLength(1)
    expect(second.total).toBe(3)
    expect(second.placements[0]).toMatchObject({
      id: 'c',
      photoCount: 1,
      cover: `https://api.example.com${PHOTO}`,
      vendorName: 'vendor',
    })
  })
})

describe('findById', () => {
  it('returns the vendor, absolute photo URLs and events newest first, any status', async () => {
    const fake = createFakePrisma(
      [{ id: ID, vendorId: VENDOR, status: 'ARCHIVED', photos: [PHOTO] }],
      users,
      [
        { placementId: ID, adminId: ADMIN, action: 'APPROVED' },
        { placementId: ID, adminId: OTHER_ADMIN, action: 'REJECTED', reason: REASON },
        { placementId: ID, adminId: 'deleted-admin', action: 'APPROVED' },
      ],
    )
    const store = new PrismaAdminPlacementStore(fake.prisma, 'https://api.example.com')

    const found = await store.findById(ID)

    expect(found?.status).toBe('ARCHIVED')
    expect(found?.vendor).toEqual({ id: VENDOR, name: 'vendor', email: 'vendor@example.com' })
    expect(found?.photos).toEqual([`https://api.example.com${PHOTO}`])
    expect(found?.events.map((e) => e.adminName)).toEqual([null, 'rustam', 'aziza'])
    expect(found?.events[1]?.reason).toBe(REASON)
  })

  it('carries the LED fields of an LED_SCREEN listing', async () => {
    const { store } = setup([
      { id: ID, vendorId: VENDOR, type: 'LED_SCREEN', ledDurationSeconds: 10, ledPlaysPerDay: 360 },
    ])

    expect(await store.findById(ID)).toMatchObject({ ledDurationSeconds: 10, ledPlaysPerDay: 360 })
  })

  it('answers null for a missing listing', async () => {
    const { store } = setup([])

    expect(await store.findById(ID)).toBeNull()
  })
})
