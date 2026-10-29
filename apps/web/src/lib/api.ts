import {
  adminPlacementListResponseSchema,
  adminPlacementResponseSchema,
  apiErrorSchema,
  authResponseSchema,
  cartResponseSchema,
  createVendorResponseSchema,
  healthResponseSchema,
  inquiryHistoryResponseSchema,
  inquiryResponseSchema,
  mapMarkersResponseSchema,
  placementDetailSchema,
  type AdminPlacementDetail,
  type AdminPlacementListQuery,
  type AdminPlacementListResponse,
  vendorListResponseSchema,
  type ApiError,
  type ApprovePlacementRequest,
  type CartItem,
  type CreateInquiryRequest,
  type CreateVendorRequest,
  type ErrorCode,
  type HealthResponse,
  type Inquiry,
  type InquiryHistoryQuery,
  type InquiryHistoryResponse,
  type LoginRequest,
  type MapBoundsQuery,
  type MapMarkersResponse,
  type PlacementDetail,
  type PublicUser,
  type RegisterRequest,
  type RejectPlacementRequest,
  type VendorSummary,
} from '@reclo/shared'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000'

/** An error response from the API, with the field errors when the server sent them. */
export class ApiRequestError extends Error {
  readonly status: number
  /** Why it failed, as a stable token. The words to show for it live in `lib/messages.ts`. */
  readonly code: ErrorCode | undefined
  readonly fieldErrors: ApiError['fieldErrors']
  /** The raw error body, for routes that answer with more than `error` and `fieldErrors`. */
  readonly body: unknown

  constructor(
    status: number,
    message: string,
    fieldErrors?: ApiError['fieldErrors'],
    body?: unknown,
    code?: ErrorCode,
  ) {
    super(message)
    this.status = status
    this.code = code
    this.fieldErrors = fieldErrors
    this.body = body
  }
}

/** `body` is sent as JSON, unless it is a FormData: then the browser sets the multipart boundary. */
export async function request(
  path: string,
  init: { method: string; body?: unknown },
): Promise<Response> {
  const isForm = init.body instanceof FormData
  let response: Response
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: init.method,
      credentials: 'include',
      headers:
        init.body === undefined || isForm ? undefined : { 'Content-Type': 'application/json' },
      body:
        init.body === undefined
          ? undefined
          : isForm
            ? (init.body as FormData)
            : JSON.stringify(init.body),
    })
  } catch {
    throw new ApiRequestError(0, 'Cannot reach the server. Check your connection and try again.')
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    const parsed = apiErrorSchema.safeParse(body)
    throw new ApiRequestError(
      response.status,
      parsed.success ? parsed.data.error : 'Something went wrong. Please try again.',
      parsed.success ? parsed.data.fieldErrors : undefined,
      body,
      parsed.success ? parsed.data.code : undefined,
    )
  }
  return response
}

async function requestUser(path: string, method: string, body?: unknown): Promise<PublicUser> {
  const response = await request(path, { method, body })
  return authResponseSchema.parse(await response.json()).user
}

export async function fetchHealth(): Promise<HealthResponse> {
  const response = await fetch(`${API_URL}/health`)
  const health = healthResponseSchema.parse(await response.json())
  if (health.status !== 'ok') {
    throw new Error('The API is running but cannot reach the database')
  }
  return health
}

export async function fetchPlacementMarkers(params: MapBoundsQuery): Promise<MapMarkersResponse> {
  const searchParams = new URLSearchParams()
  searchParams.set('minLat', params.minLat.toString())
  searchParams.set('maxLat', params.maxLat.toString())
  searchParams.set('minLng', params.minLng.toString())
  searchParams.set('maxLng', params.maxLng.toString())
  if (params.type) searchParams.set('type', params.type)
  if (params.city) searchParams.set('city', params.city)
  if (params.minPrice !== undefined) searchParams.set('minPrice', params.minPrice.toString())
  if (params.maxPrice !== undefined) searchParams.set('maxPrice', params.maxPrice.toString())
  if (params.ledDurationSeconds !== undefined) {
    searchParams.set('ledDurationSeconds', params.ledDurationSeconds.toString())
  }
  if (params.ledPlaysPerDay !== undefined) {
    searchParams.set('ledPlaysPerDay', params.ledPlaysPerDay.toString())
  }

  const response = await fetch(`${API_URL}/api/placements/map?${searchParams.toString()}`)
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}))
    throw new Error(
      typeof errorBody.error === 'string'
        ? errorBody.error
        : `Failed to fetch map placements (${response.status})`,
    )
  }
  const data = await response.json()
  return mapMarkersResponseSchema.parse(data)
}

