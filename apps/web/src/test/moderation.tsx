import type { AdminPlacementDetail, AdminPlacementSummary, Locale, PublicUser } from '@reclo/shared'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { vi } from 'vitest'
import { AuthProvider } from '@/auth/AuthProvider'
import { RequireRole } from '@/auth/RequireRole'
import { Toaster } from '@/components/ui/sonner'
import { LocaleProvider } from '@/i18n/LocaleProvider'
import { ModerationPage } from '@/pages/ModerationPage'
import { pinLocale } from './locale'

export const ADMIN: PublicUser = { id: 'admin-1', email: 'admin@example.com', role: 'ADMIN' }
export const UPDATED_AT = '2026-10-26T10:00:00.000Z'

export function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** A real uuid per index: the client parses responses with the shared schemas, which check it. */
export const idOf = (index: number) => `8f1e2bb6-6ad8-4a2e-9f6e-1c2f6f2a31a${index}`

export function summary(
  index: number,
  overrides: Partial<AdminPlacementSummary> = {},
): AdminPlacementSummary {
  return {
    id: idOf(index),
    title: `Billboard ${index}`,
    type: 'BILLBOARD',
    city: 'Tashkent',
    pricePerMonth: 5_000_000,
    status: 'PENDING_REVIEW',
    cover: `https://api.example.com/uploads/${index}.jpg`,
    photoCount: 1,
    vendorName: 'vendor',
    updatedAt: UPDATED_AT,
    ...overrides,
  }
}

export function detail(
  index: number,
  overrides: Partial<AdminPlacementDetail> = {},
): AdminPlacementDetail {
  return {
    id: idOf(index),
    title: `Billboard ${index}`,
    type: 'BILLBOARD',
    status: 'PENDING_REVIEW',
    latitude: 41.311,
    longitude: 69.279,
    address: 'Amir Temur Ave 10',
    city: 'Tashkent',
    pricePerMonth: 5_000_000,
    tier: 'SILVER',
    description: 'Facing the main road',
    width: 6,
    height: 3,
    lighting: true,
    ledDurationSeconds: null,
    ledPlaysPerDay: null,
    photos: [`https://api.example.com/uploads/${index}.jpg`],
    photo: `https://api.example.com/uploads/${index}.jpg`,
    vendorId: 'vendor-1',
    createdAt: '2026-10-20T10:00:00.000Z',
    updatedAt: UPDATED_AT,
    archivedAt: null,
    vendor: { id: 'vendor-1', name: 'vendor', email: 'vendor@example.com' },
    events: [],
    ...overrides,
  }
}

export interface AdminApiState {
  list: AdminPlacementSummary[]
  details: Record<string, AdminPlacementDetail>
  /** Every request the page made, as "METHOD /path?query" plus the parsed body. */
  calls: { key: string; body?: unknown }[]
  user: PublicUser | null
}

type Handler = (request: { url: URL; body: unknown }) => Response | undefined

/**
 * A fake API for the admin screens. `override` runs first and wins when it answers, so a test can
 * make one route fail or race without rebuilding the rest.
 */
export function stubAdminApi(
  initial: {
    list?: AdminPlacementSummary[]
    details?: AdminPlacementDetail[]
    user?: PublicUser | null
  },
  override?: Handler,
) {
  const state: AdminApiState = {
    list: initial.list ?? [],
    details: Object.fromEntries((initial.details ?? []).map((d) => [d.id, d])),
    calls: [],
    user: initial.user === undefined ? ADMIN : initial.user,
  }
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input))
    const method = init?.method ?? 'GET'
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined
    if (url.pathname === '/api/auth/me') {
      return state.user
        ? json(200, { user: state.user })
        : json(401, { error: 'x', code: 'NOT_AUTHENTICATED' })
    }
    state.calls.push({ key: `${method} ${url.pathname}${url.search}`, body })
    const overridden = override?.({ url, body })
    if (overridden) return overridden

    if (url.pathname === '/api/admin/placements') {
      const status = url.searchParams.get('status') ?? 'PENDING_REVIEW'
      const placements = state.list.filter((p) => p.status === status)
      return json(200, { placements, total: placements.length })
    }
    const match = /^\/api\/admin\/placements\/([^/]+)(?:\/(approve|reject))?$/.exec(url.pathname)
    if (match) {
      const found = state.details[match[1]!]
      if (!found) return json(404, { error: 'Placement not found', code: 'PLACEMENT_NOT_FOUND' })
      if (!match[2]) return json(200, { placement: found })
      const decided = { ...found, status: match[2] === 'approve' ? 'ACTIVE' : 'REJECTED' }
      state.details[found.id] = decided as AdminPlacementDetail
      state.list = state.list.filter((p) => p.id !== found.id)
      return json(200, { placement: decided })
    }
    throw new Error(`unexpected fetch: ${method} ${url.pathname}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  return { state, fetchMock }
}

/** The page under its real guard and route, so navigation between list and detail is exercised. */
export function renderModeration(entry = '/admin/moderation', locale: Locale = 'en') {
  pinLocale(locale)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <LocaleProvider>
        <MemoryRouter initialEntries={[entry]}>
          <AuthProvider>
            <Routes>
              <Route element={<RequireRole role="ADMIN" />}>
                <Route path="/admin/moderation/:id?" element={<ModerationPage />} />
              </Route>
              <Route path="/" element={<span>home page</span>} />
              <Route path="/sign-in" element={<span>sign-in page</span>} />
            </Routes>
          </AuthProvider>
        </MemoryRouter>
        <Toaster />
      </LocaleProvider>
    </QueryClientProvider>,
  )
}
