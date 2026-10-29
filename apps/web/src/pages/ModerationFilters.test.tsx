import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthControls } from '@/components/auth/AuthControls'
import { AuthProvider } from '@/auth/AuthProvider'
import { renderWithLocale } from '@/test/locale'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import {
  ADMIN,
  idOf,
  json,
  renderModeration,
  stubAdminApi,
  summary,
  detail,
} from '@/test/moderation'

afterEach(() => {
  vi.unstubAllGlobals()
})

const listCalls = (calls: { key: string }[]) =>
  calls.filter((call) => call.key.startsWith('GET /api/admin/placements?')).map((c) => c.key)

describe('tabs and filters', () => {
  it('the Rejected tab asks for REJECTED and shows each listing status', async () => {
    const { state } = stubAdminApi({
      list: [summary(1), summary(2, { status: 'REJECTED', title: 'Rejected board' })],
    })
    const user = userEvent.setup()

    renderModeration()
    await screen.findByText('Billboard 1')
    await user.click(screen.getByRole('tab', { name: 'Rejected' }))

    expect(await screen.findByText('Rejected board')).toBeInTheDocument()
    expect(listCalls(state.calls).at(-1)).toContain('status=REJECTED')
    expect(screen.queryByText('Billboard 1')).toBeNull()
  })

  it('typing a city filters after a pause and resets to page 1', async () => {
    const { state } = stubAdminApi({ list: [summary(1)] })
    const user = userEvent.setup()

    renderModeration()
    await screen.findByText('Billboard 1')
    await user.type(screen.getByLabelText('City'), 'Samarkand')

    await vi.waitFor(() => expect(listCalls(state.calls).at(-1)).toContain('city=Samarkand'))
    expect(listCalls(state.calls).at(-1)).toContain('page=1')
  })

  it('an empty filtered result says so and Clear filters brings the list back', async () => {
    stubAdminApi({ list: [summary(1)] }, ({ url }) =>
      url.searchParams.get('city') ? json(200, { placements: [], total: 0 }) : undefined,
    )
    const user = userEvent.setup()

    renderModeration()
    await screen.findByText('Billboard 1')
    await user.type(screen.getByLabelText('City'), 'Nukus')

    expect(await screen.findByText('No listings match these filters.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Clear filters' }))

    expect(await screen.findByText('Billboard 1')).toBeInTheDocument()
    expect(screen.getByLabelText('City')).toHaveValue('')
  })

  it('an empty non-pending tab uses the filtered wording, not the first-run prompt', async () => {
    stubAdminApi({ list: [summary(1)] })
    const user = userEvent.setup()

    renderModeration()
    await screen.findByText('Billboard 1')
    await user.click(screen.getByRole('tab', { name: 'Archived' }))

    expect(await screen.findByText('No listings match these filters.')).toBeInTheDocument()
    expect(screen.queryByText(/The queue is empty/)).toBeNull()
  })

  it('pages through a long queue with Previous and Next', async () => {
    const many = Array.from({ length: 45 }, (_, i) =>
      summary(i % 10, { id: `${idOf(0).slice(0, -3)}${String(i).padStart(3, '0')}` }),
    )
    const { state } = stubAdminApi({ list: [] }, ({ url }) =>
      url.pathname === '/api/admin/placements'
        ? json(200, {
            placements: many.slice((Number(url.searchParams.get('page')) - 1) * 20).slice(0, 20),
            total: 45,
          })
        : undefined,
    )
    const user = userEvent.setup()

    renderModeration()
    expect(await screen.findByText('Page 1 of 3')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Next' }))

    expect(await screen.findByText('Page 2 of 3')).toBeInTheDocument()
    expect(listCalls(state.calls).at(-1)).toContain('page=2')
    expect(screen.getByRole('button', { name: 'Previous' })).toBeEnabled()
  })

  it('marks the open listing with aria-current', async () => {
    stubAdminApi({ list: [summary(1), summary(2)], details: [detail(1), detail(2)] })

    renderModeration(`/admin/moderation/${idOf(2)}`)

    const row = (await screen.findByRole('link', { name: 'Billboard 2' })).closest('tr')!
    expect(row).toHaveAttribute('aria-current', 'true')
    const other = screen.getByRole('link', { name: 'Billboard 1' }).closest('tr')!
    expect(other).not.toHaveAttribute('aria-current')
  })

  it('flags a listing with no photos in the queue', async () => {
    stubAdminApi({ list: [summary(1, { photoCount: 0, cover: null })] })

    renderModeration()

    const row = (await screen.findByRole('link', { name: 'Billboard 1' })).closest('tr')!
    expect(within(row).getByText('No photos')).toBeInTheDocument()
  })
})

describe('access and the header link', () => {
  it('a client who opens the URL is sent home and nothing is fetched from the admin API', async () => {
    const { state } = stubAdminApi({
      list: [summary(1)],
      user: { id: 'u2', email: 'c@example.com', role: 'CLIENT' },
    })

    renderModeration()

    expect(await screen.findByText('home page')).toBeInTheDocument()
    expect(state.calls).toHaveLength(0)
  })

  it('a signed-out visitor goes to sign-in', async () => {
    stubAdminApi({ list: [summary(1)], user: null })

    renderModeration()

    expect(await screen.findByText('sign-in page')).toBeInTheDocument()
  })

  function renderControls(role: 'ADMIN' | 'VENDOR' | 'CLIENT') {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json(200, { user: { ...ADMIN, role } })),
    )
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    renderWithLocale(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <AuthProvider>
            <AuthControls />
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    )
  }

  it('shows the Moderation link to admins only', async () => {
    renderControls('ADMIN')
    expect(await screen.findByRole('link', { name: 'Moderation' })).toHaveAttribute(
      'href',
      '/admin/moderation',
    )
  })

  it.each(['VENDOR', 'CLIENT'] as const)('hides it from a %s', async (role) => {
    renderControls(role)
    await screen.findByText(/admin@example.com/)
    expect(screen.queryByRole('link', { name: 'Moderation' })).toBeNull()
  })
})
