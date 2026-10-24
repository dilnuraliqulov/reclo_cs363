import type { MapBoundsQuery } from '@reclo/shared'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchPlacementMarkers } from './api'

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
    })

    const url = requestedUrl()
    expect(url.searchParams.get('type')).toBe('LED_SCREEN')
    expect(url.searchParams.get('city')).toBe('Tashkent')
    expect(url.searchParams.get('minPrice')).toBe('1000000')
    expect(url.searchParams.get('maxPrice')).toBe('9000000')
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
