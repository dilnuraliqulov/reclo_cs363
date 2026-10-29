import type { PlacementStatus } from '@reclo/shared'
import { describe, expect, it } from 'vitest'
import { createFakePrisma, type FakeRow } from './fake-prisma'
import { PrismaPlacementStore } from './prisma-store'
import { PrismaVendorPlacementStore } from './vendor-prisma-store'

const OWNER = 'vendor-1'
const OTHER = 'vendor-2'
const ID = 'b1e0696a-54c3-4d40-84c4-f2a89326e680'
const NOW = new Date('2026-10-28T09:00:00.000Z')

const STATUSES: PlacementStatus[] = ['ACTIVE', 'PENDING_REVIEW', 'INACTIVE', 'ARCHIVED']

function setup(rows: Partial<FakeRow>[] = [{ id: ID, vendorId: OWNER, status: 'ACTIVE' }]) {
  const fake = createFakePrisma(rows)
  const store = new PrismaVendorPlacementStore(fake.prisma, 'https://api.example.com', () => NOW)
  return { ...fake, store }
}

const body = {
  title: 'Amir Temur Billboard',
  type: 'BILLBOARD' as const,
  latitude: 41.311,
  longitude: 69.279,
  address: 'Amir Temur Ave 10',
  city: 'Tashkent',
  pricePerMonth: 5_000_000,
  lighting: false,
}

describe('create', () => {
  it('always creates PENDING_REVIEW with no photos, owned by the caller', async () => {
    const { store, rows } = setup([])

    const created = await store.create(OWNER, body)

    expect(created.status).toBe('PENDING_REVIEW')
    expect(created.photos).toEqual([])
    expect(created.vendorId).toBe(OWNER)
    expect(created.archivedAt).toBeNull()
    expect(created.tier).toBe('SILVER')
    expect(rows).toHaveLength(1)
  })
})

describe('transitions (each row of the table in docs/listing-design.md)', () => {
  type Action = 'archive' | 'restore' | 'pause' | 'resume'
  const cases: [Action, PlacementStatus, PlacementStatus | 'conflict'][] = [
    ['pause', 'ACTIVE', 'INACTIVE'],
    ['pause', 'PENDING_REVIEW', 'conflict'],
    ['pause', 'INACTIVE', 'conflict'],
    ['pause', 'ARCHIVED', 'conflict'],
    ['resume', 'INACTIVE', 'ACTIVE'],
    ['resume', 'ACTIVE', 'conflict'],
    ['resume', 'PENDING_REVIEW', 'conflict'],
    ['resume', 'ARCHIVED', 'conflict'],
    ['archive', 'ACTIVE', 'ARCHIVED'],
    ['archive', 'PENDING_REVIEW', 'ARCHIVED'],
    ['archive', 'INACTIVE', 'ARCHIVED'],
    ['archive', 'ARCHIVED', 'conflict'],
    ['restore', 'ARCHIVED', 'PENDING_REVIEW'],
    ['restore', 'ACTIVE', 'conflict'],
    ['restore', 'PENDING_REVIEW', 'conflict'],
    ['restore', 'INACTIVE', 'conflict'],
  ]

  it.each(cases)('%s from %s -> %s', async (action, from, expected) => {
    const { store, rows } = setup([{ id: ID, vendorId: OWNER, status: from }])

    const result = await store[action](OWNER, ID)

    if (expected === 'conflict') {
      expect(result).toEqual({ kind: 'conflict', status: from })
      expect(rows[0]?.status).toBe(from)
    } else {
      expect(result.kind).toBe('ok')
      expect(rows[0]?.status).toBe(expected)
    }
  })

  it('covers every action from every status', () => {
    expect(cases).toHaveLength(4 * STATUSES.length)
  })

  it('archive stamps archivedAt and restore clears it', async () => {
    const { store, rows } = setup()

    const archived = await store.archive(OWNER, ID)
    expect(archived.kind === 'ok' && archived.placement.archivedAt).toBe(NOW.toISOString())
    expect(rows[0]?.archivedAt).toEqual(NOW)

    const restored = await store.restore(OWNER, ID)
    expect(restored.kind === 'ok' && restored.placement.status).toBe('PENDING_REVIEW')
    expect(restored.kind === 'ok' && restored.placement.archivedAt).toBeNull()
  })

  it('keeps the row, its photos and its owner when archiving', async () => {
    const { store, rows } = setup([
      { id: ID, vendorId: OWNER, status: 'ACTIVE', photos: ['/uploads/placements/x/a.jpg'] },
    ])

    await store.archive(OWNER, ID)

    expect(rows).toHaveLength(1)
    expect(rows[0]?.photos).toEqual(['/uploads/placements/x/a.jpg'])
  })

  it.each(['archive', 'restore', 'pause', 'resume'] as const)(
    '%s answers not_found for another vendor and changes nothing',
    async (action) => {
      const { store, rows } = setup([{ id: ID, vendorId: OWNER, status: 'ARCHIVED' }])
      rows.push({ ...rows[0]!, id: 'other', vendorId: OWNER, status: 'ACTIVE' })

      expect(await store[action](OTHER, ID)).toEqual({ kind: 'not_found' })
      expect(await store[action](OTHER, 'other')).toEqual({ kind: 'not_found' })
      expect(rows.map((r) => r.status)).toEqual(['ARCHIVED', 'ACTIVE'])
    },
  )

  it('puts the owner in the where of every conditional update', async () => {
    const { store, calls } = setup()

    await store.archive(OWNER, ID)
    await store.restore(OWNER, ID)
    await store.pause(OWNER, ID)
    await store.resume(OWNER, ID)

    expect(calls.updateMany).toHaveLength(4)
    for (const where of calls.updateMany) {
      expect(where).toMatchObject({ id: ID, vendorId: OWNER })
    }
  })
})

