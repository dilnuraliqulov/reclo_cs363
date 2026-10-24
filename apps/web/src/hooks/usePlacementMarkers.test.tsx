import type { ReactNode } from 'react'
import type { MapBoundsQuery } from '@reclo/shared'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usePlacementMarkers } from './usePlacementMarkers'

vi.mock('@/lib/api', () => ({
  fetchPlacementMarkers: vi.fn(),
  fetchHealth: vi.fn(),
}))

const { fetchPlacementMarkers } = await import('@/lib/api')
const fetchMarkersMock = vi.mocked(fetchPlacementMarkers)

const bounds: MapBoundsQuery = {
  minLat: 41.0,
  maxLat: 41.6,
  minLng: 69.0,
  maxLng: 69.6,
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

describe('usePlacementMarkers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fetchMarkersMock.mockResolvedValue({ markers: [], total: 0 })
  })

  it('stays idle until bounds are known', () => {
    const { result } = renderHook(() => usePlacementMarkers(null), { wrapper: createWrapper() })

    expect(fetchMarkersMock).not.toHaveBeenCalled()
    expect(result.current.isLoading).toBe(false)
  })

  it('does not fetch while explicitly disabled', () => {
    renderHook(() => usePlacementMarkers(bounds, { enabled: false }), {
      wrapper: createWrapper(),
    })

    expect(fetchMarkersMock).not.toHaveBeenCalled()
  })

  it('fetches markers once bounds are available', async () => {
    fetchMarkersMock.mockResolvedValue({ markers: [], total: 7 })

    const { result } = renderHook(() => usePlacementMarkers(bounds), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(fetchMarkersMock).toHaveBeenCalledWith(bounds)
    expect(result.current.data?.total).toBe(7)
  })

  it('reuses the cached result for an equivalent query object', async () => {
    const wrapper = createWrapper()
    const { result, rerender } = renderHook(({ query }) => usePlacementMarkers(query), {
      wrapper,
      initialProps: { query: bounds },
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    // A fresh object with identical values must hash to the same query key,
    // so panning back to the same viewport does not refetch.
    rerender({ query: { ...bounds } })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(fetchMarkersMock).toHaveBeenCalledTimes(1)
  })

  it('refetches when a filter changes', async () => {
    const wrapper = createWrapper()
    const { result, rerender } = renderHook(({ query }) => usePlacementMarkers(query), {
      wrapper,
      initialProps: { query: bounds as MapBoundsQuery },
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    rerender({ query: { ...bounds, type: 'LED_SCREEN' } as MapBoundsQuery })

    await waitFor(() => expect(fetchMarkersMock).toHaveBeenCalledTimes(2))
    expect(fetchMarkersMock).toHaveBeenLastCalledWith({ ...bounds, type: 'LED_SCREEN' })
  })

  it('exposes the failure so the UI can offer a retry', async () => {
    fetchMarkersMock.mockRejectedValue(new Error('Network down'))

    const { result } = renderHook(() => usePlacementMarkers(bounds), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error?.message).toBe('Network down')
  })
})
