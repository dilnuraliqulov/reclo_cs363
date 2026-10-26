import {
  healthResponseSchema,
  mapMarkersResponseSchema,
  placementDetailSchema,
  type HealthResponse,
  type MapBoundsQuery,
  type PlacementDetail,
  type MapMarkersResponse,
} from '@reclo/shared'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000'

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
    throw new Error(
      typeof errorBody.error === 'string'
        ? errorBody.error
        : `Failed to fetch placement detail (${response.status})`,
    )
  }

  const data = await response.json()
  return placementDetailSchema.parse(data)
}
