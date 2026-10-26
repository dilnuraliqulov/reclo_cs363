import type { PlacementType } from '@reclo/shared'

export function formatPrice(price: number): string {
  return `${new Intl.NumberFormat('uz-UZ').format(price)} UZS`
}

// Rounds to at most one decimal and drops a trailing ".0", so pins read
// "2M UZS" rather than "2.0M UZS".
function formatScaled(value: number, suffix: string): string {
  const rounded = Math.round(value * 10) / 10
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}${suffix}`
}

export function formatCompactPrice(price: number): string {
  if (price >= 1_000_000) {
    return formatScaled(price / 1_000_000, 'M UZS')
  }
  if (price >= 1_000) {
    const thousands = price / 1_000
    // Rounding can land on 1000K (e.g. 999,999), which reads better as 1M.
    if (Math.round(thousands * 10) / 10 >= 1_000) {
      return '1M UZS'
    }
    return formatScaled(thousands, 'K UZS')
  }
  return `${price} UZS`
}

export function formatPlacementType(type: PlacementType): string {
  switch (type) {
    case 'BILLBOARD':
      return 'Billboard'
    case 'LED_SCREEN':
      return 'LED Screen'
    default:
      return type
  }
}

export function getPlacementTypeColor(type: PlacementType): {
  bg: string
  text: string
  dot: string
} {
  switch (type) {
    case 'BILLBOARD':
      return {
        bg: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300',
        text: 'text-blue-700 dark:text-blue-400',
        dot: 'bg-blue-500',
      }
    case 'LED_SCREEN':
      return {
        bg: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300',
        text: 'text-emerald-700 dark:text-emerald-400',
        dot: 'bg-emerald-500',
      }
  }
}
