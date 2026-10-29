import type { Role } from '@reclo/shared'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '@/auth/AuthProvider'
import { RequireRole } from './RequireRole'

function stubSession(role: Role | null) {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          JSON.stringify(
            role ? { user: { id: 'u1', email: 'u@example.com', role } } : { error: 'Nope' },
          ),
          { status: role ? 200 : 401, headers: { 'Content-Type': 'application/json' } },
        ),
    ),
  )
}

function Landed() {
  const location = useLocation()
  return <span data-testid="landed">{`${location.pathname}${location.search}`}</span>
}

function renderGuarded() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/admin/vendors']}>
        <AuthProvider>
          <Routes>
            <Route element={<RequireRole role="ADMIN" />}>
              <Route path="/admin/vendors" element={<span>admin content</span>} />
            </Route>
            <Route path="*" element={<Landed />} />
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
  it('renders the route for the matching role', async () => {
    stubSession('ADMIN')
    renderGuarded()

    expect(await screen.findByText('admin content')).toBeInTheDocument()
  })

  it.each(['CLIENT', 'VENDOR'] as const)('sends a %s home', async (role) => {
    stubSession(role)
    renderGuarded()

    expect(await screen.findByTestId('landed')).toHaveTextContent(/^\/$/)
    expect(screen.queryByText('admin content')).not.toBeInTheDocument()
  })

  it('sends a signed-out visitor to sign-in, with next pointing back', async () => {
    stubSession(null)
    renderGuarded()

    expect(await screen.findByTestId('landed')).toHaveTextContent(
      `/sign-in?next=${encodeURIComponent('/admin/vendors')}`,
    )
  })
})
