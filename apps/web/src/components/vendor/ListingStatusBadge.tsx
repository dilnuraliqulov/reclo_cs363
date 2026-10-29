import type { PlacementStatus } from '@reclo/shared'
import { Badge } from '@/components/ui/badge'
import { useT } from '@/i18n/useLocale'
import { cn } from '@/lib/utils'

const STYLES: Record<PlacementStatus, string> = {
  ACTIVE: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300',
  PENDING_REVIEW: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300',
  REJECTED: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300',
  INACTIVE: 'bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-300',
  ARCHIVED: 'bg-muted text-muted-foreground',
}

/** Colour plus the word: the label carries the meaning, the colour only helps scanning. */
export function ListingStatusBadge({ status }: { status: PlacementStatus }) {
  const t = useT()
  return (
    <Badge variant="secondary" className={cn('border-transparent', STYLES[status])}>
      {t(`placement.status.${status}`)}
    </Badge>
  )
}
