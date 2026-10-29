import type { PlacementPricing } from '@reclo/shared'

interface PricingRow {
  terms: number[]
  durations: number[]
  prices: unknown
  vatEnabled: boolean
  vatRate: number
}

/** A stored PlacementPricing row as the shared contract. `prices` was written from that contract. */
export function toPlacementPricing(row: PricingRow): PlacementPricing {
  return {
    matrix: { terms: row.terms, durations: row.durations, prices: row.prices as number[][] },
    vat: { vatEnabled: row.vatEnabled, vatRate: row.vatRate },
  }
}
