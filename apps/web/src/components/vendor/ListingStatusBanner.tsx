import type { VendorPlacement } from '@reclo/shared'
import { Button } from '@/components/ui/button'
import { useT } from '@/i18n/useLocale'
import { ListingStatusBadge } from './ListingStatusBadge'

interface ListingStatusBannerProps {
  placement: VendorPlacement
  onRestore: () => void
  isRestoring: boolean
}

/** The listing's status in words, what saving will do to it, and the no-photo warning. */
export function ListingStatusBanner({
  placement,
  onRestore,
  isRestoring,
}: ListingStatusBannerProps) {
  const t = useT()
  const { status } = placement

  return (
    <div className="space-y-2">
      <div
        role="status"
        className="flex flex-wrap items-center gap-3 rounded-lg border border-border/80 bg-background p-3 text-sm"
      >
        <ListingStatusBadge status={status} />
        <span className="min-w-0 flex-1">{t(`listing.banner.${status}`)}</span>
        {status === 'ARCHIVED' && (
          <Button size="sm" onClick={onRestore} disabled={isRestoring}>
            {t('listing.banner.restore')}
          </Button>
        )}
      </div>
      {status !== 'ARCHIVED' && placement.photos.length === 0 && (
        <div
          role="alert"
          className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
        >
          {t('listing.banner.noPhoto')}
        </div>
      )}
    </div>
  )
}
