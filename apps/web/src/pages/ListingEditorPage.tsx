import type { VendorPlacement } from '@reclo/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router'
import { toast } from 'sonner'
import { ListingForm } from '@/components/vendor/ListingForm'
import { PricingCard } from '@/components/vendor/PricingCard'
import { ListingStatusBanner } from '@/components/vendor/ListingStatusBanner'
import { VendorPageHeader } from '@/components/vendor/VendorPageHeader'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useApiErrorHandler } from '@/hooks/useApiErrorHandler'
import { useT } from '@/i18n/useLocale'
import { ApiRequestError } from '@/lib/api'
import { useMessages } from '@/lib/messages'
import { changeVendorPlacementState, fetchVendorPlacement } from '@/lib/vendor-placements'

/** Create (`/vendor/placements/new`) and edit (`/vendor/placements/:id/edit`) share this page. */
export function ListingEditorPage() {
  const { id } = useParams()
  const t = useT()
  const { apiErrorText } = useMessages()
  const handleError = useApiErrorHandler()
  const queryClient = useQueryClient()

  const listing = useQuery({
    queryKey: ['vendor-placement', id],
    queryFn: () => fetchVendorPlacement(id!),
    enabled: id !== undefined,
    // The form owns what is on screen; a background refetch must not replace it mid-edit.
    refetchOnWindowFocus: false,
    retry: false,
  })

  const restore = useMutation({
    mutationFn: () => changeVendorPlacementState(id!, 'restore'),
    onSuccess: (restored) => {
      toast.success(t('listing.done.restore'))
      setPlacement(restored)
    },
    onError: handleError,
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['vendor-placements'] }),
  })

  function setPlacement(placement: VendorPlacement) {
    queryClient.setQueryData(['vendor-placement', placement.id], placement)
  }

  const placement = listing.data ?? null
  // A missing listing and someone else's look the same, as they do to the API. A malformed id is
  // a 400, which is the same to the reader.
  const notFound =
    listing.error instanceof ApiRequestError &&
    (listing.error.status === 404 || listing.error.status === 400)

  return (
    <div className="min-h-dvh bg-muted/20">
      <VendorPageHeader>
        <nav className="flex items-center gap-2 text-xs text-muted-foreground">
          <Link to="/vendor/placements" className="underline-offset-2 hover:underline">
            {t('listing.title')}
          </Link>
          <span aria-hidden>/</span>
        </nav>
        <h1 className="truncate text-base font-semibold">
          {id === undefined ? t('listing.editor.newTitle') : (placement?.title ?? '')}
        </h1>
      </VendorPageHeader>

      <main className="mx-auto w-full max-w-3xl p-4">
        {id !== undefined && listing.isPending ? (
          <div className="space-y-4" aria-hidden>
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-64 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        ) : notFound ? (
          <div className="rounded-lg border border-border/80 bg-background p-8 text-center">
            <p className="text-sm font-medium">{t('listing.editor.notFound')}</p>
            <Button variant="outline" size="sm" className="mt-3" asChild>
              <Link to="/vendor/placements">{t('listing.editor.backToList')}</Link>
            </Button>
          </div>
        ) : listing.isError ? (
          <div className="rounded-lg border border-border/80 bg-background p-6 text-center">
            <p className="text-sm font-medium">{t('listing.error.load')}</p>
            <p className="mt-1 text-sm text-muted-foreground">{apiErrorText(listing.error)}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => listing.refetch()}>
              {t('listing.error.retry')}
            </Button>
          </div>
        ) : (
          <>
            <ListingForm
              // A new listing becomes an edit of itself after the first save: start the form afresh.
              key={placement?.id ?? 'new'}
              placement={placement}
              onPlacementChange={setPlacement}
              onPhotosSettled={() =>
                queryClient.invalidateQueries({ queryKey: ['vendor-placement', id] })
              }
              banner={
                placement && (
                  <ListingStatusBanner
                    placement={placement}
                    onRestore={() => restore.mutate()}
                    isRestoring={restore.isPending}
                  />
                )
              }
            />
            {placement && (
              <div className="pb-24">
                <PricingCard placement={placement} />
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
