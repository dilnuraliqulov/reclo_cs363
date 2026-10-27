import type { InquiryHistoryItem } from '@reclo/shared'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '@/auth/AuthProvider'
import { InquiryHistoryPage } from './InquiryHistoryPage'

const PLACEMENT_ID = 'b1e0696a-54c3-4d40-84c4-f2a89326e680'
const signedInUser = { id: 'u1', email: 'client@example.com', role: 'CLIENT' }

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function historyItem(index: number, overrides: Partial<InquiryHistoryItem> = {}) {
  return {
    // A real uuid: the client parses the response with `inquiryHistoryItemSchema`, which checks it.
    id: `8f1e2bb6-6ad8-4a2e-9f6e-1c2f6f2a31a${index}`,
    placementId: PLACEMENT_ID,
    status: 'NEW',
    message: `Campaign enquiry number ${index}`,
    contactName: 'Aziza Karimova',
    contactPhone: '+998901234567',
    contactEmail: 'aziza@example.com',
    desiredStartDate: null,
    durationMonths: null,
    createdAt: '2026-10-26T10:00:00.000Z',
    placement: {
      id: PLACEMENT_ID,
      title: `Billboard ${index}`,
      city: 'Tashkent',
      type: 'BILLBOARD',
      isViewable: true,
    },
    ...overrides,
  } satisfies InquiryHistoryItem
}

/** The query strings the page sent to GET /api/inquiries, in order. */
let historyCalls: URLSearchParams[]

type HistoryHandler = (query: URLSearchParams) => Response

