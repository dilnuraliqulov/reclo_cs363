import type { InquiryHistoryItem, Locale } from '@reclo/shared'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '@/auth/AuthProvider'
import { LocaleProvider } from '@/i18n/LocaleProvider'
import { pinLocale } from '@/test/locale'
import { InquiryHistoryPage } from './InquiryHistoryPage'

/**
 * One whole screen in each language. The catalog tests prove every key resolves; these prove the
 * keys are wired to the right places — a page that type-checks can still read `t('auth.signIn')`
 * over its heading, and only a rendered screen catches that.
 */

const PLACEMENT_ID = 'b1e0696a-54c3-4d40-84c4-f2a89326e680'
const signedInUser = { id: 'u1', email: 'client@example.com', role: 'CLIENT' }

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function historyItem(overrides: Partial<InquiryHistoryItem> = {}): InquiryHistoryItem {
  return {
    id: '8f1e2bb6-6ad8-4a2e-9f6e-1c2f6f2a31a0',
    placementId: PLACEMENT_ID,
    status: 'NEW',
    message: 'Campaign enquiry',
    contactName: 'Aziza Karimova',
    contactPhone: '+998901234567',
    contactEmail: 'aziza@example.com',
    desiredStartDate: null,
    durationMonths: null,
    createdAt: '2026-10-26T10:00:00.000Z',
    placement: {
      id: PLACEMENT_ID,
      title: 'Amir Temur Billboard',
      city: 'Tashkent',
      type: 'BILLBOARD',
      isViewable: true,
    },
    ...overrides,
  }
}

/** Answers the history request with `history`, or with an error body when one is given. */
function stubApi(history: { status: number; body: unknown }) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const { pathname } = new URL(String(input))
      if (pathname === '/api/auth/me') return json(200, { user: signedInUser })
      if (pathname === '/api/inquiries') return json(history.status, history.body)
      throw new Error(`unexpected fetch: ${pathname}`)
    }),
  )
}

/** The one inquiry row, found through its trigger: tabs and skeletons are list items too. */
async function inquiryRow(): Promise<HTMLElement> {
  const trigger = await screen.findByRole('button', { name: /Amir Temur Billboard/ })
  const row = trigger.closest('li')
  if (!row) throw new Error('no inquiry row on the page')
  return row
}

function renderPage(locale: Locale) {
  pinLocale(locale)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <LocaleProvider>
        <MemoryRouter initialEntries={['/inquiries']}>
          <AuthProvider>
            <InquiryHistoryPage />
          </AuthProvider>
        </MemoryRouter>
      </LocaleProvider>
    </QueryClientProvider>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('the inquiry history page in Uzbek', () => {
  it('renders its heading, filters, status and date in Uzbek', async () => {
    stubApi({
      status: 200,
      body: { inquiries: [historyItem({ durationMonths: 3 })], nextCursor: null },
    })
    renderPage('uz')

    expect(await screen.findByRole('heading', { name: "So'rovlaringiz" })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Barchasi' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Javob berildi' })).toBeInTheDocument()

    // Scoped to the row: the filter tabs carry the same status labels.
    const row = await inquiryRow()
    expect(within(row).getByText('Yuborildi')).toBeInTheDocument()
    // Uzbek writes the month short and hyphenated, and the day leads.
    expect(within(row).getByText('26-okt, 2026')).toBeInTheDocument()
  })

  it('expands a row into Uzbek labels, keeping the vendor-authored content as written', async () => {
    const user = userEvent.setup()
    stubApi({
      status: 200,
      body: { inquiries: [historyItem({ durationMonths: 3 })], nextCursor: null },
    })
    renderPage('uz')

    await user.click(await screen.findByRole('button', { name: /Amir Temur Billboard/ }))

    expect(screen.getByText('Xabar')).toBeInTheDocument()
    expect(screen.getByText('Aloqa')).toBeInTheDocument()
    // Uzbek has one form for a counted noun, so 3 reads the same way 1 does.
    expect(screen.getByText('Muddat: 3 oy')).toBeInTheDocument()
    // The placement's own title is the vendor's text and stays in whatever they typed.
    expect(screen.getAllByText('Amir Temur Billboard').length).toBeGreaterThan(0)
  })

  it('shows the Uzbek empty state when nothing has been sent', async () => {
    stubApi({ status: 200, body: { inquiries: [], nextCursor: null } })
    renderPage('uz')

    expect(await screen.findByText("Siz hali hech qanday so'rov yubormadingiz")).toBeInTheDocument()
    expect(screen.getByRole('link', { name: "Joylarni ko'rish" })).toBeInTheDocument()
  })
})

