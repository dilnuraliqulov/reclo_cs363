import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '@/auth/AuthProvider'
import { GuestOnly } from '@/auth/GuestOnly'
import { LocaleWrapper, pinLocale } from '@/test/locale'
import { SignInPage } from './SignInPage'
import { SignUpPage } from './SignUpPage'

/**
 * KAN-82: the two auth forms against the validation contract of KAN-80/81: shared schema on the
 * client, field codes from the server next to their inputs, one localized message for the rest,
 * and no English in a Uzbek or Russian page.
 */

type Locale = 'en' | 'uz' | 'ru'

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function stubApi(onSubmit: (path: string) => Response | Promise<Response>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const path = new URL(String(input)).pathname
    if (path === '/api/auth/me') return json(401, { error: 'Not authenticated' })
    return onSubmit(path)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function renderAt(path: string, locale: Locale = 'en') {
  pinLocale(locale)
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={[path]}>
        <LocaleWrapper>
          <AuthProvider>
            <Routes>
              <Route element={<GuestOnly />}>
                <Route path="/sign-in" element={<SignInPage />} />
                <Route path="/sign-up" element={<SignUpPage />} />
              </Route>
            </Routes>
          </AuthProvider>
        </LocaleWrapper>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  window.localStorage.clear()
})

const LABELS: Record<Locale, { email: string; password: string }> = {
  en: { email: 'Email', password: 'Password' },
  uz: { email: 'Email', password: 'Parol' },
  ru: { email: 'Эл. почта', password: 'Пароль' },
}

const FORMS = [
  {
    name: 'sign-in',
    path: '/sign-in',
    endpoint: '/api/auth/login',
    button: { en: 'Sign in', ru: 'Войти', uz: 'Kirish' },
  },
  {
    name: 'sign-up',
    path: '/sign-up',
    endpoint: '/api/auth/register',
    button: { en: 'Sign up', ru: 'Регистрация', uz: "Ro'yxatdan o'tish" },
  },
] as const

describe.each(FORMS)('$name form', ({ path, endpoint, button }) => {
  async function fillAndSubmit(locale: Locale) {
    const user = userEvent.setup()
    await user.type(await screen.findByLabelText(LABELS[locale].email), 'user@example.com')
    await user.type(screen.getByLabelText(LABELS[locale].password), 'correct-horse')
    await user.click(screen.getByRole('button', { name: button[locale] }))
  }

  it('validates in Russian, ties each message to its input and sends nothing', async () => {
    const fetchMock = stubApi(() => json(500, { error: 'unreachable' }))
    renderAt(path, 'ru')

    await userEvent.setup().click(await screen.findByRole('button', { name: button.ru }))

    const email = await screen.findByLabelText(LABELS.ru.email)
    expect(email).toHaveAttribute('aria-invalid', 'true')
    const message = document.getElementById(email.getAttribute('aria-describedby')!)
    expect(message).toHaveTextContent('Введите корректную почту')
    expect(message).toHaveAttribute('role', 'alert')
    expect(fetchMock.mock.calls.some(([input]) => String(input).endsWith(endpoint))).toBe(false)
  })

  it('shows a server field error next to its input in Uzbek', async () => {
    stubApi(() =>
      json(400, {
        error: 'Invalid input',
        code: 'INVALID_INPUT',
        fieldErrors: { email: ['validation.email.invalid'] },
      }),
    )
    renderAt(path, 'uz')

    await fillAndSubmit('uz')

    const email = await screen.findByLabelText(LABELS.uz.email)
    await waitFor(() => expect(email).toHaveAttribute('aria-invalid', 'true'))
    expect(document.getElementById(email.getAttribute('aria-describedby')!)).toHaveTextContent(
      "To'g'ri email kiriting",
    )
    expect(screen.queryByTestId('form-error')).not.toBeInTheDocument()
  })

  it.each([
    ['uz', 429, 'RATE_LIMITED', "Juda ko'p urinish, keyinroq qayta urinib ko'ring"],
    ['ru', 500, 'INTERNAL', 'Что-то пошло не так'],
  ] as const)(
    'shows one %s form message for %i and lets the user retry',
    async (locale, status, code, text) => {
      stubApi(() => json(status, { error: 'English from the server', code }))
      renderAt(path, locale)

      await fillAndSubmit(locale)

      const alert = await screen.findByTestId('form-error')
      expect(alert).toHaveTextContent(text)
      expect(alert).not.toHaveTextContent('English from the server')
      expect(screen.getByRole('button', { name: button[locale] })).toBeEnabled()
    },
  )

  it('shows the 429 even when a proxy sent no JSON, without English', async () => {
    stubApi(() => new Response('<html>Too Many Requests</html>', { status: 429 }))
    renderAt(path, 'ru')

    await fillAndSubmit('ru')

    expect(await screen.findByTestId('form-error')).toHaveTextContent(
      'Слишком много попыток, попробуйте позже',
    )
  })

  it('shows a localized message when the network is down', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).endsWith('/api/auth/me')) return json(401, { error: 'no' })
        throw new TypeError('Failed to fetch')
      }),
    )
    renderAt(path, 'ru')

    await fillAndSubmit('ru')

    expect(await screen.findByTestId('form-error')).toHaveTextContent(
      'Не удалось связаться с сервером',
    )
  })

  it('disables submit while pending, and clears the old message on the next attempt', async () => {
    let calls = 0
    stubApi(async () => {
      calls += 1
      if (calls === 1) return json(500, { error: 'x', code: 'INTERNAL' })
      return new Promise<Response>(() => {})
    })
    renderAt(path)

    await fillAndSubmit('en')
    expect(await screen.findByTestId('form-error')).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: button.en }))

    await waitFor(() => expect(screen.queryByTestId('form-error')).not.toBeInTheDocument())
    expect(screen.getByLabelText(LABELS.en.email)).toBeDisabled()
  })
})
