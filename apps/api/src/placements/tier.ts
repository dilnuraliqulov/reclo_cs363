import type { PlacementTier } from '@reclo/shared'

export function getPlacementTier(pricePerMonth: number): PlacementTier {
  if (pricePerMonth >= 10_000_000) {
    return 'GOLD'
  }
  if (pricePerMonth >= 5_000_000) {
    return 'SILVER'
  }
  return 'BRONZE'
}
