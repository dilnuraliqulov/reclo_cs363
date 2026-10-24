import { useQuery } from '@tanstack/react-query'
import type { MapBoundsQuery, MapMarkersResponse } from '@reclo/shared'
import { fetchPlacementMarkers } from '@/lib/api'

export function usePlacementMarkers(query: MapBoundsQuery | null, options?: { enabled?: boolean }) {
  return useQuery<MapMarkersResponse, Error>({
    queryKey: ['placements', 'map', query],
    queryFn: () => {
      if (!query) throw new Error('Query parameters required')
      return fetchPlacementMarkers(query)
    },
    enabled: Boolean(query && options?.enabled !== false),
    staleTime: 1000 * 30, // 30 seconds
  })
}
