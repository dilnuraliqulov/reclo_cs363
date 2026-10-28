import type { Locale, PlacementMarker } from '@reclo/shared'
import { MESSAGE_MIN_LENGTH, VALIDATION_CODES } from '@reclo/shared'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '@/auth/AuthProvider'
import { Toaster } from '@/components/ui/sonner'
import { LocaleProvider } from '@/i18n/LocaleProvider'
import { pinLocale } from '@/test/locale'
import { InquiryFormDialog } from './InquiryFormDialog'

/**
 * The form is where a code coming back from the API becomes a sentence a client reads, so it is
 * where the KAN-77 wire format and the KAN-78 catalogs have to meet. These run in Russian, the
 * locale with the most ways to get a count wrong.
 */

const placement: PlacementMarker = {
  id: 'b1e0696a-54c3-4d40-84c4-f2a89326e680',
  title: 'Amir Temur Billboard',
  type: 'BILLBOARD',
  status: 'ACTIVE',
  latitude: 41.311,
  longitude: 69.279,
  address: 'Amir Temur Ave 10',
  city: 'Tashkent',
  pricePerMonth: 5_000_000,
}

const signedInUser = { id: 'u1', email: 'client@example.com', role: 'CLIENT' }

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function stubApi(onPost?: () => Response) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const { pathname } = new URL(String(input))
      if (pathname === '/api/auth/me') return json(200, { user: signedInUser })
      if (pathname === '/api/inquiries') {
        return onPost ? onPost() : json(201, { inquiry: null })
      }
      throw new Error(`unexpected fetch: ${pathname}`)
    }),
  )
}

function renderDialog(locale: Locale) {
  pinLocale(locale)
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <LocaleProvider>
        <MemoryRouter initialEntries={['/placements']}>
          <AuthProvider>
            <InquiryFormDialog placement={placement} open onOpenChange={vi.fn()} />
            <Toaster />
          </AuthProvider>
        </MemoryRouter>
      </LocaleProvider>
    </QueryClientProvider>,
  )
}

/** Fills the three always-required fields. `delay: null` keeps a long message under the timeout. */
async function fillRequiredFields(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText('Ваше имя'), 'Азиза Каримова')
  await user.type(screen.getByLabelText('Телефон'), '+998901234567')
  await user.type(screen.getByLabelText('Сообщение'), 'п'.repeat(MESSAGE_MIN_LENGTH))
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('the inquiry form in Russian', () => {
  it('labels its fields and buttons in Russian', async () => {
    stubApi()
    renderDialog('ru')

    expect(await screen.findByLabelText('Ваше имя')).toBeInTheDocument()
    expect(screen.getByLabelText('Телефон')).toBeInTheDocument()
    expect(screen.getByText('Продавцы обычно отвечают в Telegram')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Отправить заявку' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Отмена' })).toBeInTheDocument()
  })

  it('counts the duration options the way Russian counts', async () => {
    const user = userEvent.setup({ delay: null })
    stubApi()
    renderDialog('ru')

    await user.click(await screen.findByLabelText('Срок'))

    expect(await screen.findByRole('option', { name: '1 месяц' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: '3 месяца' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: '6 месяцев' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: '12 месяцев' })).toBeInTheDocument()
  })

  it('reads a 409 DUPLICATE_INQUIRY as a Russian sentence naming the earlier date', async () => {
    const user = userEvent.setup({ delay: null })
    stubApi(() =>
      json(409, {
        error: 'You already have an open inquiry for this placement',
        code: 'DUPLICATE_INQUIRY',
        existingInquiryCreatedAt: '2026-10-20T08:00:00.000Z',
      }),
    )
    renderDialog('ru')
    await fillRequiredFields(user)

    await user.click(screen.getByRole('button', { name: 'Отправить заявку' }))

    expect(
      await screen.findByText(
        'У вас уже есть открытая заявка на эту площадку, отправлена 20 окт. 2026 г..',
      ),
    ).toBeInTheDocument()
    // Retrying cannot succeed, so the submit stays shut.
    expect(screen.getByRole('button', { name: 'Отправить заявку' })).toBeDisabled()
  })

  it('turns a server field code into a Russian field message', async () => {
    const user = userEvent.setup({ delay: null })
    stubApi(() =>
      json(400, {
        error: 'Invalid input',
        code: 'INVALID_INPUT',
        fieldErrors: { contactPhone: [VALIDATION_CODES.phoneUz] },
      }),
    )
    renderDialog('ru')
    await fillRequiredFields(user)

    await user.click(screen.getByRole('button', { name: 'Отправить заявку' }))

    // The code travelled over the wire; the sentence was never on it.
    expect(
      await screen.findByText('Введите корректный узбекский номер, например +998 90 123 45 67'),
    ).toBeInTheDocument()
    expect(screen.queryByText(VALIDATION_CODES.phoneUz)).not.toBeInTheDocument()
  })

  it('turns a locally caught Zod code into the same Russian message', async () => {
    const user = userEvent.setup({ delay: null })
    stubApi()
    renderDialog('ru')
    await user.type(await screen.findByLabelText('Телефон'), '12345')

    await user.click(screen.getByRole('button', { name: 'Отправить заявку' }))

    // Same code, same sentence, whether the schema ran here or on the server.
    expect(
      await screen.findByText('Введите корректный узбекский номер, например +998 90 123 45 67'),
    ).toBeInTheDocument()
  })
})
