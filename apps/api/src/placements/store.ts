import type { MapBoundsQuery, PlacementDetail, PlacementMarker } from '@reclo/shared'

export interface PlacementStore {
  findMapMarkers: (query: MapBoundsQuery) => Promise<PlacementMarker[]>
  findPlacementDetail: (id: string) => Promise<PlacementDetail | null>
}