function stubApi(onHistory?: HistoryHandler) {
  historyCalls = []
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input))
    if (url.pathname === '/api/auth/me') return json(200, { user: signedInUser })
    if (url.pathname === '/api/inquiries') {
      historyCalls.push(url.searchParams)
      return onHistory
        ? onHistory(url.searchParams)
        : json(200, { inquiries: [], nextCursor: null })
    }
    throw new Error(`unexpected fetch: ${url.pathname}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/inquiries']}>
        <AuthProvider>
          <InquiryHistoryPage />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  historyCalls = []
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('InquiryHistoryPage', () => {
  it('lists the inquiries it fetched, newest first as the server ordered them', async () => {
    stubApi(() => json(200, { inquiries: [historyItem(0), historyItem(1)], nextCursor: null }))
    renderPage()

    await screen.findByText('Billboard 0')
    const rows = screen.getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent('Billboard 0')
    expect(rows[1]).toHaveTextContent('Billboard 1')
  })

  it('does not send a clientId, which the server takes from the session', async () => {
    stubApi()
    renderPage()

    await waitFor(() => expect(historyCalls).toHaveLength(1))
    expect(historyCalls[0]!.has('clientId')).toBe(false)
  })

  describe('empty states', () => {
    it('prompts a first-time client towards the map', async () => {
      stubApi()
      renderPage()

      expect(await screen.findByText('You have not sent any inquiries yet')).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Browse placements' })).toBeInTheDocument()
    })

    it('says the filter is empty rather than the history, so nothing looks lost', async () => {
      stubApi((query) =>
        query.get('status') === 'RESPONDED'
          ? json(200, { inquiries: [], nextCursor: null })
          : json(200, { inquiries: [historyItem(0)], nextCursor: null }),
      )
      renderPage()
      await screen.findByText('Billboard 0')

      await userEvent.click(screen.getByRole('tab', { name: 'Replied' }))

      expect(await screen.findByText('No inquiries with this status')).toBeInTheDocument()
      // The first-run prompt would read as "your history is gone".
      expect(screen.queryByText('You have not sent any inquiries yet')).not.toBeInTheDocument()
    })

    it('clears the filter from the filtered empty state', async () => {
      stubApi((query) =>
        query.get('status') === 'RESPONDED'
          ? json(200, { inquiries: [], nextCursor: null })
          : json(200, { inquiries: [historyItem(0)], nextCursor: null }),
      )
      renderPage()
      await screen.findByText('Billboard 0')
      await userEvent.click(screen.getByRole('tab', { name: 'Replied' }))
      await screen.findByText('No inquiries with this status')

      await userEvent.click(screen.getByRole('button', { name: 'Show all' }))

      expect(await screen.findByText('Billboard 0')).toBeInTheDocument()
    })
  })

  describe('filtering', () => {
    it('sends the status the tab selects', async () => {
      stubApi()
      renderPage()
      await screen.findByText('You have not sent any inquiries yet')

      await userEvent.click(screen.getByRole('tab', { name: 'Seen' }))

      await waitFor(() => expect(historyCalls).toHaveLength(2))
      expect(historyCalls[1]!.get('status')).toBe('READ')
    })

    it('sends no status for All, so All really means all', async () => {
      stubApi()
      renderPage()

      await waitFor(() => expect(historyCalls).toHaveLength(1))
      expect(historyCalls[0]!.has('status')).toBe(false)
    })

    it('labels the tabs from the client side, not with the enum', async () => {
      stubApi()
      renderPage()
      await screen.findByText('You have not sent any inquiries yet')

      for (const label of ['All', 'Sent', 'Seen', 'Replied', 'Closed']) {
        expect(screen.getByRole('tab', { name: label })).toBeInTheDocument()
      }
      expect(screen.queryByRole('tab', { name: 'RESPONDED' })).not.toBeInTheDocument()
    })
  })

  describe('paging', () => {
    it('appends the next page rather than replacing the rows on screen', async () => {
      stubApi((query) =>
        query.get('cursor')
          ? json(200, { inquiries: [historyItem(1)], nextCursor: null })
          : json(200, { inquiries: [historyItem(0)], nextCursor: 'cursor-1' }),
      )
      renderPage()
      await screen.findByText('Billboard 0')

      await userEvent.click(screen.getByRole('button', { name: 'Load older' }))

      await screen.findByText('Billboard 1')
      expect(screen.getByText('Billboard 0')).toBeInTheDocument()
      expect(screen.getAllByRole('listitem')).toHaveLength(2)
    })

    it('sends the cursor the previous page returned', async () => {
      stubApi((query) =>
        query.get('cursor')
          ? json(200, { inquiries: [historyItem(1)], nextCursor: null })
          : json(200, { inquiries: [historyItem(0)], nextCursor: 'cursor-1' }),
      )
      renderPage()
      await screen.findByText('Billboard 0')

      await userEvent.click(screen.getByRole('button', { name: 'Load older' }))

      await waitFor(() => expect(historyCalls).toHaveLength(2))
      expect(historyCalls[1]!.get('cursor')).toBe('cursor-1')
    })

    it('hides the button once the last page arrives', async () => {
      stubApi((query) =>
        query.get('cursor')
          ? json(200, { inquiries: [historyItem(1)], nextCursor: null })
          : json(200, { inquiries: [historyItem(0)], nextCursor: 'cursor-1' }),
      )
      renderPage()
      await screen.findByText('Billboard 0')

      await userEvent.click(screen.getByRole('button', { name: 'Load older' }))
      await screen.findByText('Billboard 1')

      expect(screen.queryByRole('button', { name: 'Load older' })).not.toBeInTheDocument()
    })

    it('shows no button when the first page is the only one', async () => {
      stubApi(() => json(200, { inquiries: [historyItem(0)], nextCursor: null }))
      renderPage()
      await screen.findByText('Billboard 0')

      expect(screen.queryByRole('button', { name: 'Load older' })).not.toBeInTheDocument()
    })
  })

  describe('rows', () => {
    it('expands to the message and the contact details that were sent', async () => {
      stubApi(() => json(200, { inquiries: [historyItem(0)], nextCursor: null }))
      renderPage()
      const trigger = await screen.findByRole('button', { name: /Billboard 0/ })

      expect(trigger).toHaveAttribute('aria-expanded', 'false')
      await userEvent.click(trigger)

      expect(trigger).toHaveAttribute('aria-expanded', 'true')
      const row = screen.getAllByRole('listitem')[0]!
      expect(within(row).getByText('Campaign enquiry number 0')).toBeInTheDocument()
      // Formatted for reading; the stored value stays canonical E.164.
      expect(within(row).getByText(/\+998 90 123 45 67/)).toBeInTheDocument()
    })

    it('shows the campaign line only when a start date or duration was given', async () => {
      stubApi(() =>
        json(200, {
          inquiries: [
            historyItem(0),
            historyItem(1, { desiredStartDate: '2026-12-01', durationMonths: 3 }),
          ],
          nextCursor: null,
        }),
      )
      renderPage()
      await screen.findByText('Billboard 0')

      await userEvent.click(screen.getByRole('button', { name: /Billboard 0/ }))
      await userEvent.click(screen.getByRole('button', { name: /Billboard 1/ }))

      const rows = screen.getAllByRole('listitem')
      expect(within(rows[0]!).queryByText('Campaign')).not.toBeInTheDocument()
      expect(within(rows[1]!).getByText('Campaign')).toBeInTheDocument()
      expect(within(rows[1]!).getByText(/3 months/)).toBeInTheDocument()
    })

    it('renders each status with its client-facing label', async () => {
      stubApi(() =>
        json(200, {
          inquiries: [
            historyItem(0, { status: 'NEW' }),
            historyItem(1, { status: 'READ' }),
            historyItem(2, { status: 'RESPONDED' }),
            historyItem(3, { status: 'CLOSED' }),
          ],
          nextCursor: null,
        }),
      )
      renderPage()
      await screen.findByText('Billboard 0')

      const rows = screen.getAllByRole('listitem')
      expect(rows[0]).toHaveTextContent('Sent')
      expect(rows[1]).toHaveTextContent('Seen')
      expect(rows[2]).toHaveTextContent('Replied')
      expect(rows[3]).toHaveTextContent('Closed')
    })

    it('keeps an archived placement visible, without a link', async () => {
      stubApi(() =>
        json(200, {
          inquiries: [
            historyItem(0, {
              placement: {
                id: PLACEMENT_ID,
                title: 'Billboard 0',
                city: 'Tashkent',
                type: 'BILLBOARD',
                isViewable: false,
              },
            }),
          ],
          nextCursor: null,
        }),
      )
      renderPage()
      await userEvent.click(await screen.findByRole('button', { name: /Billboard 0/ }))

      // Archiving a listing must not erase the client's record of what they sent.
      const row = screen.getAllByRole('listitem')[0]!
      expect(within(row).getByText('This placement is no longer listed')).toBeInTheDocument()
      expect(within(row).queryByRole('link')).not.toBeInTheDocument()
    })

    it('links to the placement when it is still listed', async () => {
      stubApi(() => json(200, { inquiries: [historyItem(0)], nextCursor: null }))
      renderPage()
      await userEvent.click(await screen.findByRole('button', { name: /Billboard 0/ }))

      const row = screen.getAllByRole('listitem')[0]!
      expect(within(row).getByRole('link', { name: 'Billboard 0' })).toHaveAttribute(
        'href',
        `/placements?focus=${PLACEMENT_ID}`,
      )
    })

    it('still shows the inquiry when the placement was deleted outright', async () => {
      stubApi(() =>
        json(200, { inquiries: [historyItem(0, { placement: null })], nextCursor: null }),
      )
      renderPage()

      expect(await screen.findByText('Placement removed')).toBeInTheDocument()
    })
  })

  it('offers a retry when the fetch fails', async () => {
    let attempts = 0
    stubApi(() => {
      attempts += 1
      return attempts === 1
        ? json(500, { error: 'Something went wrong' })
        : json(200, { inquiries: [historyItem(0)], nextCursor: null })
    })
    renderPage()
    await screen.findByText('Could not load your inquiries')

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByText('Billboard 0')).toBeInTheDocument()
  })
})
