import type { MapBoundsQuery } from '@reclo/shared'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchInquiryHistory, fetchPlacementDetail, fetchPlacementMarkers } from './api'

const bounds: MapBoundsQuery = {
  minLat: 41.0,
  maxLat: 41.6,
  minLng: 69.0,
  maxLng: 69.6,
}

const validMarker = {
  id: 'b1e0696a-54c3-4d40-84c4-f2a89326e680',
  title: 'Amir Temur Billboard',
  type: 'BILLBOARD',
  status: 'ACTIVE',
  latitude: 41.311,
  longitude: 69.279,
  address: 'Amir Temur Ave 10',
  city: 'Tashkent',
  pricePerMonth: 5_000_000,
  photo: 'https://example.com/photo.jpg',
}

const validDetail = {
  ...validMarker,
  tier: 'SILVER',
  description: 'High traffic road-facing placement',
  width: 6,
  height: 3,
  lighting: true,
  photos: ['https://example.com/photo.jpg', 'https://example.com/photo-2.jpg'],
  ledDurationSeconds: null,
  ledPlaysPerDay: null,
  vendorId: 'vendor-123',
  createdAt: '2026-10-10T10:00:00.000Z',
  updatedAt: '2026-10-12T15:00:00.000Z',
}

const fetchMock = vi.fn()

function respondWith(body: unknown, init?: { ok?: boolean; status?: number }) {
  fetchMock.mockResolvedValue({
    ok: init?.ok ?? true,
    status: init?.status ?? 200,
    json: async () => body,
  })
}

function requestedUrl(): URL {
  return new URL(fetchMock.mock.calls[0]?.[0] as string)
}

describe('fetchPlacementMarkers', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockReset()
  })

  describe('fetchPlacementDetail', () => {
    const placementId = validMarker.id

    beforeEach(() => {
      vi.stubGlobal('fetch', fetchMock)
      fetchMock.mockReset()
    })

    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it('requests the placement detail endpoint', async () => {
      respondWith(validDetail)

      const detail = await fetchPlacementDetail(placementId)

      const url = requestedUrl()
      expect(url.pathname).toBe(`/api/placements/${placementId}`)
      expect(detail.tier).toBe('SILVER')
      expect(detail.photos).toHaveLength(2)
    })

    it('surfaces the API error message when the response is not ok', async () => {
      respondWith({ error: 'Placement not found' }, { ok: false, status: 404 })

      await expect(fetchPlacementDetail(placementId)).rejects.toThrow('Placement not found')
    })

    it('falls back to the status code when the error body has no message', async () => {
      respondWith({}, { ok: false, status: 500 })

      await expect(fetchPlacementDetail(placementId)).rejects.toThrow(
        /Failed to fetch placement detail \(500\)/,
      )
    })

    it('rejects a response whose payload does not match the shared schema', async () => {
      respondWith({ ...validDetail, tier: 'DIAMOND' })

      await expect(fetchPlacementDetail(placementId)).rejects.toThrow()
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('requests the map endpoint with the viewport bounds', async () => {
    respondWith({ markers: [validMarker], total: 1 })

    const result = await fetchPlacementMarkers(bounds)

    const url = requestedUrl()
    expect(url.pathname).toBe('/api/placements/map')
    expect(url.searchParams.get('minLat')).toBe('41')
    expect(url.searchParams.get('maxLat')).toBe('41.6')
    expect(url.searchParams.get('minLng')).toBe('69')
    expect(url.searchParams.get('maxLng')).toBe('69.6')
    expect(result.total).toBe(1)
    expect(result.markers[0]?.title).toBe('Amir Temur Billboard')
  })

  it('omits optional filters that are not set', async () => {
    respondWith({ markers: [], total: 0 })

    await fetchPlacementMarkers(bounds)

    const url = requestedUrl()
    expect(url.searchParams.has('type')).toBe(false)
    expect(url.searchParams.has('city')).toBe(false)
    expect(url.searchParams.has('minPrice')).toBe(false)
    expect(url.searchParams.has('maxPrice')).toBe(false)
  })

  it('forwards every optional filter when set', async () => {
    respondWith({ markers: [], total: 0 })

    await fetchPlacementMarkers({
      ...bounds,
      type: 'LED_SCREEN',
      city: 'Tashkent',
      minPrice: 1_000_000,
      maxPrice: 9_000_000,
      ledDurationSeconds: 15,
      ledPlaysPerDay: 120,
    })

    const url = requestedUrl()
    expect(url.searchParams.get('type')).toBe('LED_SCREEN')
    expect(url.searchParams.get('city')).toBe('Tashkent')
    expect(url.searchParams.get('minPrice')).toBe('1000000')
    expect(url.searchParams.get('maxPrice')).toBe('9000000')
    expect(url.searchParams.get('ledDurationSeconds')).toBe('15')
    expect(url.searchParams.get('ledPlaysPerDay')).toBe('120')
  })

  it('sends a zero minPrice rather than dropping it', async () => {
    respondWith({ markers: [], total: 0 })

    await fetchPlacementMarkers({ ...bounds, minPrice: 0 })

    expect(requestedUrl().searchParams.get('minPrice')).toBe('0')
  })

  it('surfaces the API error message when the response is not ok', async () => {
    respondWith({ error: 'Invalid query parameters' }, { ok: false, status: 400 })

    await expect(fetchPlacementMarkers(bounds)).rejects.toThrow('Invalid query parameters')
  })

  it('falls back to the status code when the error body has no message', async () => {
    respondWith({}, { ok: false, status: 500 })

    await expect(fetchPlacementMarkers(bounds)).rejects.toThrow(
      /Failed to fetch map placements \(500\)/,
    )
  })

  it('falls back to the status code when the error body is not JSON', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => {
        throw new Error('not json')
      },
    })

    await expect(fetchPlacementMarkers(bounds)).rejects.toThrow(
      /Failed to fetch map placements \(502\)/,
    )
  })

  it('rejects a response whose markers do not match the shared schema', async () => {
    respondWith({ markers: [{ ...validMarker, latitude: 'not-a-number' }], total: 1 })

    // Validating here keeps malformed coordinates from reaching Leaflet.
    await expect(fetchPlacementMarkers(bounds)).rejects.toThrow()
  })

  it('rejects a response missing the total count', async () => {
    respondWith({ markers: [] })

    await expect(fetchPlacementMarkers(bounds)).rejects.toThrow()
  })

  it('accepts a marker without a photo', async () => {
    const { photo, ...markerWithoutPhoto } = validMarker
    expect(photo).toBeTruthy()
    respondWith({ markers: [markerWithoutPhoto], total: 1 })

    const result = await fetchPlacementMarkers(bounds)

    expect(result.markers[0]?.photo).toBeUndefined()
  })
})

