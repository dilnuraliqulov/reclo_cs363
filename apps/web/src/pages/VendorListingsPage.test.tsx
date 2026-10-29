import type { PlacementStatus } from '@reclo/shared'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderApp } from '@/test/render-app'
import {
  PLACEMENT_ID,
  json,
  stubVendorApi,
  vendorPlacement,
  type RecordedCall,
} from '@/test/vendor-api'

const LIST = '/api/vendor/placements'

const OTHER_ID = '0b3f4c2e-1c38-4f6d-a9a1-0a1f0c2f7e11'

function listOf(...placements: ReturnType<typeof vendorPlacement>[]) {
  return json(200, { placements, total: placements.length })
}

const isList = (call: RecordedCall) => call.method === 'GET' && call.path === LIST

afterEach(() => {
  vi.unstubAllGlobals()
})

async function openActions(title: string) {
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: `Actions for ${title}` }))
  return user
}

describe('VendorListingsPage', () => {
  it('lists the vendor’s listings with status and price, asking for page 1 with no status filter', async () => {
    const { calls } = stubVendorApi('VENDOR', (call) =>
      isList(call)
        ? listOf(
            vendorPlacement({ title: 'Chilonzor billboard', status: 'ACTIVE' }),
            vendorPlacement({ id: OTHER_ID, title: 'Yunusobod LED', status: 'PENDING_REVIEW' }),
          )
        : undefined,
    )
    renderApp('/vendor/placements')

    expect(await screen.findByText('Chilonzor billboard')).toBeInTheDocument()
    expect(screen.getByText('Yunusobod LED')).toBeInTheDocument()
    // The status is a word, not only a colour.
    const rows = screen.getAllByRole('row')
    expect(within(rows[1]!).getByText('Live')).toBeInTheDocument()
    expect(within(rows[2]!).getByText('Pending review')).toBeInTheDocument()
    expect(screen.getAllByText('2 500 000 UZS').length).toBeGreaterThan(0)

    const request = calls.find(isList)!
    expect(request.search.get('page')).toBe('1')
    expect(request.search.get('pageSize')).toBe('20')
    expect(request.search.has('status')).toBe(false)
  })

  it('filters by status when a tab is chosen and goes back to page 1', async () => {
    const { calls } = stubVendorApi('VENDOR', (call) => (isList(call) ? listOf() : undefined))
    renderApp('/vendor/placements')
    const user = userEvent.setup()

    await user.click(await screen.findByRole('tab', { name: 'Pending review' }))
    await waitFor(() =>
      expect(calls.filter(isList).at(-1)!.search.get('status')).toBe('PENDING_REVIEW'),
    )

    await user.click(screen.getByRole('tab', { name: 'Archived' }))
    await waitFor(() => expect(calls.filter(isList).at(-1)!.search.get('status')).toBe('ARCHIVED'))

    await user.click(screen.getByRole('tab', { name: 'All' }))
    await waitFor(() => expect(calls.filter(isList).at(-1)!.search.has('status')).toBe(false))
  })

  it('shows the first-run prompt when there are no listings at all', async () => {
    stubVendorApi('VENDOR', (call) => (isList(call) ? listOf() : undefined))
    renderApp('/vendor/placements')

    expect(await screen.findByText('You have no listings yet.')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'New listing' })[0]).toHaveAttribute(
      'href',
      '/vendor/placements/new',
    )
  })

  it('tells an empty filter apart from no listings, and "Show all" leaves the filter', async () => {
    const { calls } = stubVendorApi('VENDOR', (call) => (isList(call) ? listOf() : undefined))
    renderApp('/vendor/placements')
    const user = userEvent.setup()

    await user.click(await screen.findByRole('tab', { name: 'Paused' }))
    expect(await screen.findByText('No listings with status “Paused”.')).toBeInTheDocument()
    expect(screen.queryByText('You have no listings yet.')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Show all' }))
    await waitFor(() => expect(calls.filter(isList).at(-1)!.search.has('status')).toBe(false))
  })

  it('has its own empty copy for the Archived tab', async () => {
    stubVendorApi('VENDOR', (call) => (isList(call) ? listOf() : undefined))
    renderApp('/vendor/placements')

    await userEvent.setup().click(await screen.findByRole('tab', { name: 'Archived' }))
    expect(
      await screen.findByText('Archived listings appear here. You can restore them at any time.'),
    ).toBeInTheDocument()
  })

  it('paginates: Next asks for page 2 and Previous goes back', async () => {
    const { calls } = stubVendorApi('VENDOR', (call) =>
      isList(call) ? json(200, { placements: [vendorPlacement()], total: 45 }) : undefined,
    )
    renderApp('/vendor/placements')
    const user = userEvent.setup()

    expect(await screen.findByText('Page 1 of 3')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(await screen.findByText('Page 2 of 3')).toBeInTheDocument()
    expect(calls.filter(isList).at(-1)!.search.get('page')).toBe('2')

    await user.click(screen.getByRole('button', { name: 'Previous' }))
    expect(await screen.findByText('Page 1 of 3')).toBeInTheDocument()
  })

  it('hides pagination when everything fits on one page', async () => {
    stubVendorApi('VENDOR', (call) => (isList(call) ? listOf(vendorPlacement()) : undefined))
    renderApp('/vendor/placements')

    await screen.findByText('Chilonzor billboard')
    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument()
  })

  it('shows an error card with Try again when the list fails', async () => {
    let fail = true
    stubVendorApi('VENDOR', (call) => {
      if (!isList(call)) return undefined
      return fail ? json(500, { error: 'boom', code: 'INTERNAL' }) : listOf(vendorPlacement())
    })
    renderApp('/vendor/placements')

    expect(
      await screen.findByText('Couldn’t load your listings.'.replace('’', "'")),
    ).toBeInTheDocument()
    fail = false
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Chilonzor billboard')).toBeInTheDocument()
  })

  describe('row actions follow the status', () => {
    const menuFor = async (status: PlacementStatus) => {
      stubVendorApi('VENDOR', (call) =>
        isList(call) ? listOf(vendorPlacement({ status })) : undefined,
      )
      renderApp('/vendor/placements')
      await openActions('Chilonzor billboard')
      return screen.findAllByRole('menuitem')
    }
    const names = (items: HTMLElement[]) => items.map((item) => item.textContent)

    it('ACTIVE: edit, pause, archive', async () => {
      expect(names(await menuFor('ACTIVE'))).toEqual(['Edit', 'Pause', 'Archive'])
    })
    it('INACTIVE: edit, resume, archive', async () => {
      expect(names(await menuFor('INACTIVE'))).toEqual(['Edit', 'Resume', 'Archive'])
    })
    it('PENDING_REVIEW: edit, archive', async () => {
      expect(names(await menuFor('PENDING_REVIEW'))).toEqual(['Edit', 'Archive'])
    })
    it('ARCHIVED: restore only', async () => {
      expect(names(await menuFor('ARCHIVED'))).toEqual(['Restore'])
    })
  })

  it('links Edit to the editor for that listing', async () => {
    stubVendorApi('VENDOR', (call) => (isList(call) ? listOf(vendorPlacement()) : undefined))
    renderApp('/vendor/placements')
    await openActions('Chilonzor billboard')

    expect(await screen.findByRole('menuitem', { name: 'Edit' })).toHaveAttribute(
      'href',
      `/vendor/placements/${PLACEMENT_ID}/edit`,
    )
  })

  it('pauses without asking, then refetches and confirms with a toast', async () => {
    let status: 'ACTIVE' | 'INACTIVE' = 'ACTIVE'
    const { calls } = stubVendorApi('VENDOR', (call) => {
      if (isList(call)) return listOf(vendorPlacement({ status }))
      if (call.method === 'POST' && call.path === `${LIST}/${PLACEMENT_ID}/pause`) {
        status = 'INACTIVE'
        return json(200, { placement: vendorPlacement({ status }) })
      }
      return undefined
    })
    renderApp('/vendor/placements')
    const user = await openActions('Chilonzor billboard')

    await user.click(await screen.findByRole('menuitem', { name: 'Pause' }))

    expect(await screen.findByText('Listing paused.')).toBeInTheDocument()
    expect(calls.some((call) => call.path.endsWith('/pause'))).toBe(true)
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    await waitFor(() =>
      expect(within(screen.getAllByRole('row')[1]!).getByText('Paused')).toBeInTheDocument(),
    )
  })

  it('resumes a paused listing', async () => {
    const { calls } = stubVendorApi('VENDOR', (call) => {
      if (isList(call)) return listOf(vendorPlacement({ status: 'INACTIVE' }))
      if (call.path.endsWith('/resume')) return json(200, { placement: vendorPlacement() })
      return undefined
    })
    renderApp('/vendor/placements')
    const user = await openActions('Chilonzor billboard')

    await user.click(await screen.findByRole('menuitem', { name: 'Resume' }))

    expect(await screen.findByText('Listing is live again.')).toBeInTheDocument()
    expect(calls.filter((call) => call.path.endsWith('/resume'))).toHaveLength(1)
  })

  describe('archive confirmation', () => {
    function stubArchive() {
      return stubVendorApi('VENDOR', (call) => {
        if (isList(call)) return listOf(vendorPlacement())
        if (call.path === `${LIST}/${PLACEMENT_ID}/archive`) {
          return json(200, {
            placement: vendorPlacement({ status: 'ARCHIVED', archivedAt: '2026-10-29T00:00:00Z' }),
          })
        }
        return undefined
      })
    }

    it('asks first, and Cancel does nothing', async () => {
      const { calls } = stubArchive()
      renderApp('/vendor/placements')
      const user = await openActions('Chilonzor billboard')
      await user.click(await screen.findByRole('menuitem', { name: 'Archive' }))

      const dialog = await screen.findByRole('alertdialog', { name: 'Archive this listing?' })
      expect(dialog).toHaveTextContent('“Chilonzor billboard” will disappear from the map')
      // Cancel is the safe default.
      expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus()

      await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
      await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
      expect(calls.some((call) => call.method === 'POST')).toBe(false)
    })

    it('confirming calls the API once and shows "Archiving…" while it runs', async () => {
      let release: () => void = () => {}
      const gate = new Promise<void>((resolve) => (release = resolve))
      const { calls } = stubVendorApi('VENDOR', async (call) => {
        if (isList(call)) return listOf(vendorPlacement())
        if (call.path.endsWith('/archive')) {
          await gate
          return json(200, {
            placement: vendorPlacement({ status: 'ARCHIVED', archivedAt: '2026-10-29T00:00:00Z' }),
          })
        }
        return undefined
      })
      renderApp('/vendor/placements')
      const user = await openActions('Chilonzor billboard')
      await user.click(await screen.findByRole('menuitem', { name: 'Archive' }))
      const dialog = await screen.findByRole('alertdialog')

      await user.click(within(dialog).getByRole('button', { name: 'Archive' }))

      const busy = await within(dialog).findByRole('button', { name: 'Archiving…' })
      expect(busy).toBeDisabled()
      expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled()
      release()

      expect(await screen.findByText('Listing archived.')).toBeInTheDocument()
      await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
      expect(calls.filter((call) => call.path.endsWith('/archive'))).toHaveLength(1)
    })

    it('closes the dialog and shows the server’s reason when the archive is refused', async () => {
      stubVendorApi('VENDOR', (call) => {
        if (isList(call)) return listOf(vendorPlacement())
        if (call.path.endsWith('/archive')) {
          return json(409, { error: 'Already archived', code: 'LISTING_STATE_INVALID' })
        }
        return undefined
      })
      renderApp('/vendor/placements')
      const user = await openActions('Chilonzor billboard')
      await user.click(await screen.findByRole('menuitem', { name: 'Archive' }))
      await user.click(
        within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Archive' }),
      )

      expect(
        await screen.findByText("This listing can't do that in its current state"),
      ).toBeInTheDocument()
      await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    })
  })

  it('restores an archived listing without a dialog', async () => {
    const { calls } = stubVendorApi('VENDOR', (call) => {
      if (isList(call)) {
        return listOf(vendorPlacement({ status: 'ARCHIVED', archivedAt: '2026-10-01T00:00:00Z' }))
      }
      if (call.path.endsWith('/restore')) {
        return json(200, { placement: vendorPlacement({ status: 'PENDING_REVIEW' }) })
      }
      return undefined
    })
    renderApp('/vendor/placements')
    const user = await openActions('Chilonzor billboard')

    await user.click(await screen.findByRole('menuitem', { name: 'Restore' }))

    expect(
      await screen.findByText('Listing restored. It will be reviewed before it goes live.'),
    ).toBeInTheDocument()
    expect(calls.filter((call) => call.path.endsWith('/restore'))).toHaveLength(1)
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('sends a signed-out session to sign-in when an action answers 401', async () => {
    stubVendorApi('VENDOR', (call) => {
      if (isList(call)) return listOf(vendorPlacement())
      if (call.path.endsWith('/pause')) {
        return json(401, { error: 'Not authenticated', code: 'NOT_AUTHENTICATED' })
      }
      return undefined
    })
    renderApp('/vendor/placements')
    const user = await openActions('Chilonzor billboard')

    await user.click(await screen.findByRole('menuitem', { name: 'Pause' }))

    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent(
        '/sign-in?next=%2Fvendor%2Fplacements',
      ),
    )
  })

  describe('localized', () => {
    it('speaks Russian: tabs, columns, status and a server error code', async () => {
      stubVendorApi('VENDOR', (call) => {
        if (isList(call)) return listOf(vendorPlacement({ status: 'ACTIVE' }))
        if (call.path.endsWith('/pause')) {
          return json(409, { error: 'x', code: 'LISTING_STATE_INVALID' })
        }
        return undefined
      })
      renderApp('/vendor/placements', 'ru')
      const user = userEvent.setup()

      expect(await screen.findByRole('heading', { name: 'Мои объявления' })).toBeInTheDocument()
      await screen.findByText('Chilonzor billboard')
      expect(screen.getByRole('tab', { name: 'На проверке' })).toBeInTheDocument()
      expect(screen.getByRole('columnheader', { name: 'Цена в месяц' })).toBeInTheDocument()
      expect(within(screen.getAllByRole('row')[1]!).getByText('Опубликовано')).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: 'Действия для «Chilonzor billboard»' }))
      await user.click(await screen.findByRole('menuitem', { name: 'Приостановить' }))
      // The code, not the English sentence the server sent.
      expect(
        await screen.findByText('В текущем состоянии с этим объявлением так нельзя'),
      ).toBeInTheDocument()
      expect(screen.queryByText('x')).not.toBeInTheDocument()
    })

    it('speaks Uzbek in the archive dialog', async () => {
      stubVendorApi('VENDOR', (call) => (isList(call) ? listOf(vendorPlacement()) : undefined))
      renderApp('/vendor/placements', 'uz')

      expect(await screen.findByRole('heading', { name: "Mening e'lonlarim" })).toBeInTheDocument()
      await screen.findByText('Chilonzor billboard')
      const user = userEvent.setup()
      await user.click(screen.getByRole('button', { name: 'Chilonzor billboard uchun amallar' }))
      await user.click(await screen.findByRole('menuitem', { name: 'Arxivlash' }))
      expect(
        await screen.findByRole('alertdialog', { name: "Bu e'lon arxivlansinmi?" }),
      ).toBeInTheDocument()
    })
  })
})
