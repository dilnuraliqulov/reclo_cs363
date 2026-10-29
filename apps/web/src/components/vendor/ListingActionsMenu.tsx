import type { VendorPlacement } from '@reclo/shared'
import { MoreHorizontal } from 'lucide-react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useT } from '@/i18n/useLocale'
import type { VendorListingAction } from '@/lib/vendor-placements'

interface ListingActionsMenuProps {
  placement: VendorPlacement
  disabled?: boolean
  onAction: (placement: VendorPlacement, action: VendorListingAction) => void
}

/** Which actions the state machine allows from each status (`docs/listing-design.md`). */
export function ListingActionsMenu({ placement, disabled, onAction }: ListingActionsMenuProps) {
  const t = useT()
  const { status } = placement
  const archived = status === 'ARCHIVED'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-10"
          disabled={disabled}
          aria-label={t('listing.actions.label', { title: placement.title })}
        >
          <MoreHorizontal aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {!archived && (
          <DropdownMenuItem asChild>
            <Link to={`/vendor/placements/${placement.id}/edit`}>{t('listing.action.edit')}</Link>
          </DropdownMenuItem>
        )}
        {status === 'ACTIVE' && (
          <DropdownMenuItem onSelect={() => onAction(placement, 'pause')}>
            {t('listing.action.pause')}
          </DropdownMenuItem>
        )}
        {status === 'INACTIVE' && (
          <DropdownMenuItem onSelect={() => onAction(placement, 'resume')}>
            {t('listing.action.resume')}
          </DropdownMenuItem>
        )}
        {!archived && (
          <DropdownMenuItem variant="destructive" onSelect={() => onAction(placement, 'archive')}>
            {t('listing.action.archive')}
          </DropdownMenuItem>
        )}
        {archived && (
          <DropdownMenuItem onSelect={() => onAction(placement, 'restore')}>
            {t('listing.action.restore')}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