describe('fetchInquiryHistory', () => {
  const validItem = {
    id: '8f1e2bb6-6ad8-4a2e-9f6e-1c2f6f2a31a0',
    placementId: 'b1e0696a-54c3-4d40-84c4-f2a89326e680',
    status: 'NEW',
    message: 'We would like to run a two month campaign here.',
    contactName: 'Aziza Karimova',
    contactPhone: '+998901234567',
    contactEmail: 'aziza@example.com',
    desiredStartDate: '2026-11-01',
    durationMonths: 2,
    createdAt: '2026-10-26T10:00:00.000Z',
    placement: {
      id: 'b1e0696a-54c3-4d40-84c4-f2a89326e680',
      title: 'Amir Temur Billboard',
      city: 'Tashkent',
      type: 'BILLBOARD',
      isViewable: true,
    },
  }

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('requests the inquiries endpoint with no query string by default', async () => {
    respondWith({ inquiries: [validItem], nextCursor: null })

    const result = await fetchInquiryHistory()

    expect(requestedUrl().pathname).toBe('/api/inquiries')
    expect(requestedUrl().search).toBe('')
    expect(result.inquiries).toHaveLength(1)
  })

  it('sends the session cookie, which is the only thing identifying the client', async () => {
    respondWith({ inquiries: [], nextCursor: null })

    await fetchInquiryHistory()

    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'GET', credentials: 'include' })
  })

  it('forwards the status filter', async () => {
    respondWith({ inquiries: [], nextCursor: null })

    await fetchInquiryHistory({ status: 'RESPONDED' })

    expect(requestedUrl().searchParams.get('status')).toBe('RESPONDED')
  })

  it('forwards the cursor and the limit', async () => {
    respondWith({ inquiries: [], nextCursor: null })

    await fetchInquiryHistory({ cursor: 'b3Vy', limit: 5 })

    expect(requestedUrl().searchParams.get('cursor')).toBe('b3Vy')
    expect(requestedUrl().searchParams.get('limit')).toBe('5')
  })

  it('omits status and cursor when they are unset, so All starts from the newest row', async () => {
    respondWith({ inquiries: [], nextCursor: null })

    await fetchInquiryHistory({ status: undefined, cursor: undefined })

    expect(requestedUrl().searchParams.has('status')).toBe(false)
    expect(requestedUrl().searchParams.has('cursor')).toBe(false)
  })

  it('keeps the next cursor, which is what drives the next page', async () => {
    respondWith({ inquiries: [validItem], nextCursor: 'MjAyNg' })

    const result = await fetchInquiryHistory()

    expect(result.nextCursor).toBe('MjAyNg')
  })

  it('accepts a row whose placement was hard-deleted', async () => {
    respondWith({ inquiries: [{ ...validItem, placement: null }], nextCursor: null })

    const result = await fetchInquiryHistory()

    expect(result.inquiries[0]?.placement).toBeNull()
  })

  it('rejects a response whose rows do not match the shared schema', async () => {
    // The page renders nothing at all on a parse failure, so this guard is worth pinning down.
    respondWith({ inquiries: [{ ...validItem, id: 'not-a-uuid' }], nextCursor: null })

    await expect(fetchInquiryHistory()).rejects.toThrow()
  })

  it('rejects a response missing the cursor field', async () => {
    respondWith({ inquiries: [] })

    await expect(fetchInquiryHistory()).rejects.toThrow()
  })

  it('surfaces the API error message when the response is not ok', async () => {
    respondWith({ error: 'Invalid input' }, { ok: false, status: 400 })

    await expect(fetchInquiryHistory({ cursor: 'bad' })).rejects.toThrow('Invalid input')
  })
})
