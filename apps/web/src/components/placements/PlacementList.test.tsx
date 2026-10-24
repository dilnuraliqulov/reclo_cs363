import type { PlacementMarker } from '@reclo/shared'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PlacementList } from './PlacementList'

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
}

const ledScreen: PlacementMarker = {
  ...billboard,
  id: 'c2f1707b-65d4-4e51-95d5-03b9a437f791',
  title: 'Chilonzor LED Screen',
  type: 'LED_SCREEN',
  pricePerMonth: 12_000_000,
}

function renderList(props: Partial<Parameters<typeof PlacementList>[0]> = {}) {
  return render(
    <PlacementList
      markers={[billboard, ledScreen]}
      onSelectMarker={vi.fn()}
      onViewDetails={vi.fn()}
      {...props}
    />,
  )
}

describe('PlacementList', () => {
  it('renders a card per marker', () => {
    renderList()

    expect(screen.getByTestId(`placement-card-${billboard.id}`)).toBeInTheDocument()
    expect(screen.getByTestId(`placement-card-${ledScreen.id}`)).toBeInTheDocument()
  })

  it('reports the result count for the viewport', () => {
    renderList({ total: 2 })

    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText(/placements in this area/)).toBeInTheDocument()
  })

  it('falls back to the marker count when no total is given', () => {
    renderList({ markers: [billboard], total: undefined })

    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText(/placement in this area/)).toBeInTheDocument()
  })

  it('shows skeletons while the bounds query resolves', () => {
    renderList({ isLoading: true })

    expect(screen.getByTestId('placement-skeletons')).toBeInTheDocument()
    expect(screen.getByText('Searching placements…')).toBeInTheDocument()
    expect(screen.queryByTestId(`placement-card-${billboard.id}`)).not.toBeInTheDocument()
  })

  it('shows the empty state when nothing matches', () => {
    renderList({ markers: [] })

    expect(screen.getByTestId('placement-empty-state')).toBeInTheDocument()
    expect(screen.getByText('No placements in this area')).toBeInTheDocument()
  })

  it('offers a reset only when filters are actually active', async () => {
    const onResetFilters = vi.fn()
    const user = userEvent.setup()
    const { unmount } = renderList({ markers: [], hasActiveFilters: false, onResetFilters })

    expect(screen.queryByRole('button', { name: /Reset filters/i })).not.toBeInTheDocument()
    unmount()

    renderList({ markers: [], hasActiveFilters: true, onResetFilters })
    await user.click(screen.getByRole('button', { name: /Reset filters/i }))

    expect(onResetFilters).toHaveBeenCalled()
  })

  it('surfaces the query error with its message', () => {
    renderList({ error: new Error('Failed to fetch map placements (500)') })

    expect(screen.getByText('Failed to load placements')).toBeInTheDocument()
    expect(screen.getByText('Failed to fetch map placements (500)')).toBeInTheDocument()
  })

  it('retries the query on request', async () => {
    const onRetry = vi.fn()
    const user = userEvent.setup()
    renderList({ error: new Error('Network down'), onRetry })

    await user.click(screen.getByRole('button', { name: /Retry/i }))

    expect(onRetry).toHaveBeenCalled()
  })

  it('hides cards and skeletons while an error is showing', () => {
    renderList({ error: new Error('Network down'), isLoading: true })

    expect(screen.queryByTestId('placement-skeletons')).not.toBeInTheDocument()
    expect(screen.queryByTestId(`placement-card-${billboard.id}`)).not.toBeInTheDocument()
  })

  it('forwards selection and details from a card', async () => {
    const onSelectMarker = vi.fn()
    const onViewDetails = vi.fn()
    const user = userEvent.setup()
    renderList({ onSelectMarker, onViewDetails })

    const card = screen.getByTestId(`placement-card-${ledScreen.id}`)
    await user.click(screen.getByText('Chilonzor LED Screen'))
    expect(onSelectMarker).toHaveBeenCalledWith(ledScreen)

    await user.click(card.querySelectorAll('button')[1]!)
    expect(onViewDetails).toHaveBeenCalledWith(ledScreen)
  })

  it('scrolls the selected card into view for the map/list sync', () => {
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView

    renderList({ selectedMarkerId: ledScreen.id })

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'nearest' })
  })
})
