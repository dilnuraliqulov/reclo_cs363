import type { MapBoundsQuery } from '@reclo/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PrismaClient } from '../generated/prisma/client'
import { PrismaPlacementStore } from './prisma-store'

const bounds: MapBoundsQuery = {
  minLat: 41.0,
  maxLat: 41.6,
  minLng: 69.0,
  maxLng: 69.6,
}

const row = {
  id: 'b1e0696a-54c3-4d40-84c4-f2a89326e680',
  title: 'Amir Temur Billboard',
  type: 'BILLBOARD' as const,
  status: 'ACTIVE' as const,
  latitude: 41.311,
  longitude: 69.279,
  address: 'Amir Temur Ave 10',
  city: 'Tashkent',
  pricePerMonth: 5_000_000,
  photos: ['https://example.com/one.jpg', 'https://example.com/two.jpg'],
}

const findMany = vi.fn()

function createStore() {
  const prisma = { placement: { findMany } } as unknown as PrismaClient
  return new PrismaPlacementStore(prisma)
}

function lastWhere() {
  return findMany.mock.lastCall?.[0]?.where
}

describe('PrismaPlacementStore.findMapMarkers', () => {
  beforeEach(() => {
    findMany.mockReset()
    findMany.mockResolvedValue([row])
  })

  it('only returns ACTIVE placements to the public map', async () => {
    await createStore().findMapMarkers(bounds)

    // Pending, inactive and archived placements must never reach clients.
    expect(lastWhere().status).toBe('ACTIVE')
  })

  it('constrains the query to the viewport bounding box', async () => {
    await createStore().findMapMarkers(bounds)

    expect(lastWhere().latitude).toEqual({ gte: 41.0, lte: 41.6 })
    expect(lastWhere().longitude).toEqual({ gte: 69.0, lte: 69.6 })
  })

  it('omits optional filters that were not requested', async () => {
    await createStore().findMapMarkers(bounds)

    const where = lastWhere()
    expect(where.type).toBeUndefined()
    expect(where.city).toBeUndefined()
    expect(where.pricePerMonth).toBeUndefined()
  })

  it('filters by placement type when requested', async () => {
    await createStore().findMapMarkers({ ...bounds, type: 'LED_SCREEN' })

    expect(lastWhere().type).toBe('LED_SCREEN')
  })

  it('matches city case-insensitively', async () => {
    await createStore().findMapMarkers({ ...bounds, city: 'tashkent' })

    expect(lastWhere().city).toEqual({ equals: 'tashkent', mode: 'insensitive' })
  })

  it('applies both ends of the price range', async () => {
    await createStore().findMapMarkers({ ...bounds, minPrice: 1_000_000, maxPrice: 9_000_000 })

    expect(lastWhere().pricePerMonth).toEqual({ gte: 1_000_000, lte: 9_000_000 })
  })

  it('applies a lower price bound alone', async () => {
    await createStore().findMapMarkers({ ...bounds, minPrice: 1_000_000 })

    expect(lastWhere().pricePerMonth).toEqual({ gte: 1_000_000 })
  })

  it('applies an upper price bound alone', async () => {
    await createStore().findMapMarkers({ ...bounds, maxPrice: 9_000_000 })

    expect(lastWhere().pricePerMonth).toEqual({ lte: 9_000_000 })
  })

  it('honours a zero lower bound rather than treating it as absent', async () => {
    await createStore().findMapMarkers({ ...bounds, minPrice: 0 })

    expect(lastWhere().pricePerMonth).toEqual({ gte: 0 })
  })

  it('selects only the lightweight marker fields', async () => {
    await createStore().findMapMarkers(bounds)

    // The map payload stays small; full details come from /placements/:id.
    const select = findMany.mock.lastCall?.[0]?.select
    expect(Object.keys(select).sort()).toEqual(
      [
        'address',
        'city',
        'id',
        'latitude',
        'longitude',
        'photos',
        'pricePerMonth',
        'status',
        'title',
        'type',
      ].sort(),
    )
    expect(select.description).toBeUndefined()
    expect(select.vendorId).toBeUndefined()
  })

  it('returns the newest placements first', async () => {
    await createStore().findMapMarkers(bounds)

    expect(findMany.mock.lastCall?.[0]?.orderBy).toEqual({ createdAt: 'desc' })
  })

  it('exposes only the first photo as the marker thumbnail', async () => {
    const markers = await createStore().findMapMarkers(bounds)

    expect(markers[0]?.photo).toBe('https://example.com/one.jpg')
  })

  it('omits the photo field when a placement has no photos', async () => {
    findMany.mockResolvedValue([{ ...row, photos: [] }])

    const markers = await createStore().findMapMarkers(bounds)

    // Absent rather than null, so the shared schema's optional photo passes.
    expect(markers[0]).not.toHaveProperty('photo')
  })

  it('maps every row through to a marker', async () => {
    findMany.mockResolvedValue([row, { ...row, id: 'c2f1707b-65d4-4e51-95d5-03b9a437f791' }])

    const markers = await createStore().findMapMarkers(bounds)

    expect(markers).toHaveLength(2)
    expect(markers[0]).toMatchObject({
      id: row.id,
      title: 'Amir Temur Billboard',
      type: 'BILLBOARD',
      status: 'ACTIVE',
      latitude: 41.311,
      longitude: 69.279,
      address: 'Amir Temur Ave 10',
      city: 'Tashkent',
      pricePerMonth: 5_000_000,
    })
  })

  it('returns an empty list when nothing is in the viewport', async () => {
    findMany.mockResolvedValue([])

    expect(await createStore().findMapMarkers(bounds)).toEqual([])
  })
})
