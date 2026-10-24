import type { PlacementMarker } from '@reclo/shared'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PlacementDetailModal } from './PlacementDetailModal'

const marker: PlacementMarker = {
  id: 'b1e0696a-54c3-4d40-84c4-f2a89326e680',
  title: 'Amir Temur Billboard',
  type: 'BILLBOARD',
  status: 'ACTIVE',
  latitude: 41.311081,
  longitude: 69.279737,
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

describe('PlacementDetailModal', () => {
  it('renders nothing without a marker', () => {
    const { container } = render(<PlacementDetailModal marker={null} open onOpenChange={vi.fn()} />)

    expect(container).toBeEmptyDOMElement()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('stays closed when open is false', () => {
    render(<PlacementDetailModal marker={marker} open={false} onOpenChange={vi.fn()} />)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows the title, type, status and address', () => {
    render(<PlacementDetailModal marker={marker} open onOpenChange={vi.fn()} />)

    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent('Amir Temur Billboard')
    expect(dialog).toHaveTextContent('Billboard')
    expect(dialog).toHaveTextContent('ACTIVE')
    expect(dialog).toHaveTextContent('Amir Temur Ave 10, Tashkent')
  })

  it('shows the monthly rate', () => {
    render(<PlacementDetailModal marker={marker} open onOpenChange={vi.fn()} />)

    expect(screen.getByText('Monthly rate')).toBeInTheDocument()
    expect(screen.getByText(/5[\s,.]?000[\s,.]?000\s?UZS/)).toBeInTheDocument()
  })

  it('shows coordinates rounded to five decimals', () => {
    render(<PlacementDetailModal marker={marker} open onOpenChange={vi.fn()} />)

    expect(screen.getByText('41.31108, 69.27974')).toBeInTheDocument()
  })

  it('renders the photo when present', () => {
    render(<PlacementDetailModal marker={marker} open onOpenChange={vi.fn()} />)

    expect(screen.getByAltText('Amir Temur Billboard')).toHaveAttribute(
      'src',
      'https://example.com/photo.jpg',
    )
  })

  it('falls back to a placeholder without a photo', () => {
    render(<PlacementDetailModal marker={withoutPhoto(marker)} open onOpenChange={vi.fn()} />)

    expect(screen.getByText('No preview photo available')).toBeInTheDocument()
  })

  it('closes from the footer Close button', async () => {
    const onOpenChange = vi.fn()
    const user = userEvent.setup()
    render(<PlacementDetailModal marker={marker} open onOpenChange={onOpenChange} />)

    // The dialog primitive renders its own "Close" X on top of our footer
    // button, so target the last one.
    const closeButtons = screen.getAllByRole('button', { name: 'Close' })
    await user.click(closeButtons[closeButtons.length - 1]!)

    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('closes from the dialog X affordance', async () => {
    const onOpenChange = vi.fn()
    const user = userEvent.setup()
    render(<PlacementDetailModal marker={marker} open onOpenChange={onOpenChange} />)

    await user.click(screen.getAllByRole('button', { name: 'Close' })[0]!)

    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('closes on Escape', async () => {
    const onOpenChange = vi.fn()
    const user = userEvent.setup()
    render(<PlacementDetailModal marker={marker} open onOpenChange={onOpenChange} />)

    await user.keyboard('{Escape}')

    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('tells the user the inquiry flow is not built yet', async () => {
    const user = userEvent.setup()
    render(<PlacementDetailModal marker={marker} open onOpenChange={vi.fn()} />)

    // KAN-8 / KAN-34 own the real flow; this must not throw or navigate.
    await user.click(screen.getByRole('button', { name: /Inquire \/ Reserve/i }))

    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})
