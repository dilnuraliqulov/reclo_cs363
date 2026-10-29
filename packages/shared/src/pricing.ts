import { z } from 'zod'
import { DURATION_MAX_MONTHS } from './inquiry'

/**
 * A vendor's price list for one placement (KAN-11). Rows are rental terms in months (the same
 * unit as an inquiry's `durationMonths`); columns are ad durations in seconds (the same unit as a
 * placement's `ledDurationSeconds`; a billboard uses a single column). `prices[row][col]` is the
 * net price for that pair.
 *
 * Money is an integer in minor units (tiyin, 1 UZS = 100 tiyin), never a float. VAT rates are
 * integer basis points (1200 = 12%).
 */
export const MINOR_UNITS_PER_UZS = 100

/** Uzbekistan's standard VAT rate, in basis points. */
export const DEFAULT_VAT_RATE_BPS = 1200
export const VAT_RATE_MAX_BPS = 10_000

export const PRICING_MAX_TERMS = 12
export const PRICING_MAX_DURATIONS = 12

const unique = (values: number[]) => new Set(values).size === values.length

const moneySchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)

export const pricingMatrixSchema = z
  .object({
    terms: z
      .array(z.number().int().min(1).max(DURATION_MAX_MONTHS))
      .min(1)
      .max(PRICING_MAX_TERMS)
      .refine(unique, 'Terms must be unique'),
    durations: z
      .array(z.number().int().positive())
      .min(1)
      .max(PRICING_MAX_DURATIONS)
      .refine(unique, 'Durations must be unique'),
    prices: z.array(z.array(moneySchema)),
  })
  .refine(
    (m) =>
      m.prices.length === m.terms.length &&
      m.prices.every((row) => row.length === m.durations.length),
    { message: 'Prices must have one row per term and one cell per duration', path: ['prices'] },
  )
export type PricingMatrix = z.infer<typeof pricingMatrixSchema>

export const vatSettingsSchema = z.object({
  vatEnabled: z.boolean(),
  vatRate: z.number().int().min(0).max(VAT_RATE_MAX_BPS),
})
export type VatSettings = z.infer<typeof vatSettingsSchema>

/** Body of PUT and response of GET /api/vendor/placements/:id/pricing. */
export const placementPricingSchema = z.object({
  matrix: pricingMatrixSchema,
  vat: vatSettingsSchema,
})
export type PlacementPricing = z.infer<typeof placementPricingSchema>

export const vatAmountsSchema = z.object({
  net: moneySchema,
  vat: moneySchema,
  gross: moneySchema,
})
export type VatAmounts = z.infer<typeof vatAmountsSchema>

/** Splits a net amount into net, VAT and gross. VAT is rounded to the nearest minor unit. */
export function computeVat(net: number, vat: VatSettings): VatAmounts {
  const amount = vat.vatEnabled ? Math.round((net * vat.vatRate) / VAT_RATE_MAX_BPS) : 0
  return { net, vat: amount, gross: net + amount }
}

/** What clients see: the same grid with every cell carrying net, VAT and gross. */
export const publicPricingSchema = z.object({
  terms: z.array(z.number().int()),
  durations: z.array(z.number().int()),
  vat: vatSettingsSchema,
  prices: z.array(z.array(vatAmountsSchema)),
})
export type PublicPricing = z.infer<typeof publicPricingSchema>

export function toPublicPricing({ matrix, vat }: PlacementPricing): PublicPricing {
  return {
    terms: matrix.terms,
    durations: matrix.durations,
    vat,
    prices: matrix.prices.map((row) => row.map((net) => computeVat(net, vat))),
  }
}