describe('update', () => {
  it.each([
    ['ACTIVE', 'PENDING_REVIEW'],
    ['INACTIVE', 'PENDING_REVIEW'],
    ['PENDING_REVIEW', 'PENDING_REVIEW'],
  ] as const)('an edit of %s leaves it %s', async (from, to) => {
    const { store } = setup([{ id: ID, vendorId: OWNER, status: from }])

    const result = await store.update(OWNER, ID, { title: 'A new title' })

    expect(result.kind === 'ok' && result.placement.status).toBe(to)
    expect(result.kind === 'ok' && result.placement.title).toBe('A new title')
  })

  it('refuses to edit an archived listing and leaves it untouched', async () => {
    const { store, rows } = setup([{ id: ID, vendorId: OWNER, status: 'ARCHIVED', title: 'Old' }])

    expect(await store.update(OWNER, ID, { title: 'New title' })).toEqual({
      kind: 'conflict',
      status: 'ARCHIVED',
    })
    expect(rows[0]?.title).toBe('Old')
  })

  it('does not let another vendor edit it', async () => {
    const { store, rows } = setup([{ id: ID, vendorId: OWNER, title: 'Mine' }])

    expect(await store.update(OTHER, ID, { title: 'Stolen' })).toEqual({ kind: 'not_found' })
    expect(rows[0]?.title).toBe('Mine')
  })
})

describe('LED fields', () => {
  const led = { ledDurationSeconds: 10, ledPlaysPerDay: 360 }

  it('stores them on create and serialises them', async () => {
    const { store, rows } = setup([])

    const created = await store.create(OWNER, { ...body, type: 'LED_SCREEN', ...led })

    expect(created).toMatchObject(led)
    expect(rows[0]).toMatchObject(led)
  })

  it('serialises null for a listing without them', async () => {
    const { store } = setup()

    const found = await store.find(OWNER, ID)

    expect(found).toMatchObject({ ledDurationSeconds: null, ledPlaysPerDay: null })
  })

  it.each(['ACTIVE', 'INACTIVE'] as const)(
    'editing them on an LED_SCREEN that is %s sends it back to review',
    async (from) => {
      const { store } = setup([{ id: ID, vendorId: OWNER, status: from, type: 'LED_SCREEN' }])

      const result = await store.update(OWNER, ID, { ledPlaysPerDay: 720 })

      expect(result.kind === 'ok' && result.placement.status).toBe('PENDING_REVIEW')
      expect(result.kind === 'ok' && result.placement.ledPlaysPerDay).toBe(720)
    },
  )

  it('changing the type away from LED_SCREEN clears them in the same update', async () => {
    const { store, rows } = setup([
      { id: ID, vendorId: OWNER, status: 'ACTIVE', type: 'LED_SCREEN', ...led },
    ])

    const result = await store.update(OWNER, ID, { type: 'BILLBOARD' })

    expect(result.kind === 'ok' && result.placement).toMatchObject({
      type: 'BILLBOARD',
      ledDurationSeconds: null,
      ledPlaysPerDay: null,
    })
    expect(rows[0]).toMatchObject({ ledDurationSeconds: null, ledPlaysPerDay: null })
  })

  it('keeps them when the type stays LED_SCREEN', async () => {
    const { store } = setup([{ id: ID, vendorId: OWNER, type: 'LED_SCREEN', ...led }])

    const result = await store.update(OWNER, ID, { type: 'LED_SCREEN', title: 'Renamed screen' })

    expect(result.kind === 'ok' && result.placement).toMatchObject(led)
  })

  it('refuses LED values for a stored BILLBOARD and changes nothing', async () => {
    const { store, rows } = setup([
      { id: ID, vendorId: OWNER, status: 'ACTIVE', type: 'BILLBOARD' },
    ])

    expect(await store.update(OWNER, ID, led)).toEqual({ kind: 'led_not_allowed' })
    expect(rows[0]).toMatchObject({
      status: 'ACTIVE',
      ledDurationSeconds: null,
      ledPlaysPerDay: null,
    })
  })

  it('accepts LED values together with a switch to LED_SCREEN', async () => {
    const { store } = setup([{ id: ID, vendorId: OWNER, type: 'BILLBOARD' }])

    const result = await store.update(OWNER, ID, { type: 'LED_SCREEN', ...led })

    expect(result.kind === 'ok' && result.placement).toMatchObject({ type: 'LED_SCREEN', ...led })
  })

  it('still reports an archived BILLBOARD as a conflict, not an LED error', async () => {
    const { store } = setup([{ id: ID, vendorId: OWNER, status: 'ARCHIVED', type: 'BILLBOARD' }])

    expect(await store.update(OWNER, ID, led)).toEqual({ kind: 'conflict', status: 'ARCHIVED' })
  })
})

