import type { MapMarkersResponse, PlacementMarker } from '@reclo/shared'
import L from 'leaflet'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { AuthContext } from '@/auth/useAuth'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CartProvider } from '@/components/cart/CartProvider'
import { PlacementsDiscoveryPage } from './PlacementsDiscoveryPage'

vi.mock('@/lib/api', () => ({
  fetchPlacementMarkers: vi.fn(),
  fetchPlacementDetail: vi.fn(),
  fetchHealth: vi.fn(),
}))

const { fetchPlacementMarkers, fetchPlacementDetail } = await import('@/lib/api')
const fetchMarkersMock = vi.mocked(fetchPlacementMarkers)
const fetchPlacementDetailMock = vi.mocked(fetchPlacementDetail)

const billboard: PlacementMarker = {
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

const ledScreen: PlacementMarker = {
  id: 'c2f1707b-65d4-4e51-95d5-03b9a437f791',
  title: 'Chilonzor LED Screen',
  type: 'LED_SCREEN',
  status: 'ACTIVE',
  latitude: 41.275,
  longitude: 69.204,
  address: 'Chilonzor St 5',
  city: 'Tashkent',
  pricePerMonth: 12_000_000,
}

function mockMarkers(markers: PlacementMarker[]) {
  const response: MapMarkersResponse = { markers, total: markers.length }
  fetchMarkersMock.mockResolvedValue(response)
}

function renderWithProviders() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AuthContext.Provider
          value={{ user: null, isLoading: false, setUser: () => {}, signOut: async () => {} }}
        >
          <PlacementsDiscoveryPage />
        </AuthContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
    { wrapper: CartProvider },
  )
}

