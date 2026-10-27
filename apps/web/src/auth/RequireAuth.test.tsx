import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '@/auth/AuthProvider'
import { RequireAuth } from './RequireAuth'

const signedInUser = { id: 'u1', email: 'client@example.com', role: 'CLIENT' }

function stubAuth(signedIn: boolean) {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          JSON.stringify(signedIn ? { user: signedInUser } : { error: 'Not authenticated' }),
          { status: signedIn ? 200 : 401, headers: { 'Content-Type': 'application/json' } },
        ),
    ),
  )
}

/** Shows where the router ended up, so a redirect is readable in a test. */
function SignInProbe() {
  const location = useLocation()
  return <span data-testid="landed">{`${location.pathname}${location.search}`}</span>
}

function renderGuarded(entry: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[entry]}>
        <AuthProvider>
          <Routes>
            <Route element={<RequireAuth />}>
              <Route path="/inquiries" element={<span>guarded content</span>} />
            </Route>
            <Route path="/sign-in" element={<SignInProbe />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('RequireAuth', () => {
  it('renders the route for a signed-in user', async () => {
    stubAuth(true)
    renderGuarded('/inquiries')

    expect(await screen.findByText('guarded content')).toBeInTheDocument()
  })

  it('sends a signed-out visitor to sign-in, with next pointing back', async () => {
    stubAuth(false)
    renderGuarded('/inquiries')

    expect(await screen.findByTestId('landed')).toHaveTextContent('/sign-in?next=%2Finquiries')
  })

  it('keeps the query string in next, so the page is restored as it was', async () => {
    stubAuth(false)
    renderGuarded('/inquiries?status=RESPONDED')

    expect(await screen.findByTestId('landed')).toHaveTextContent(
      '/sign-in?next=%2Finquiries%3Fstatus%3DRESPONDED',
    )
  })

  it('renders nothing while the session is still loading, rather than flashing a redirect', () => {
    // A fetch that never settles leaves the provider in its loading state.
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => {})),
    )
    renderGuarded('/inquiries')

    expect(screen.queryByText('guarded content')).not.toBeInTheDocument()
    expect(screen.queryByTestId('landed')).not.toBeInTheDocument()
  })
})
