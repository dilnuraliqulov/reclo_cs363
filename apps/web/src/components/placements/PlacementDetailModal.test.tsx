import type { PlacementDetail, PlacementMarker } from '@reclo/shared'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '@/auth/AuthProvider'
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

const detail: PlacementDetail = {
  ...marker,
  tier: 'SILVER',
  description: 'High traffic road-facing placement',
  width: 6,
  height: 3,
  lighting: true,
  photos: ['https://example.com/photo.jpg', 'https://example.com/photo-2.jpg'],
  vendorId: 'vendor-123',
  createdAt: '2026-10-10T10:00:00.000Z',
  updatedAt: '2026-10-12T15:00:00.000Z',
}

/** A copy of the fixture with no photo, for the placeholder paths. */
function withoutPhoto(marker: PlacementMarker): PlacementMarker {
  const copy = { ...marker }
  delete copy.photo
  return copy
}

describe('PlacementDetailModal', () => {
  it('renders nothing without a marker', () => {
    const { container } = render(
      <PlacementDetailModal marker={null} detail={null} open onOpenChange={vi.fn()} />,
    )

    expect(container).toBeEmptyDOMElement()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('stays closed when open is false', () => {
    render(
      <PlacementDetailModal marker={marker} detail={null} open={false} onOpenChange={vi.fn()} />,
    )

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows the title, type, status and address', () => {
    render(<PlacementDetailModal marker={marker} detail={null} open onOpenChange={vi.fn()} />)

    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent('Amir Temur Billboard')
    expect(dialog).toHaveTextContent('Billboard')
    expect(dialog).toHaveTextContent('ACTIVE')
    expect(dialog).toHaveTextContent('Amir Temur Ave 10, Tashkent')
  })

  it('shows the monthly rate', () => {
    render(<PlacementDetailModal marker={marker} detail={null} open onOpenChange={vi.fn()} />)

    expect(screen.getByText('Monthly rate')).toBeInTheDocument()
    expect(screen.getByText(/5[\s,.]?000[\s,.]?000\s?UZS/)).toBeInTheDocument()
  })

  it('shows coordinates rounded to five decimals', () => {
    render(<PlacementDetailModal marker={marker} detail={null} open onOpenChange={vi.fn()} />)

    expect(screen.getByText('41.31108, 69.27974')).toBeInTheDocument()
  })

  it('renders the photo when present', () => {
    render(<PlacementDetailModal marker={marker} detail={null} open onOpenChange={vi.fn()} />)

    expect(screen.getByAltText('Amir Temur Billboard')).toHaveAttribute(
      'src',
      'https://example.com/photo.jpg',
    )
  })

  it('falls back to a placeholder without a photo', () => {
    render(
      <PlacementDetailModal
        marker={withoutPhoto(marker)}
        detail={null}
        open
        onOpenChange={vi.fn()}
      />,
    )

    expect(screen.getByText('No preview photo available')).toBeInTheDocument()
  })

  it('closes from the footer Close button', async () => {
    const onOpenChange = vi.fn()
    const user = userEvent.setup()
    render(<PlacementDetailModal marker={marker} detail={null} open onOpenChange={onOpenChange} />)

    // The dialog primitive renders its own "Close" X on top of our footer
    // button, so target the last one.
    const closeButtons = screen.getAllByRole('button', { name: 'Close' })
    await user.click(closeButtons[closeButtons.length - 1]!)

    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('closes from the dialog X affordance', async () => {
    const onOpenChange = vi.fn()
    const user = userEvent.setup()
    render(<PlacementDetailModal marker={marker} detail={null} open onOpenChange={onOpenChange} />)

    await user.click(screen.getAllByRole('button', { name: 'Close' })[0]!)

    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('closes on Escape', async () => {
    const onOpenChange = vi.fn()
    const user = userEvent.setup()
    render(<PlacementDetailModal marker={marker} detail={null} open onOpenChange={onOpenChange} />)

    await user.keyboard('{Escape}')

    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('opens the inquiry form from the Inquire button', async () => {
    const user = userEvent.setup()
    // Signed out, so the form shows its sign-in prompt; the submit path is covered in
    // InquiryFormDialog.test.tsx.
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: 'Not authenticated' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          }),
      ),
    )
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <MemoryRouter>
          <AuthProvider>
            <PlacementDetailModal marker={marker} detail={null} open onOpenChange={vi.fn()} />
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    )

    expect(screen.queryByText('Send an inquiry')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Inquire \/ Reserve/i }))

    expect(await screen.findByText('Send an inquiry')).toBeInTheDocument()
    vi.unstubAllGlobals()
  })

  it('returns focus to the Inquire button when the inquiry form closes', async () => {
    const user = userEvent.setup()
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: 'Not authenticated' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          }),
      ),
    )
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <MemoryRouter>
          <AuthProvider>
            <PlacementDetailModal marker={marker} detail={null} open onOpenChange={vi.fn()} />
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    )

    const inquire = screen.getByRole('button', { name: /Inquire \/ Reserve/i })
    await user.click(inquire)
    expect(await screen.findByText('Send an inquiry')).toBeInTheDocument()

    await user.keyboard('{Escape}')

    // The placement detail is still open behind it, so focus belongs back on its opener.
    await waitFor(() => expect(screen.queryByText('Send an inquiry')).not.toBeInTheDocument())
    await waitFor(() => expect(inquire).toHaveFocus())
    vi.unstubAllGlobals()
  })

  it('shows the tier badge and supports switching gallery photos', async () => {
    const user = userEvent.setup()
    render(<PlacementDetailModal marker={marker} detail={detail} open onOpenChange={vi.fn()} />)

    expect(screen.getByText('SILVER Tier')).toBeInTheDocument()
    expect(screen.getByAltText('Amir Temur Billboard')).toHaveAttribute(
      'src',
      'https://example.com/photo.jpg',
    )

    await user.click(screen.getByRole('button', { name: 'Show photo 2' }))
    expect(screen.getByAltText('Amir Temur Billboard')).toHaveAttribute(
      'src',
      'https://example.com/photo-2.jpg',
    )
  })
})