describe('PlacementsDiscoveryPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockMarkers([billboard, ledScreen])
    fetchPlacementDetailMock.mockResolvedValue({
      ...billboard,
      tier: 'SILVER',
      description: null,
      width: null,
      height: null,
      lighting: false,
      photos: billboard.photo ? [billboard.photo] : [],
      ledDurationSeconds: null,
      ledPlaysPerDay: null,
      vendorId: 'vendor-123',
      createdAt: '2026-10-10T10:00:00.000Z',
      updatedAt: '2026-10-12T15:00:00.000Z',
    })
  })

  it('renders the Reclo header and map container', () => {
    renderWithProviders()

    expect(screen.getByText('Reclo')).toBeInTheDocument()
    expect(screen.getByTestId('placement-map-container')).toBeInTheDocument()
  })

  it('renders filter controls', () => {
    renderWithProviders()

    expect(screen.getByText('Placement Type')).toBeInTheDocument()
    expect(screen.getByText('All Types')).toBeInTheDocument()
    expect(screen.getByText('Billboard')).toBeInTheDocument()
    expect(screen.getByText('LED Screen')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('City (e.g. Tashkent)')).toBeInTheDocument()
  })

  it('renders the Check API button', () => {
    renderWithProviders()

    expect(screen.getByRole('button', { name: /Check API/i })).toBeInTheDocument()
  })

  it('queries markers for the current map bounds', async () => {
    renderWithProviders()

    await waitFor(() => expect(fetchMarkersMock).toHaveBeenCalled())
    expect(fetchMarkersMock.mock.calls[0]?.[0]).toMatchObject({
      minLat: 41.0,
      maxLat: 41.6,
      minLng: 69.0,
      maxLng: 69.6,
    })
  })

  it('does not refetch in a loop once the viewport has settled', async () => {
    renderWithProviders()

    // Regression guard: the map used to be rebuilt whenever markers changed,
    // which re-emitted bounds and refetched forever.
    await screen.findByTestId(`placement-card-${billboard.id}`)
    await waitFor(() => expect(fetchMarkersMock).toHaveBeenCalledTimes(1))
    expect(fetchMarkersMock).toHaveBeenCalledTimes(1)
  })

  it('lists a card per marker returned for the viewport', async () => {
    renderWithProviders()

    expect(await screen.findByTestId(`placement-card-${billboard.id}`)).toBeInTheDocument()
    expect(screen.getByTestId(`placement-card-${ledScreen.id}`)).toBeInTheDocument()
    expect(screen.getByText('Amir Temur Billboard')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('adds the viewport pins to the clustering layer', async () => {
    renderWithProviders()

    await screen.findByTestId(`placement-card-${billboard.id}`)

    const clusterGroup = vi.mocked(L.markerClusterGroup).mock.results[0]?.value as unknown as {
      addLayers: ReturnType<typeof vi.fn>
    }
    // Called once for the initial empty list, then again once markers arrive.
    expect(clusterGroup.addLayers).toHaveBeenCalled()
    expect(clusterGroup.addLayers.mock.lastCall?.[0]).toHaveLength(2)
  })

  it('shows the empty state when no placements match the viewport', async () => {
    mockMarkers([])
    renderWithProviders()

    expect(await screen.findByTestId('placement-empty-state')).toBeInTheDocument()
    expect(screen.getByText('No placements in this area')).toBeInTheDocument()
  })

  it('opens the detail dialog from a card', async () => {
    const user = userEvent.setup()
    renderWithProviders()

    const card = await screen.findByTestId(`placement-card-${billboard.id}`)
    await user.click(within(card).getByRole('button', { name: /Details/i }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Amir Temur Billboard')).toBeInTheDocument()
    expect(within(dialog).getByText('Monthly rate')).toBeInTheDocument()
  })

  it('adds the selected type to the markers query', async () => {
    const user = userEvent.setup()
    renderWithProviders()
    await waitFor(() => expect(fetchMarkersMock).toHaveBeenCalled())

    await user.click(screen.getByRole('button', { name: 'LED Screen' }))

    await waitFor(() =>
      expect(fetchMarkersMock.mock.lastCall?.[0]).toMatchObject({ type: 'LED_SCREEN' }),
    )
  })

  it('adds a trimmed city to the markers query', async () => {
    const user = userEvent.setup()
    renderWithProviders()
    await waitFor(() => expect(fetchMarkersMock).toHaveBeenCalled())

    await user.type(screen.getByPlaceholderText('City (e.g. Tashkent)'), '  Samarkand  ')

    await waitFor(() =>
      expect(fetchMarkersMock.mock.lastCall?.[0]).toMatchObject({ city: 'Samarkand' }),
    )
  })

  it('sends the price range as numbers', async () => {
    const user = userEvent.setup()
    renderWithProviders()
    await waitFor(() => expect(fetchMarkersMock).toHaveBeenCalled())

    await user.type(screen.getByPlaceholderText('Min UZS'), '1000000')
    await user.type(screen.getByPlaceholderText('Max UZS'), '9000000')

    await waitFor(() =>
      expect(fetchMarkersMock.mock.lastCall?.[0]).toMatchObject({
        minPrice: 1_000_000,
        maxPrice: 9_000_000,
      }),
    )
  })

  it('clears the filters on reset and reuses the cached unfiltered results', async () => {
    const user = userEvent.setup()
    renderWithProviders()
    await waitFor(() => expect(fetchMarkersMock).toHaveBeenCalled())

    await user.click(screen.getByRole('button', { name: 'Billboard' }))
    await waitFor(() =>
      expect(fetchMarkersMock.mock.lastCall?.[0]).toMatchObject({ type: 'BILLBOARD' }),
    )
    const callsWhileFiltered = fetchMarkersMock.mock.calls.length

    await user.click(screen.getByRole('button', { name: /Reset filters/i }))

    // Reset restores the original query key, which is still cached, so the
    // unfiltered view comes back without another request.
    await waitFor(() => expect(screen.queryByText('Filters applied')).not.toBeInTheDocument())
    expect(fetchMarkersMock.mock.calls.length).toBe(callsWhileFiltered)
    expect(screen.getByRole('button', { name: 'All Types' })).toBeInTheDocument()
  })

  it('keeps the bounds in every filtered query', async () => {
    const user = userEvent.setup()
    renderWithProviders()
    await waitFor(() => expect(fetchMarkersMock).toHaveBeenCalled())

    await user.click(screen.getByRole('button', { name: 'LED Screen' }))

    await waitFor(() =>
      expect(fetchMarkersMock.mock.lastCall?.[0]).toMatchObject({
        minLat: 41.0,
        maxLat: 41.6,
        minLng: 69.0,
        maxLng: 69.6,
      }),
    )
  })

  it('sends LED-specific filters only for LED screens', async () => {
    const user = userEvent.setup()
    renderWithProviders()
    await waitFor(() => expect(fetchMarkersMock).toHaveBeenCalled())

    await user.click(screen.getByRole('button', { name: 'LED Screen' }))
    await user.type(screen.getByPlaceholderText('LED duration (sec)'), '15')
    await user.type(screen.getByPlaceholderText('LED plays/day'), '120')

    await waitFor(() =>
      expect(fetchMarkersMock.mock.lastCall?.[0]).toMatchObject({
        type: 'LED_SCREEN',
        ledDurationSeconds: 15,
        ledPlaysPerDay: 120,
      }),
    )
  })

  it('counts the markers on the mobile list toggle', async () => {
    renderWithProviders()

    expect(await screen.findByRole('button', { name: /List \(2\)/ })).toBeInTheDocument()
  })

  it('surfaces a retry action when the markers query fails', async () => {
    fetchMarkersMock.mockRejectedValue(new Error('Network down'))
    renderWithProviders()

    expect(await screen.findByText('Failed to load placements')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Retry/i })).toBeInTheDocument()
  })
})
