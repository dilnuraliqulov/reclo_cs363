import type { VendorPlacement } from '@reclo/shared'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { useT } from '@/i18n/useLocale'

interface ArchiveListingDialogProps {
  /** The listing being archived; the dialog is open while this is set. */
  placement: VendorPlacement | null
  isPending: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ArchiveListingDialog({
  placement,
  isPending,
  onConfirm,
  onCancel,
}: ArchiveListingDialogProps) {
  const t = useT()

  return (
    <AlertDialog
      open={placement !== null}
      onOpenChange={(open) => !open && !isPending && onCancel()}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('listing.archive.title')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('listing.archive.body', { title: placement?.title ?? '' })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          {/* Cancel is the first focusable control, so it takes the initial focus. */}
          <AlertDialogCancel disabled={isPending}>{t('listing.archive.cancel')}</AlertDialogCancel>
          {/* A plain Button, not AlertDialogAction: that one closes the dialog on click, and this
              one stays open until the request has finished. */}
          <Button variant="destructive" disabled={isPending} onClick={onConfirm}>
            {isPending ? t('listing.archive.confirming') : t('listing.archive.confirm')}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