describe('list and find', () => {
  const rows: Partial<FakeRow>[] = [
    { id: 'a', vendorId: OWNER, status: 'ACTIVE' },
    { id: 'b', vendorId: OWNER, status: 'ARCHIVED' },
    { id: 'c', vendorId: OWNER, status: 'PENDING_REVIEW' },
    { id: 'd', vendorId: OTHER, status: 'ACTIVE' },
  ]

  it("lists only the vendor's own, hiding ARCHIVED unless asked, newest first", async () => {
    const { store } = setup(rows)

    const result = await store.list(OWNER, { page: 1, pageSize: 20 })

    expect(result.placements.map((p) => p.id)).toEqual(['c', 'a'])
    expect(result.total).toBe(2)
  })

  it('filters by status, including ARCHIVED', async () => {
    const { store } = setup(rows)

    const archived = await store.list(OWNER, { status: 'ARCHIVED', page: 1, pageSize: 20 })

    expect(archived.placements.map((p) => p.id)).toEqual(['b'])
  })

  it('pages, with total counted on the same filter', async () => {
    const { store } = setup(rows)

    const second = await store.list(OWNER, { page: 2, pageSize: 1 })

    expect(second.placements.map((p) => p.id)).toEqual(['a'])
    expect(second.total).toBe(2)
  })

  it('finds an archived listing for its owner, and nothing for anyone else', async () => {
    const { store } = setup(rows)

    expect((await store.find(OWNER, 'b'))?.status).toBe('ARCHIVED')
    expect(await store.find(OTHER, 'b')).toBeNull()
  })
})

