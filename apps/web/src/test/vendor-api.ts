import type { PublicUser, Role, VendorPlacement } from '@reclo/shared'
import { vi } from 'vitest'

export const PLACEMENT_ID = 'b1e0696a-54c3-4d40-84c4-f2a89326e680'

export function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export function vendorPlacement(overrides: Partial<VendorPlacement> = {}): VendorPlacement {
  return {
    id: PLACEMENT_ID,
    title: 'Chilonzor billboard',
    type: 'BILLBOARD',
    status: 'ACTIVE',
    latitude: 41.311,
    longitude: 69.279,
    address: 'Bunyodkor 12',
    city: 'Tashkent',
    pricePerMonth: 2_500_000,
    description: 'Facing the main road',
    width: 6,
    height: 3,
    lighting: true,
    ledDurationSeconds: null,
    ledPlaysPerDay: null,
    tier: 'SILVER',
    photos: [],
    vendorId: 'vendor-1',
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-20T10:00:00.000Z',
    archivedAt: null,
    rejectionReason: null,
    ...overrides,
  }
}

export function photoUrl(index: number, id = PLACEMENT_ID) {
  return `http://localhost:4000/uploads/placements/${id}/0000000${index}-aaaa-4bbb-8ccc-dddddddddddd.jpg`
}

export interface RecordedCall {
  method: string
  path: string
  search: URLSearchParams
  /** The parsed JSON body, the FormData of an upload, or undefined. */
  body: unknown
}

type Handler = (call: RecordedCall) => Response | undefined | Promise<Response | undefined>

/**
 * Stubs `fetch` for the vendor screens: the session answers for `role`, and `handler` answers the
 * rest. A request nobody answers fails the test loudly rather than hanging.
 */
export function stubVendorApi(role: Role | null, handler: Handler = () => undefined) {
  const calls: RecordedCall[] = []
  const user: PublicUser | null = role
    ? { id: 'vendor-1', email: `${role.toLowerCase()}@example.com`, role }
    : null

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input))
    const method = init?.method ?? 'GET'
    if (url.pathname === '/api/auth/me') {
      return user ? json(200, { user }) : json(401, { error: 'Not authenticated' })
    }
    let body: unknown
    if (init?.body instanceof FormData) body = init.body
    else if (typeof init?.body === 'string') body = JSON.parse(init.body)
    const call = { method, path: url.pathname, search: url.searchParams, body }
    calls.push(call)
    const response = await handler(call)
    if (!response) throw new Error(`unexpected fetch: ${method} ${url.pathname}${url.search}`)
    return response
  })
  vi.stubGlobal('fetch', fetchMock)
  return { calls, fetchMock }
}
