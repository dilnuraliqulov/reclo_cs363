import type { PlacementStatus } from '@reclo/shared'
import { Badge } from '@/components/ui/badge'
import { useT } from '@/i18n/useLocale'
import { placementStatusVariant } from '@/lib/moderation'

/** The listing status as words; the colour only decorates. */
export function PlacementStatusBadge({ status }: { status: PlacementStatus }) {
  const t = useT()
  return <Badge variant={placementStatusVariant(status)}>{t(`placement.status.${status}`)}</Badge>
}
