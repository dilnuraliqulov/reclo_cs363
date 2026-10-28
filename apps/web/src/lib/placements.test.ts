import type { PlacementType } from '@reclo/shared'
import { describe, expect, it } from 'vitest'
import {
  formatCompactPrice,
  formatPlacementType,
  formatPrice,
  getPlacementTypeColor,
} from './placements'

describe('formatPrice', () => {
  it('groups digits and appends the currency', () => {
    // The locale decides the separator, so assert on digits and suffix.
    expect(formatPrice(5_000_000).replace(/\D/g, '')).toBe('5000000')
    expect(formatPrice(5_000_000)).toMatch(/UZS$/)
  })

  it('formats zero without a suffix change', () => {
    expect(formatPrice(0)).toMatch(/^0\s?UZS$/)
  })

  it('takes no locale: a price is one currency in one country', () => {
    // Deliberate, and the reason this module stayed out of the i18n work (KAN-79): the amount is a
    // sum a vendor quoted in UZS, so it reads the same to an Uzbek, Russian or English reader.
    // Grouping follows `uz-UZ` whatever the UI language is.
    expect(formatPrice).toHaveLength(1)
    expect(formatPrice(5_000_000)).toBe(new Intl.NumberFormat('uz-UZ').format(5_000_000) + ' UZS')
  })
})

describe('formatCompactPrice', () => {
  it('renders whole millions without a decimal', () => {
    expect(formatCompactPrice(5_000_000)).toBe('5M UZS')
    expect(formatCompactPrice(12_000_000)).toBe('12M UZS')
  })

  it('renders partial millions with one decimal', () => {
    expect(formatCompactPrice(2_750_000)).toBe('2.8M UZS')
    expect(formatCompactPrice(1_500_000)).toBe('1.5M UZS')
  })

  it('renders thousands with a K suffix', () => {
    expect(formatCompactPrice(850_000)).toBe('850K UZS')
    expect(formatCompactPrice(1_500)).toBe('1.5K UZS')
  })

  it('drops a trailing .0 when rounding lands on a whole unit', () => {
    expect(formatCompactPrice(1_999_999)).toBe('2M UZS')
    expect(formatCompactPrice(999_950)).toBe('1M UZS')
  })

  it('leaves sub-thousand prices unscaled', () => {
    expect(formatCompactPrice(999)).toBe('999 UZS')
    expect(formatCompactPrice(0)).toBe('0 UZS')
  })

  it('switches units exactly at each boundary', () => {
    expect(formatCompactPrice(1_000)).toBe('1K UZS')
    // Promoted to millions rather than rendering as "1000.0K UZS".
    expect(formatCompactPrice(999_999)).toBe('1M UZS')
    expect(formatCompactPrice(1_000_000)).toBe('1M UZS')
  })
})

describe('formatPlacementType', () => {
  it('maps every enum member to a human label', () => {
    expect(formatPlacementType('BILLBOARD')).toBe('Billboard')
    expect(formatPlacementType('LED_SCREEN')).toBe('LED Screen')
  })
})

describe('getPlacementTypeColor', () => {
  const types: PlacementType[] = ['BILLBOARD', 'LED_SCREEN']

  it('returns badge, text and dot classes for every type', () => {
    for (const type of types) {
      const colors = getPlacementTypeColor(type)
      expect(colors.bg).toBeTruthy()
      expect(colors.text).toBeTruthy()
      expect(colors.dot).toBeTruthy()
    }
  })

  it('gives each type a distinct dot color so pins stay distinguishable', () => {
    const dots = types.map((type) => getPlacementTypeColor(type).dot)
    expect(new Set(dots).size).toBe(types.length)
  })

  it('provides a dark-mode variant for each badge', () => {
    for (const type of types) {
      expect(getPlacementTypeColor(type).bg).toContain('dark:')
    }
  })
})
