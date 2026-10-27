import type { InquiryHistoryItem } from '@reclo/shared'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { InquiryHistoryRow } from './InquiryHistoryRow'

const inquiry: InquiryHistoryItem = {
  id: '8f1e2bb6-6ad8-4a2e-9f6e-1c2f6f2a31a0',
  placementId: 'b1e0696a-54c3-4d40-84c4-f2a89326e680',
  status: 'NEW',
  message: 'We would like to run a two month campaign here.',
  contactName: 'Aziza Karimova',
  contactPhone: '+998901234567',
  contactEmail: 'aziza@example.com',
  desiredStartDate: '2026-11-01',
  durationMonths: 2,
  createdAt: '2026-10-26T10:00:00.000Z',
  placement: {
    id: 'b1e0696a-54c3-4d40-84c4-f2a89326e680',
    title: 'Amir Temur Billboard',
    city: 'Tashkent',
    type: 'BILLBOARD',
    isViewable: true,
  },
}

function renderRow(overrides: Partial<InquiryHistoryItem> = {}) {
  return render(
    <MemoryRouter>
      <ul>
        <InquiryHistoryRow inquiry={{ ...inquiry, ...overrides }} />
      </ul>
    </MemoryRouter>,
  )
}

function trigger() {
  return screen.getByRole('button', { name: /Amir Temur Billboard/ })
}

describe('InquiryHistoryRow', () => {
  it('starts collapsed, showing only the summary', () => {
    renderRow()

    expect(trigger()).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText(inquiry.message)).not.toBeInTheDocument()
  })

  it('expands and collapses again on the same control', async () => {
    const user = userEvent.setup()
    renderRow()

    await user.click(trigger())
    expect(trigger()).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText(inquiry.message)).toBeInTheDocument()

    await user.click(trigger())
    expect(trigger()).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText(inquiry.message)).not.toBeInTheDocument()
  })

  it('opens from the keyboard, since the row is the only way to the detail', async () => {
    const user = userEvent.setup()
    renderRow()

    trigger().focus()
    await user.keyboard('{Enter}')

    expect(trigger()).toHaveAttribute('aria-expanded', 'true')
  })

  it('points aria-controls at the panel it opens', async () => {
    const user = userEvent.setup()
    const { container } = renderRow()

    await user.click(trigger())

    const panelId = trigger().getAttribute('aria-controls')
    expect(panelId).toBeTruthy()
    // A screen reader follows this id, so a mismatch is invisible in a click-only test.
    expect(container.querySelector(`#${CSS.escape(panelId!)}`)).toBeTruthy()
  })

  it('shows the contact details in the form the client typed them', async () => {
    const user = userEvent.setup()
    renderRow()

    await user.click(trigger())

    expect(screen.getByText(/Aziza Karimova/)).toBeInTheDocument()
    // Formatted for reading, not the stored E.164 string.
    expect(screen.getByText(/\+998 90 123 45 67/)).toBeInTheDocument()
    expect(screen.getByText(/aziza@example\.com/)).toBeInTheDocument()
  })

  it('writes a one month campaign in the singular', async () => {
    const user = userEvent.setup()
    renderRow({ durationMonths: 1 })

    await user.click(trigger())

    expect(screen.getByText(/Duration: 1 month$/)).toBeInTheDocument()
  })

  it('drops the campaign line when neither a start date nor a duration was given', async () => {
    const user = userEvent.setup()
    renderRow({ desiredStartDate: null, durationMonths: null })

    await user.click(trigger())

    expect(screen.queryByText('Campaign')).not.toBeInTheDocument()
    expect(screen.getByText(inquiry.message)).toBeInTheDocument()
  })

  it('keeps the start date alone when there is no duration', async () => {
    const user = userEvent.setup()
    renderRow({ durationMonths: null })

    await user.click(trigger())

    expect(screen.getByText(/Preferred start: 1 Nov 2026/)).toBeInTheDocument()
    expect(screen.queryByText(/Duration:/)).not.toBeInTheDocument()
  })

  it('names an unlisted placement rather than linking to a dead map pin', async () => {
    const user = userEvent.setup()
    renderRow({ placement: { ...inquiry.placement!, isViewable: false } })

    await user.click(trigger())

    expect(screen.getByText('This placement is no longer listed')).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('still shows what was sent when the placement row is gone', async () => {
    const user = userEvent.setup()
    renderRow({ placement: null })

    // The placement is the client's own record of where they enquired; losing the listing must not
    // lose the message.
    await user.click(screen.getByRole('button', { name: /Placement removed/ }))

    expect(screen.getByText(inquiry.message)).toBeInTheDocument()
  })
})