export async function fetchPlacementDetail(id: string): Promise<PlacementDetail> {
  const response = await fetch(`${API_URL}/api/placements/${id}`)
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}))
    throw new ApiRequestError(
      response.status,
      typeof errorBody.error === 'string'
        ? errorBody.error
        : `Failed to fetch placement detail (${response.status})`,
    )
  }

  const data = await response.json()
  return placementDetailSchema.parse(data)
}

export const register = (input: RegisterRequest) => requestUser('/api/auth/register', 'POST', input)
export const login = (input: LoginRequest) => requestUser('/api/auth/login', 'POST', input)

export async function logout(): Promise<void> {
  await request('/api/auth/logout', { method: 'POST' })
}

export async function createInquiry(input: CreateInquiryRequest): Promise<Inquiry> {
  const response = await request('/api/inquiries', { method: 'POST', body: input })
  return inquiryResponseSchema.parse(await response.json()).inquiry
}

/**
 * One page of the signed-in client's inquiry history. There is no `clientId` parameter: the server
 * reads it from the session.
 */
export async function fetchInquiryHistory(
  params: Partial<InquiryHistoryQuery> = {},
): Promise<InquiryHistoryResponse> {
  const searchParams = new URLSearchParams()
  if (params.status) searchParams.set('status', params.status)
  if (params.cursor) searchParams.set('cursor', params.cursor)
  if (params.limit !== undefined) searchParams.set('limit', params.limit.toString())

  const query = searchParams.toString()
  const response = await request(`/api/inquiries${query ? `?${query}` : ''}`, { method: 'GET' })
  return inquiryHistoryResponseSchema.parse(await response.json())
}

/** The signed-in user, or null when there is no valid session. */
export async function fetchMe(): Promise<PublicUser | null> {
  try {
    return await requestUser('/api/auth/me', 'GET')
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 401) return null
    throw error
  }
}

/** One page of the moderation queue (or any other status, to look a listing up). */
export async function fetchAdminPlacements(
  params: Partial<AdminPlacementListQuery> = {},
): Promise<AdminPlacementListResponse> {
  const searchParams = new URLSearchParams()
  if (params.status) searchParams.set('status', params.status)
  if (params.type) searchParams.set('type', params.type)
  if (params.city) searchParams.set('city', params.city)
  if (params.page !== undefined) searchParams.set('page', params.page.toString())
  if (params.pageSize !== undefined) searchParams.set('pageSize', params.pageSize.toString())

  const query = searchParams.toString()
  const response = await request(`/api/admin/placements${query ? `?${query}` : ''}`, {
    method: 'GET',
  })
  return adminPlacementListResponseSchema.parse(await response.json())
}

export async function fetchAdminPlacement(id: string): Promise<AdminPlacementDetail> {
  const response = await request(`/api/admin/placements/${id}`, { method: 'GET' })
  return adminPlacementResponseSchema.parse(await response.json()).placement
}

export async function approvePlacement(
  id: string,
  input: ApprovePlacementRequest,
): Promise<AdminPlacementDetail> {
  const response = await request(`/api/admin/placements/${id}/approve`, {
    method: 'POST',
    body: input,
  })
  return adminPlacementResponseSchema.parse(await response.json()).placement
}

export async function rejectPlacement(
  id: string,
  input: RejectPlacementRequest,
): Promise<AdminPlacementDetail> {
  const response = await request(`/api/admin/placements/${id}/reject`, {
    method: 'POST',
    body: input,
  })
  return adminPlacementResponseSchema.parse(await response.json()).placement
}

/** Admin only: creates a vendor account. The admin stays signed in as themselves. */
export async function createVendor(input: CreateVendorRequest): Promise<VendorSummary> {
  const response = await request('/api/admin/vendors', { method: 'POST', body: input })
  return createVendorResponseSchema.parse(await response.json()).vendor
}

/** Admin only: vendor accounts, newest first. */
export async function fetchVendors(): Promise<VendorSummary[]> {
  const response = await request('/api/admin/vendors', { method: 'GET' })
  return vendorListResponseSchema.parse(await response.json()).vendors
}

async function requestCart(path: string, method: string, body?: unknown): Promise<CartItem[]> {
  const response = await request(path, { method, body })
  return cartResponseSchema.parse(await response.json()).items
}

/** Client only: the account media plan (KAN-31). Every call answers the whole cart. */
export const fetchCart = () => requestCart('/api/cart', 'GET')
export const addCartItem = (placementId: string) =>
  requestCart(`/api/cart/items/${encodeURIComponent(placementId)}`, 'PUT')
export const removeCartItem = (placementId: string) =>
  requestCart(`/api/cart/items/${encodeURIComponent(placementId)}`, 'DELETE')
export const clearCart = () => requestCart('/api/cart', 'DELETE')
export const mergeCart = (placementIds: string[]) =>
  requestCart('/api/cart/merge', 'POST', { placementIds })