describe('photos', () => {
  const path = (n: number) => `/uploads/placements/${ID}/${n}.jpg`

  it('appends a photo, serialises it as an absolute URL, and sends the listing back to review', async () => {
    const { store, rows } = setup([{ id: ID, vendorId: OWNER, status: 'ACTIVE', photos: [] }])

    const result = await store.addPhoto(OWNER, ID, path(1))

    expect(rows[0]?.photos).toEqual([path(1)])
    expect(result.kind === 'ok' && result.placement.photos).toEqual([
      `https://api.example.com${path(1)}`,
    ])
    expect(result.kind === 'ok' && result.placement.photo).toBe(`https://api.example.com${path(1)}`)
    expect(result.kind === 'ok' && result.placement.status).toBe('PENDING_REVIEW')
  })

  it('accepts the 8th photo and refuses the 9th', async () => {
    const seven = Array.from({ length: 7 }, (_, i) => path(i))
    const { store, rows } = setup([{ id: ID, vendorId: OWNER, photos: seven }])

    expect((await store.addPhoto(OWNER, ID, path(7))).kind).toBe('ok')
    expect(await store.addPhoto(OWNER, ID, path(8))).toEqual({ kind: 'photo_limit' })
    expect(rows[0]?.photos).toHaveLength(8)
  })

  it('refuses photo changes on an archived listing', async () => {
    const { store } = setup([{ id: ID, vendorId: OWNER, status: 'ARCHIVED', photos: [path(1)] }])

    expect(await store.addPhoto(OWNER, ID, path(2))).toEqual({
      kind: 'conflict',
      status: 'ARCHIVED',
    })
    expect(await store.removePhoto(OWNER, ID, path(1))).toEqual({
      kind: 'conflict',
      status: 'ARCHIVED',
    })
  })

  it("does not touch another vendor's photos", async () => {
    const { store, rows } = setup([{ id: ID, vendorId: OWNER, photos: [path(1)] }])

    expect(await store.addPhoto(OTHER, ID, path(2))).toEqual({ kind: 'not_found' })
    expect(await store.removePhoto(OTHER, ID, path(1))).toEqual({ kind: 'not_found' })
    expect(rows[0]?.photos).toEqual([path(1)])
  })

  it('removes one photo, keeps the order of the rest, and reports an unknown one', async () => {
    const { store, rows } = setup([
      { id: ID, vendorId: OWNER, status: 'ACTIVE', photos: [path(1), path(2), path(3)] },
    ])

    const result = await store.removePhoto(OWNER, ID, path(2))

    expect(rows[0]?.photos).toEqual([path(1), path(3)])
    expect(result.kind === 'ok' && result.placement.status).toBe('PENDING_REVIEW')
    expect(await store.removePhoto(OWNER, ID, path(9))).toEqual({ kind: 'photo_missing' })
  })

  it('retries when another upload changed the list in between, so the cap holds', async () => {
    const seven = Array.from({ length: 7 }, (_, i) => path(i))
    const { store, rows, hooks } = setup([{ id: ID, vendorId: OWNER, photos: seven }])
    let interfered = false
    hooks.beforeUpdateMany = () => {
      if (interfered) return
      interfered = true
      rows[0]?.photos.push(path(99)) // the other request takes the 8th slot first
    }

    expect(await store.addPhoto(OWNER, ID, path(7))).toEqual({ kind: 'photo_limit' })
    expect(rows[0]?.photos).toHaveLength(8)
  })

  it('gives up with a conflict if the list keeps changing', async () => {
    const { store, rows, hooks } = setup([{ id: ID, vendorId: OWNER, photos: [] }])
    let n = 0
    hooks.beforeUpdateMany = () => {
      rows[0]?.photos.push(path(100 + n++))
    }

    const result = await store.addPhoto(OWNER, ID, path(1))

    expect(result.kind).toBe('conflict')
    expect(n).toBe(3)
  })
})

describe('the public store after this change', () => {
  const rows: Partial<FakeRow>[] = [
    { id: 'live', status: 'ACTIVE', photos: ['/uploads/placements/live/a.jpg'] },
    { id: 'old', status: 'ARCHIVED' },
    { id: 'wait', status: 'PENDING_REVIEW' },
    { id: 'paused', status: 'INACTIVE' },
  ]
  const bounds = { minLat: 37, maxLat: 45, minLng: 56, maxLng: 73 }

  it('keeps archived (and other non-ACTIVE) listings off the public map', async () => {
    const { prisma } = createFakePrisma(rows)

    const markers = await new PrismaPlacementStore(prisma).findMapMarkers(bounds)

    expect(markers.map((m) => m.id)).toEqual(['live'])
  })

  it('answers null for an archived listing, the same as one that does not exist', async () => {
    const { prisma } = createFakePrisma(rows)
    const store = new PrismaPlacementStore(prisma)

    expect(await store.findPlacementDetail('old')).toBeNull()
    expect(await store.findPlacementDetail('missing')).toBeNull()
    expect((await store.findPlacementDetail('live'))?.id).toBe('live')
  })

  it('turns stored photo paths into absolute URLs, and leaves absolute ones alone', async () => {
    const { prisma } = createFakePrisma([
      {
        id: 'live',
        status: 'ACTIVE',
        photos: ['/uploads/placements/live/a.jpg', 'https://cdn/x.jpg'],
      },
    ])
    const store = new PrismaPlacementStore(prisma, 'https://api.example.com/')

    const detail = await store.findPlacementDetail('live')
    const [marker] = await store.findMapMarkers(bounds)

    expect(detail?.photos).toEqual([
      'https://api.example.com/uploads/placements/live/a.jpg',
      'https://cdn/x.jpg',
    ])
    expect(detail?.photo).toBe('https://api.example.com/uploads/placements/live/a.jpg')
    expect(marker?.photo).toBe('https://api.example.com/uploads/placements/live/a.jpg')
  })
})
