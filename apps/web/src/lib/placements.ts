import type { PlacementType } from '@reclo/shared'

export function formatPrice(price: number): string {
  return `${new Intl.NumberFormat('uz-UZ').format(price)} UZS`
}

export function formatCompactPrice(price: number): string {
  if (price >= 1_000_000) {
    const val = (price / 1_000_000).toFixed(price % 1_000_000 === 0 ? 0 : 1)
    return `${val}M UZS`
  }
  if (price >= 1_000) {
    const val = (price / 1_000).toFixed(price % 1_000 === 0 ? 0 : 1)
    return `${val}K UZS`
  }
  return `${price} UZS`
}

export function formatPlacementType(type: PlacementType): string {
  switch (type) {
    case 'BILLBOARD':
      return 'Billboard'
    case 'LED_SCREEN':
      return 'LED Screen'
    case 'WALL_MURAL':
      return 'Wall Mural'
    case 'CITY_FORMAT':
      return 'City Format'
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
    case 'WALL_MURAL':
      return {
        bg: 'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300',
        text: 'text-purple-700 dark:text-purple-400',
        dot: 'bg-purple-500',
      }
    case 'CITY_FORMAT':
      return {
        bg: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300',
        text: 'text-amber-700 dark:text-amber-400',
        dot: 'bg-amber-500',
      }
  }
}
