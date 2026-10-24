import type { PlacementMarker } from '@reclo/shared'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PlacementCard } from './PlacementCard'

const marker: PlacementMarker = {
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

/** A copy of the fixture with no photo, for the placeholder paths. */
function withoutPhoto(marker: PlacementMarker): PlacementMarker {
  const copy = { ...marker }
  delete copy.photo
  return copy
}

describe('PlacementCard', () => {
  it('shows the title, address, type badge and monthly price', () => {
    render(<PlacementCard marker={marker} />)

    expect(screen.getByText('Amir Temur Billboard')).toBeInTheDocument()
    expect(screen.getByText('Amir Temur Ave 10, Tashkent')).toBeInTheDocument()
    expect(screen.getByText('Billboard')).toBeInTheDocument()
    expect(screen.getByText(/5[\s,.]?000[\s,.]?000\s?UZS/)).toBeInTheDocument()
  })

  it('renders the photo with the title as alt text', () => {
    render(<PlacementCard marker={marker} />)

    const image = screen.getByAltText('Amir Temur Billboard')
    expect(image).toHaveAttribute('src', 'https://example.com/photo.jpg')
    expect(image).toHaveAttribute('loading', 'lazy')
  })

  it('falls back to a placeholder when the marker has no photo', () => {
    render(<PlacementCard marker={withoutPhoto(marker)} />)

    expect(screen.getByText('No photo')).toBeInTheDocument()
    expect(screen.queryByAltText('Amir Temur Billboard')).not.toBeInTheDocument()
  })

  it('falls back to the placeholder when the photo fails to load', async () => {
    render(<PlacementCard marker={marker} />)

    const image = screen.getByAltText('Amir Temur Billboard')
    image.dispatchEvent(new Event('error'))

    expect(await screen.findByText('No photo')).toBeInTheDocument()
  })

  it('selects the placement when the card body is clicked', async () => {
    const onSelect = vi.fn()
    const user = userEvent.setup()
    render(<PlacementCard marker={marker} onSelect={onSelect} />)

    await user.click(screen.getByText('Amir Temur Billboard'))

    expect(onSelect).toHaveBeenCalledWith(marker)
  })

  it('selects the placement from the Map button', async () => {
    const onSelect = vi.fn()
    const user = userEvent.setup()
    render(<PlacementCard marker={marker} onSelect={onSelect} />)

    await user.click(screen.getByRole('button', { name: /Map/i }))

    expect(onSelect).toHaveBeenCalledWith(marker)
  })

  it('opens details without also re-selecting the card', async () => {
    const onSelect = vi.fn()
    const onViewDetails = vi.fn()
    const user = userEvent.setup()
    render(<PlacementCard marker={marker} onSelect={onSelect} onViewDetails={onViewDetails} />)

    await user.click(screen.getByRole('button', { name: /Details/i }))

    expect(onViewDetails).toHaveBeenCalledWith(marker)
    // The action row stops propagation so the card's own click does not fire.
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('marks the selected card for the list/map sync', () => {
    const { container } = render(<PlacementCard marker={marker} isSelected />)

    expect(container.querySelector('[data-testid^="placement-card-"]')?.className).toContain(
      'border-primary',
    )
  })

  it('exposes a stable test id derived from the placement id', () => {
    render(<PlacementCard marker={marker} />)

    expect(screen.getByTestId(`placement-card-${marker.id}`)).toBeInTheDocument()
  })
})
