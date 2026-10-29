import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '@/auth/AuthProvider'
import { RequireRole } from './RequireRole'

function stubAuth(role: 'CLIENT' | 'VENDOR' | 'ADMIN' | null) {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          JSON.stringify(
            role
              ? { user: { id: 'u1', email: 'a@example.com', role } }
              : { error: 'Not authenticated' },
          ),
          { status: role ? 200 : 401, headers: { 'Content-Type': 'application/json' } },
        ),
    ),
  )
}

function Probe({ label }: { label: string }) {
  const location = useLocation()
  return <span data-testid={label}>{`${location.pathname}${location.search}`}</span>
}

function renderGuarded(entry: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[entry]}>
        <AuthProvider>
          <Routes>
            <Route element={<RequireRole role="ADMIN" />}>
              <Route path="/admin/moderation/:id?" element={<span>admin content</span>} />
            </Route>
            <Route path="/sign-in" element={<Probe label="sign-in" />} />
            <Route path="/" element={<Probe label="home" />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('RequireRole', () => {
  it('shows the screen to the role it names', async () => {
    stubAuth('ADMIN')

    renderGuarded('/admin/moderation')

    expect(await screen.findByText('admin content')).toBeInTheDocument()
  })

  it.each(['CLIENT', 'VENDOR'] as const)('sends a %s home instead of showing it', async (role) => {
    stubAuth(role)

    renderGuarded('/admin/moderation')

    expect(await screen.findByTestId('home')).toBeInTheDocument()
    expect(screen.queryByText('admin content')).not.toBeInTheDocument()
  })

  it('sends a signed-out visitor to sign-in, remembering the path', async () => {
    stubAuth(null)

    renderGuarded('/admin/moderation/abc')

    expect(await screen.findByTestId('sign-in')).toHaveTextContent(
      `/sign-in?next=${encodeURIComponent('/admin/moderation/abc')}`,
    )
  })

  it('renders nothing while the session is still loading', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => {})),
    )

    renderGuarded('/admin/moderation')

    expect(screen.queryByText('admin content')).not.toBeInTheDocument()
    expect(screen.queryByTestId('home')).not.toBeInTheDocument()
    expect(screen.queryByTestId('sign-in')).not.toBeInTheDocument()
  })
})
