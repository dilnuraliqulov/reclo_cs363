import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  UPDATED_AT,
  detail,
  idOf,
  json,
  renderModeration,
  stubAdminApi,
  summary,
} from '@/test/moderation'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the queue', () => {
  it('lists pending listings with a waiting count, oldest first as the API sends them', async () => {
    stubAdminApi({ list: [summary(1), summary(2, { title: 'LED on Navoi' })] })

    renderModeration()

    expect(await screen.findByRole('link', { name: 'Billboard 1' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'LED on Navoi' })).toBeInTheDocument()
    expect(screen.getByText('2 waiting')).toBeInTheDocument()
    const rows = screen.getAllByRole('row').slice(1)
    expect(within(rows[0]!).getByText('Billboard 1')).toBeInTheDocument()
  })

  it('asks for the pending status by default', async () => {
    const { state } = stubAdminApi({ list: [summary(1)] })

    renderModeration()
    await screen.findByText('Billboard 1')

    expect(state.calls[0]?.key).toBe(
      '/api/admin/placements?status=PENDING_REVIEW&page=1&pageSize=20'.replace(/^/, 'GET '),
    )
  })

  it('shows the empty state when nothing waits', async () => {
    stubAdminApi({ list: [] })

    renderModeration()

    expect(await screen.findByText(/The queue is empty/)).toBeInTheDocument()
  })

  it('shows an error with a retry that asks again', async () => {
    let failing = true
    const { state } = stubAdminApi({ list: [summary(1)] }, ({ url }) =>
      failing && url.pathname === '/api/admin/placements'
        ? json(500, { error: 'boom', code: 'INTERNAL' })
        : undefined,
    )
    const user = userEvent.setup()

    renderModeration()
    expect(await screen.findByText("Couldn't load the moderation queue.")).toBeInTheDocument()
    failing = false
    await user.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByText('Billboard 1')).toBeInTheDocument()
    expect(state.calls.length).toBeGreaterThanOrEqual(2)
  })
})

describe('the detail pane and approving', () => {
  it('opens a listing from the queue and shows vendor, details and history', async () => {
    stubAdminApi({
      list: [summary(1)],
      details: [
        detail(1, {
          events: [
            {
              id: 'e1',
              action: 'REJECTED',
              reason: 'Blurry photo, please retake it',
              adminName: 'aziza',
              createdAt: '2026-10-21T09:00:00.000Z',
            },
          ],
        }),
      ],
    })
    const user = userEvent.setup()

    renderModeration()
    await user.click(await screen.findByRole('link', { name: 'Billboard 1' }))

    expect(await screen.findByRole('heading', { name: 'Billboard 1' })).toBeInTheDocument()
    expect(screen.getByText(/vendor@example.com/)).toBeInTheDocument()
    expect(screen.getByText('Facing the main road')).toBeInTheDocument()
    expect(screen.getByText(/Rejected by aziza/)).toBeInTheDocument()
    expect(screen.getByText('Blurry photo, please retake it')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Approve' })).toBeEnabled()
  })

  it('approves with the updatedAt it saw, toasts, and moves to the next listing', async () => {
    const { state } = stubAdminApi({
      list: [summary(1), summary(2)],
      details: [detail(1), detail(2)],
    })
    const user = userEvent.setup()

    renderModeration(`/admin/moderation/${idOf(1)}`)
    await user.click(await screen.findByRole('button', { name: 'Approve' }))

    expect(await screen.findByText('Listing approved.')).toBeInTheDocument()
    const approve = state.calls.find((c) => c.key.startsWith('POST'))
    expect(approve?.key).toBe(`POST /api/admin/placements/${idOf(1)}/approve`)
    expect(approve?.body).toEqual({ expectedUpdatedAt: UPDATED_AT })
    expect(await screen.findByRole('heading', { name: 'Billboard 2' })).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Billboard 1' })).toBeNull())
  })

  it('disables Approve for a listing with no photos and says why', async () => {
    stubAdminApi({
      list: [summary(1, { photoCount: 0, cover: null })],
      details: [detail(1, { photos: [], photo: undefined })],
    })

    renderModeration(`/admin/moderation/${idOf(1)}`)

    expect(await screen.findByRole('button', { name: 'Approve' })).toBeDisabled()
    expect(screen.getByText(/has no photos, so it can't be approved/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reject' })).toBeEnabled()
  })
})
