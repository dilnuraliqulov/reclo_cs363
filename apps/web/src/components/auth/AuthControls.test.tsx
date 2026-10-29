import type { Role } from '@reclo/shared'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '@/auth/AuthProvider'
import { AuthControls } from './AuthControls'

function stubSession(role: Role | null) {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          JSON.stringify(
            role
              ? { user: { id: 'u1', email: `${role.toLowerCase()}@example.com`, role } }
              : { error: 'Not authenticated' },
          ),
          { status: role ? 200 : 401, headers: { 'Content-Type': 'application/json' } },
        ),
    ),
  )
}

function renderControls() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AuthProvider>
          <AuthControls />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('AuthControls inquiry history link', () => {
  it('offers a client the way into their history', async () => {
    stubSession('CLIENT')
    renderControls()

    const link = await screen.findByRole('link', { name: 'My inquiries' })
    expect(link).toHaveAttribute('href', '/inquiries')
  })

  it.each(['VENDOR', 'ADMIN'] as const)(
    'does not offer the link to a %s, whose inquiries live elsewhere',
    async (role) => {
      stubSession(role)
      renderControls()

      // Wait for the session before asserting on an absence, or this passes while still loading.
      await screen.findByRole('button', { name: 'Sign out' })
      expect(screen.queryByRole('link', { name: 'My inquiries' })).not.toBeInTheDocument()
    },
  )

  it('shows no link to a signed-out visitor', async () => {
    stubSession(null)
    renderControls()

    await screen.findByRole('link', { name: 'Sign in' })
    expect(screen.queryByRole('link', { name: 'My inquiries' })).not.toBeInTheDocument()
  })
})

describe('AuthControls vendor link', () => {
  it('offers a vendor My listings, and no inquiry history', async () => {
    stubSession('VENDOR')
    renderControls()

    const link = await screen.findByRole('link', { name: 'My listings' })
    expect(link).toHaveAttribute('href', '/vendor/placements')
    expect(screen.queryByRole('link', { name: 'My inquiries' })).not.toBeInTheDocument()
  })

  it.each<Role>(['CLIENT', 'ADMIN'])('does not offer %s My listings', async (role) => {
    stubSession(role)
    renderControls()

    await screen.findByText(`${role.toLowerCase()}@example.com`)
    expect(screen.queryByRole('link', { name: 'My listings' })).not.toBeInTheDocument()
  })

  it('does not offer a signed-out visitor My listings', async () => {
    stubSession(null)
    renderControls()

    await screen.findByRole('link', { name: 'Sign in' })
    expect(screen.queryByRole('link', { name: 'My listings' })).not.toBeInTheDocument()
  })
})