describe('the inquiry history page in Russian', () => {
  it('renders its heading, filters, status and date in Russian', async () => {
    stubApi({ status: 200, body: { inquiries: [historyItem()], nextCursor: null } })
    renderPage('ru')

    expect(await screen.findByRole('heading', { name: 'Ваши заявки' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Все' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Получен ответ' })).toBeInTheDocument()

    const row = await inquiryRow()
    expect(within(row).getByText('Отправлена')).toBeInTheDocument()
    expect(within(row).getByText('26 окт. 2026 г.')).toBeInTheDocument()
  })

  it.each([
    [1, '1 месяц'],
    [3, '3 месяца'],
    [5, '5 месяцев'],
    [21, '21 месяц'],
  ])('writes a %i-month campaign as "%s"', async (months, expected) => {
    const user = userEvent.setup()
    stubApi({
      status: 200,
      body: { inquiries: [historyItem({ durationMonths: months })], nextCursor: null },
    })
    renderPage('ru')

    await user.click(await screen.findByRole('button', { name: /Amir Temur Billboard/ }))

    // The whole reason the catalog counts rather than branching on `=== 1`.
    expect(screen.getByText(`Срок: ${expected}`)).toBeInTheDocument()
  })

  it('reads a server error code as a Russian sentence, not as the code', async () => {
    stubApi({
      status: 429,
      body: { error: 'Too many requests, please try again later', code: 'RATE_LIMITED' },
    })
    renderPage('ru')

    expect(await screen.findByText('Не удалось загрузить ваши заявки')).toBeInTheDocument()
    expect(screen.getByText('Слишком много попыток, попробуйте позже')).toBeInTheDocument()
    expect(screen.queryByText(/RATE_LIMITED/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Попробовать снова' })).toBeInTheDocument()
  })

  it('falls back to the response sentence for a code this build does not know', async () => {
    // A newer API. The reader gets English rather than a token or a generic apology — the one
    // case where the server's own sentence is the best thing available.
    stubApi({
      status: 503,
      body: { error: 'Inquiry service is restarting', code: 'SERVICE_RESTARTING' },
    })
    renderPage('ru')

    expect(await screen.findByText('Inquiry service is restarting')).toBeInTheDocument()
    expect(screen.queryByText(/SERVICE_RESTARTING/)).not.toBeInTheDocument()
  })
})

describe('switching language on the page', () => {
  it('swaps the rendered strings and sets <html lang> without refetching', async () => {
    const user = userEvent.setup()
    stubApi({ status: 200, body: { inquiries: [historyItem()], nextCursor: null } })
    renderPage('uz')

    expect(await screen.findByRole('heading', { name: "So'rovlaringiz" })).toBeInTheDocument()
    expect(document.documentElement.lang).toBe('uz')

    await user.click(screen.getByRole('combobox'))
    await user.click(await screen.findByRole('option', { name: 'Русский' }))

    expect(screen.getByRole('heading', { name: 'Ваши заявки' })).toBeInTheDocument()
    expect(within(await inquiryRow()).getByText('Отправлена')).toBeInTheDocument()
    expect(document.documentElement.lang).toBe('ru')
  })
})
