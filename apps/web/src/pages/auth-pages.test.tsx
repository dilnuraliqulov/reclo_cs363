import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '@/auth/AuthProvider'
import { GuestOnly } from '@/auth/GuestOnly'
import { AuthControls } from '@/components/auth/AuthControls'
import { Toaster } from '@/components/ui/sonner'
import { SignInPage } from './SignInPage'
import { SignUpPage } from './SignUpPage'

const user = { id: 'u1', email: 'user@example.com', role: 'CLIENT' }

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

type Handler = (path: string, init: RequestInit) => Response | Promise<Response>

/** Stubs fetch. GET /api/auth/me answers 401 (signed out) unless `handler` says otherwise. */
function stubApi(handler: Handler = () => json(401, { error: 'Not authenticated' })) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const path = new URL(String(input)).pathname
    return handler(path, init)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function renderAt(path: string) {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={[path]}>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<AuthControls />} />
            <Route element={<GuestOnly />}>
              <Route path="/sign-in" element={<SignInPage />} />
              <Route path="/sign-up" element={<SignUpPage />} />
            </Route>
          </Routes>
          <Toaster />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function postsTo(fetchMock: ReturnType<typeof stubApi>, path: string) {
  return fetchMock.mock.calls.filter(
    ([input, init]) => new URL(String(input)).pathname === path && init?.method === 'POST',
  )
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('SignUpPage', () => {
  it('shows validation messages and does not call the API for invalid input', async () => {
    const fetchMock = stubApi()
    renderAt('/sign-up')
    const form = userEvent.setup()

    await form.click(await screen.findByRole('button', { name: 'Sign up' }))

    expect(await screen.findByText('Enter a valid email')).toBeInTheDocument()
    expect(screen.getByText('Password must be at least 8 characters')).toBeInTheDocument()

    await form.type(screen.getByLabelText('Email'), 'user@example.com')
    await form.type(screen.getByLabelText('Password'), 'short')
    await form.click(screen.getByRole('button', { name: 'Sign up' }))

    await waitFor(() => expect(screen.queryByText('Enter a valid email')).not.toBeInTheDocument())
    expect(screen.getByText('Password must be at least 8 characters')).toBeInTheDocument()
    expect(postsTo(fetchMock, '/api/auth/register')).toHaveLength(0)
  })

  it('submits email and password with credentials and goes home on success', async () => {
    const fetchMock = stubApi((path) =>
      path === '/api/auth/register' ? json(201, { user }) : json(401, { error: 'no' }),
    )
    renderAt('/sign-up')
    const form = userEvent.setup()

    await form.type(await screen.findByLabelText('Email'), 'user@example.com')
    await form.type(screen.getByLabelText('Password'), 'correct-horse')
    await form.click(screen.getByRole('button', { name: 'Sign up' }))

    expect(await screen.findByText('Signed in as')).toBeInTheDocument()
    const [call] = postsTo(fetchMock, '/api/auth/register')
    expect(call![1]).toMatchObject({
      method: 'POST',
      credentials: 'include',
      body: JSON.stringify({ email: 'user@example.com', password: 'correct-horse' }),
    })
  })

  it('shows a loading state while the request is pending', async () => {
    let finish: (response: Response) => void = () => {}
    stubApi((path) =>
      path === '/api/auth/register'
        ? new Promise<Response>((resolve) => (finish = resolve))
        : json(401, { error: 'no' }),
    )
    renderAt('/sign-up')
    const form = userEvent.setup()

    await form.type(await screen.findByLabelText('Email'), 'user@example.com')
    await form.type(screen.getByLabelText('Password'), 'correct-horse')
    await form.click(screen.getByRole('button', { name: 'Sign up' }))

    expect(await screen.findByRole('button', { name: 'Creating account…' })).toBeDisabled()
    finish(json(201, { user }))
    expect(await screen.findByText('Signed in as')).toBeInTheDocument()
  })

  it('shows the server error inline, next to the field, when the email is taken', async () => {
    stubApi((path) =>
      path === '/api/auth/register'
        ? json(409, {
            error: 'Email is already registered',
            code: 'EMAIL_TAKEN',
            fieldErrors: { email: ['validation.email.taken'] },
          })
        : json(401, { error: 'no' }),
    )
    renderAt('/sign-up')
    const form = userEvent.setup()

    await form.type(await screen.findByLabelText('Email'), 'user@example.com')
    await form.type(screen.getByLabelText('Password'), 'correct-horse')
    await form.click(screen.getByRole('button', { name: 'Sign up' }))

    // Under the field only: a server error that found its field is not repeated above the form.
    await waitFor(() => expect(screen.getAllByText('Email is already registered')).toHaveLength(1))
    expect(screen.queryByTestId('form-error')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('button', { name: 'Sign up' })).toBeEnabled()
  })

  it('links to the sign-in page', async () => {
    stubApi()
    renderAt('/sign-up')

    expect(await screen.findByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/sign-in')
  })
})

describe('SignInPage', () => {
  it('shows validation messages and does not call the API for invalid input', async () => {
    const fetchMock = stubApi()
    renderAt('/sign-in')
    const form = userEvent.setup()

    await form.click(await screen.findByRole('button', { name: 'Sign in' }))

    expect(await screen.findByText('Enter a valid email')).toBeInTheDocument()
    expect(screen.getByText('Enter your password')).toBeInTheDocument()
    expect(postsTo(fetchMock, '/api/auth/login')).toHaveLength(0)
  })

  it('submits the credentials and goes home on success', async () => {
    const fetchMock = stubApi((path) =>
      path === '/api/auth/login' ? json(200, { user }) : json(401, { error: 'no' }),
    )
    renderAt('/sign-in')
    const form = userEvent.setup()

    await form.type(await screen.findByLabelText('Email'), 'User@Example.com')
    await form.type(screen.getByLabelText('Password'), 'correct-horse')
    await form.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByText('Signed in as')).toBeInTheDocument()
    const [call] = postsTo(fetchMock, '/api/auth/login')
    expect(call![1]).toMatchObject({ credentials: 'include' })
    expect(JSON.parse(call![1]!.body as string)).toEqual({
      email: 'user@example.com',
      password: 'correct-horse',
    })
  })

  it('shows a form-level message when the credentials are wrong', async () => {
    stubApi(() => json(401, { error: 'Invalid email or password', code: 'INVALID_CREDENTIALS' }))
    renderAt('/sign-in')
    const form = userEvent.setup()

    await form.type(await screen.findByLabelText('Email'), 'user@example.com')
    await form.type(screen.getByLabelText('Password'), 'wrong-password')
    await form.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByTestId('form-error')).toHaveTextContent('Invalid email or password')
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled()
  })

  it('shows a form-level message when the server cannot be reached', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).endsWith('/api/auth/me')) return json(401, { error: 'no' })
        throw new TypeError('Failed to fetch')
      }),
    )
    renderAt('/sign-in')
    const form = userEvent.setup()

    await form.type(await screen.findByLabelText('Email'), 'user@example.com')
    await form.type(screen.getByLabelText('Password'), 'correct-horse')
    await form.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByTestId('form-error')).toHaveTextContent(/Cannot reach the server/)
  })

  it('links to the sign-up page', async () => {
    stubApi()
    renderAt('/sign-in')

    expect(await screen.findByRole('link', { name: 'Sign up' })).toHaveAttribute('href', '/sign-up')
  })

  it('redirects a signed-in user away from the page', async () => {
    stubApi((path) => (path === '/api/auth/me' ? json(200, { user }) : json(404, {})))
    renderAt('/sign-in')

    expect(await screen.findByText('Signed in as')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Sign in' })).not.toBeInTheDocument()
  })
})

describe('AuthControls sign out', () => {
  it('signs the user out and shows the sign-in link again', async () => {
    const fetchMock = stubApi((path) => {
      if (path === '/api/auth/me') return json(200, { user })
      if (path === '/api/auth/logout') return new Response(null, { status: 204 })
      return json(404, {})
    })
    renderAt('/')
    const form = userEvent.setup()

    await form.click(await screen.findByRole('button', { name: 'Sign out' }))

    expect(await screen.findByRole('link', { name: 'Sign in' })).toBeInTheDocument()
    expect(postsTo(fetchMock, '/api/auth/logout')).toHaveLength(1)
  })
})
