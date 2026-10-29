import type { Role } from '@reclo/shared'
import { screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderApp } from '@/test/render-app'
import { json, stubVendorApi } from '@/test/vendor-api'

const ROUTES = ['/vendor/placements', '/vendor/placements/new', '/vendor/placements/abc/edit']

function stub(role: Role | null) {
  return stubVendorApi(role, (call) => {
    if (call.path === '/api/placements/map') return json(200, { markers: [], total: 0 })
    if (call.path === '/api/vendor/placements') return json(200, { placements: [], total: 0 })
    return json(404, { error: 'Placement not found', code: 'PLACEMENT_NOT_FOUND' })
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('vendor routes guard', () => {
  it.each(ROUTES)('lets a vendor into %s', async (path) => {
    const { calls } = stub('VENDOR')
    renderApp(path)

    // Only a vendor sees the header link, and a redirect would have changed the location.
    expect((await screen.findAllByRole('link', { name: 'My listings' })).length).toBeGreaterThan(0)
    expect(screen.getByTestId('location')).toHaveTextContent(path)
    expect(calls.some((call) => call.path === '/api/placements/map')).toBe(false)
  })

  it.each(ROUTES)('sends a client away from %s to /', async (path) => {
    const { calls } = stub('CLIENT')
    renderApp(path)

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/))
    expect(calls.some((call) => call.path.startsWith('/api/vendor'))).toBe(false)
  })

  it.each(ROUTES)('sends an admin away from %s to /', async (path) => {
    const { calls } = stub('ADMIN')
    renderApp(path)

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/))
    expect(calls.some((call) => call.path.startsWith('/api/vendor'))).toBe(false)
  })

  it('sends a signed-out visitor to sign-in, remembering where they were going', async () => {
    stub(null)
    renderApp('/vendor/placements/new')

    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent(
        '/sign-in?next=%2Fvendor%2Fplacements%2Fnew',
      ),
    )
  })
})
