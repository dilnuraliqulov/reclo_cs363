import type {
  MapBoundsQuery,
  PlacementDetail,
  PlacementMarker,
  PublicPricing,
} from '@reclo/shared'

/** The public detail plus the vendor's price list with VAT worked out (null when none is set). */
export type PlacementDetailWithPricing = PlacementDetail & { pricing: PublicPricing | null }

export interface PlacementStore {
  findMapMarkers: (query: MapBoundsQuery) => Promise<PlacementMarker[]>
  findPlacementDetail: (id: string) => Promise<PlacementDetailWithPricing | null>
}
