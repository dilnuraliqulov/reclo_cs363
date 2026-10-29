import { INTL_LOCALE, type Locale, type PlacementStatus } from '@reclo/shared'

/** How long ago, in the reader's language: "3 hours ago", "вчера". Rounds down to the unit. */
export function formatWaiting(isoDate: string, now: number, locale: Locale): string {
  const then = new Date(isoDate).getTime()
  if (Number.isNaN(then)) return isoDate
  const formatter = new Intl.RelativeTimeFormat(INTL_LOCALE[locale], { numeric: 'auto' })
  const minutes = Math.floor((then - now) / 60_000)
  if (Math.abs(minutes) < 60) return formatter.format(Math.min(minutes, 0), 'minute')
  const hours = Math.trunc(minutes / 60)
  if (Math.abs(hours) < 24) return formatter.format(hours, 'hour')
  return formatter.format(Math.trunc(hours / 24), 'day')
}

/** The absolute moment, for a `title` next to a relative one and for history rows. */
export function formatDateTime(isoDate: string, locale: Locale): string {
  const date = new Date(isoDate)
  if (Number.isNaN(date.getTime())) return isoDate
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

/** Decoration only; the badge text carries the status. */
export function placementStatusVariant(
  status: PlacementStatus,
): 'default' | 'secondary' | 'outline' | 'destructive' {
  switch (status) {
    case 'ACTIVE':
      return 'default'
    case 'PENDING_REVIEW':
      return 'secondary'
    case 'REJECTED':
      return 'destructive'
    case 'INACTIVE':
    case 'ARCHIVED':
      return 'outline'
  }
}

/** Query key of one listing in the admin screens. */
export const adminPlacementKey = (id: string) => ['admin', 'placement', id] as const
