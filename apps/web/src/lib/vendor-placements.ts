import {
  vendorPlacementListResponseSchema,
  vendorPlacementResponseSchema,
  type CreatePlacementRequest,
  type PlacementStatus,
  type UpdatePlacementRequest,
  type VendorPlacement,
  type VendorPlacementListResponse,
} from '@reclo/shared'
import { request } from './api'

/** The vendor's own listings (`/api/vendor/placements`). The session decides whose; there is no id. */
const BASE = '/api/vendor/placements'

export const VENDOR_PAGE_SIZE = 20

export type VendorListingAction = 'archive' | 'restore' | 'pause' | 'resume'

async function placementFrom(response: Response): Promise<VendorPlacement> {
  return vendorPlacementResponseSchema.parse(await response.json()).placement
}

export async function fetchVendorPlacements(params: {
  status?: PlacementStatus
  page?: number
  pageSize?: number
}): Promise<VendorPlacementListResponse> {
  const searchParams = new URLSearchParams()
  if (params.status) searchParams.set('status', params.status)
  searchParams.set('page', String(params.page ?? 1))
  searchParams.set('pageSize', String(params.pageSize ?? VENDOR_PAGE_SIZE))
  const response = await request(`${BASE}?${searchParams.toString()}`, { method: 'GET' })
  return vendorPlacementListResponseSchema.parse(await response.json())
}

export async function fetchVendorPlacement(id: string): Promise<VendorPlacement> {
  return placementFrom(await request(`${BASE}/${id}`, { method: 'GET' }))
}

export async function createVendorPlacement(input: CreatePlacementRequest) {
  return placementFrom(await request(BASE, { method: 'POST', body: input }))
}

export async function updateVendorPlacement(id: string, input: UpdatePlacementRequest) {
  return placementFrom(await request(`${BASE}/${id}`, { method: 'PATCH', body: input }))
}

export async function changeVendorPlacementState(id: string, action: VendorListingAction) {
  return placementFrom(await request(`${BASE}/${id}/${action}`, { method: 'POST' }))
}

export async function uploadPlacementPhoto(id: string, file: File) {
  const form = new FormData()
  form.append('photo', file)
  return placementFrom(await request(`${BASE}/${id}/photos`, { method: 'POST', body: form }))
}

/** `photoUrl` is an entry of `placement.photos`; the route takes only its file name. */
export async function deletePlacementPhoto(id: string, photoUrl: string) {
  const file = photoUrl.split('/').pop() ?? ''
  return placementFrom(
    await request(`${BASE}/${id}/photos/${encodeURIComponent(file)}`, { method: 'DELETE' }),
  )
}
