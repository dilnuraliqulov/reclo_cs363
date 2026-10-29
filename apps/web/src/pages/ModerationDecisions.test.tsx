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

const REASON = 'The photo is blurry and the address is wrong'

async function openRejectDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Reject' }))
  return screen.findByRole('dialog')
}

const posts = (calls: { key: string; body?: unknown }[]) =>
  calls.filter((call) => call.key.startsWith('POST'))

describe('the reject dialog', () => {
  it('opens with Cancel focused and the explanation of who sees the reason', async () => {
    stubAdminApi({ list: [summary(1)], details: [detail(1)] })
    const user = userEvent.setup()

    renderModeration(`/admin/moderation/${idOf(1)}`)
    const dialog = await openRejectDialog(user)

    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus()
    expect(within(dialog).getByLabelText('Reason for the vendor')).toBeInTheDocument()
    expect(within(dialog).getByText('The vendor will see this text.')).toBeInTheDocument()
    expect(within(dialog).getByText('0/500')).toBeInTheDocument()
  })

  it('requires a reason: empty and too-short ones are refused with localized text, nothing is sent', async () => {
    const { state } = stubAdminApi({ list: [summary(1)], details: [detail(1)] })
    const user = userEvent.setup()

    renderModeration(`/admin/moderation/${idOf(1)}`)
    const dialog = await openRejectDialog(user)
    await user.click(within(dialog).getByRole('button', { name: 'Reject listing' }))
    expect(await within(dialog).findByText('Reason must be at least 10 characters')).toBeVisible()

    await user.type(within(dialog).getByLabelText('Reason for the vendor'), 'too short')
    await user.click(within(dialog).getByRole('button', { name: 'Reject listing' }))
    expect(within(dialog).getByText('Reason must be at least 10 characters')).toBeVisible()
    expect(posts(state.calls)).toHaveLength(0)
  })

  it('counts whitespace-only text as empty', async () => {
    const { state } = stubAdminApi({ list: [summary(1)], details: [detail(1)] })
    const user = userEvent.setup()

    renderModeration(`/admin/moderation/${idOf(1)}`)
    const dialog = await openRejectDialog(user)
    await user.type(within(dialog).getByLabelText('Reason for the vendor'), ' '.repeat(20))
    await user.click(within(dialog).getByRole('button', { name: 'Reject listing' }))

    expect(await within(dialog).findByText('Reason must be at least 10 characters')).toBeVisible()
    expect(posts(state.calls)).toHaveLength(0)
  })

  it('shows the live character count', async () => {
    stubAdminApi({ list: [summary(1)], details: [detail(1)] })
    const user = userEvent.setup()

    renderModeration(`/admin/moderation/${idOf(1)}`)
    const dialog = await openRejectDialog(user)
    await user.type(within(dialog).getByLabelText('Reason for the vendor'), 'abcde')

    expect(within(dialog).getByText('5/500')).toBeInTheDocument()
  })

  it('Cancel closes it without a request, and the typed text is gone when it reopens', async () => {
    const { state } = stubAdminApi({ list: [summary(1)], details: [detail(1)] })
    const user = userEvent.setup()

    renderModeration(`/admin/moderation/${idOf(1)}`)
    let dialog = await openRejectDialog(user)
    await user.type(within(dialog).getByLabelText('Reason for the vendor'), REASON)
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(posts(state.calls)).toHaveLength(0)
    expect(screen.getByRole('button', { name: 'Reject' })).toHaveFocus()
    dialog = await openRejectDialog(user)
    expect(within(dialog).getByLabelText('Reason for the vendor')).toHaveValue('')
  })

  it('sends one request with the trimmed reason and the version it saw, then moves on', async () => {
    const { state } = stubAdminApi({
      list: [summary(1), summary(2)],
      details: [detail(1), detail(2)],
    })
    const user = userEvent.setup()

    renderModeration(`/admin/moderation/${idOf(1)}`)
    const dialog = await openRejectDialog(user)
    await user.type(within(dialog).getByLabelText('Reason for the vendor'), `  ${REASON}  `)
    await user.click(within(dialog).getByRole('button', { name: 'Reject listing' }))

    expect(await screen.findByText('Listing rejected.')).toBeInTheDocument()
    expect(posts(state.calls)).toEqual([
      {
        key: `POST /api/admin/placements/${idOf(1)}/reject`,
        body: { expectedUpdatedAt: UPDATED_AT, reason: REASON },
      },
    ])
    expect(await screen.findByRole('heading', { name: 'Billboard 2' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('disables both buttons and reads "Rejecting…" while the request runs', async () => {
    let release: (response: Response) => void = () => {}
    stubAdminApi({ list: [summary(1)], details: [detail(1)] })
    // Hold the POST open to look at the in-flight state.
    const original = globalThis.fetch
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
        String(input).endsWith('/reject')
          ? new Promise<Response>((resolve) => {
              release = resolve
            })
          : original(input, init),
      ),
    )
    const user = userEvent.setup()

    renderModeration(`/admin/moderation/${idOf(1)}`)
    const dialog = await openRejectDialog(user)
    await user.type(within(dialog).getByLabelText('Reason for the vendor'), REASON)
    await user.click(within(dialog).getByRole('button', { name: 'Reject listing' }))

    expect(await within(dialog).findByRole('button', { name: 'Rejecting…' })).toBeDisabled()
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled()
    release(json(200, { placement: detail(1, { status: 'REJECTED' }) }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})

describe('conflicts and failures', () => {
  it('approving a listing the vendor edited meanwhile: explains, refetches, shows the new version', async () => {
    let served = 0
    const { state } = stubAdminApi({ list: [summary(1)], details: [detail(1)] }, ({ url }) => {
      if (url.pathname.endsWith('/approve')) {
        return json(409, { error: 'changed', code: 'PLACEMENT_CHANGED' })
      }
      if (url.pathname === `/api/admin/placements/${idOf(1)}` && ++served > 1) {
        return json(200, {
          placement: detail(1, {
            title: 'Edited by the vendor',
            updatedAt: '2026-10-27T08:00:00.000Z',
          }),
        })
      }
      return undefined
    })
    const user = userEvent.setup()

    renderModeration(`/admin/moderation/${idOf(1)}`)
    await user.click(await screen.findByRole('button', { name: 'Approve' }))

    expect(
      await screen.findByText('The vendor changed this listing. Review it again.'),
    ).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Edited by the vendor' })).toBeInTheDocument()
    // The next decision carries the refreshed version, not the stale one.
    await user.click(screen.getByRole('button', { name: 'Approve' }))
    await waitFor(() => expect(posts(state.calls)).toHaveLength(2))
    expect(posts(state.calls)[1]?.body).toEqual({ expectedUpdatedAt: '2026-10-27T08:00:00.000Z' })
  })

  it('another admin decided first: says so, closes the reject dialog and drops the typed reason', async () => {
    let decided = false
    stubAdminApi({ list: [summary(1)], details: [detail(1)] }, ({ url }) => {
      if (url.pathname.endsWith('/reject')) {
        decided = true
        return json(409, { error: 'no', code: 'PLACEMENT_NOT_PENDING' })
      }
      if (decided && url.pathname === `/api/admin/placements/${idOf(1)}`) {
        return json(200, { placement: detail(1, { status: 'ACTIVE' }) })
      }
      return undefined
    })
    const user = userEvent.setup()

    renderModeration(`/admin/moderation/${idOf(1)}`)
    const dialog = await openRejectDialog(user)
    await user.type(within(dialog).getByLabelText('Reason for the vendor'), REASON)
    await user.click(within(dialog).getByRole('button', { name: 'Reject listing' }))

    expect(
      await screen.findByText('This listing is no longer waiting for review'),
    ).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    // Decided already: the footer is gone and the status says so.
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull())
    expect(screen.queryByRole('button', { name: 'Reject' })).toBeNull()
    expect(screen.getAllByText('Live').length).toBeGreaterThan(0)
  })

  it('a server error keeps the dialog open with the text intact', async () => {
    stubAdminApi({ list: [summary(1)], details: [detail(1)] }, ({ url }) =>
      url.pathname.endsWith('/reject') ? json(500, { error: 'boom', code: 'INTERNAL' }) : undefined,
    )
    const user = userEvent.setup()

    renderModeration(`/admin/moderation/${idOf(1)}`)
    const dialog = await openRejectDialog(user)
    await user.type(within(dialog).getByLabelText('Reason for the vendor'), REASON)
    await user.click(within(dialog).getByRole('button', { name: 'Reject listing' }))

    expect(await screen.findByText('Something went wrong')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Reason for the vendor')).toHaveValue(REASON)
    expect(within(dialog).getByRole('button', { name: 'Reject listing' })).toBeEnabled()
  })

  it('a lost session sends the admin to sign-in', async () => {
    stubAdminApi({ list: [summary(1)], details: [detail(1)] }, ({ url }) =>
      url.pathname.endsWith('/approve')
        ? json(401, { error: 'no', code: 'NOT_AUTHENTICATED' })
        : undefined,
    )
    const user = userEvent.setup()

    renderModeration(`/admin/moderation/${idOf(1)}`)
    await user.click(await screen.findByRole('button', { name: 'Approve' }))

    expect(await screen.findByText('sign-in page')).toBeInTheDocument()
  })

  it('a role that changed under the admin sends them home', async () => {
    stubAdminApi({ list: [] }, ({ url }) =>
      url.pathname === '/api/admin/placements'
        ? json(403, { error: 'Forbidden', code: 'FORBIDDEN' })
        : undefined,
    )

    renderModeration()

    expect(await screen.findByText('home page')).toBeInTheDocument()
  })
})

describe('detail states', () => {
  it('a listing that does not exist says so and links back to the queue', async () => {
    stubAdminApi({ list: [summary(1)], details: [] })

    renderModeration(`/admin/moderation/${idOf(9)}`)

    expect(await screen.findByText('Listing not found')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Back to the queue' }).length).toBeGreaterThan(0)
  })

  it('an already decided listing shows its status and history but no decision buttons', async () => {
    stubAdminApi({
      list: [],
      details: [
        detail(1, {
          status: 'REJECTED',
          events: [
            {
              id: 'e1',
              action: 'REJECTED',
              reason: 'Wrong city on the address',
              adminName: null,
              createdAt: '2026-10-21T09:00:00.000Z',
            },
          ],
        }),
      ],
    })

    renderModeration(`/admin/moderation/${idOf(1)}`)

    expect(await screen.findByRole('heading', { name: 'Billboard 1' })).toBeInTheDocument()
    expect(screen.getAllByText('Rejected').length).toBeGreaterThan(0)
    expect(screen.getByText(/Rejected by a removed admin/)).toBeInTheDocument()
    expect(screen.getByText('Wrong city on the address')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Reject' })).toBeNull()
  })
})
