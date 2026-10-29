import type { AdminPlacementDetail } from '@reclo/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { useLocale } from '@/i18n/useLocale'
import { ApiRequestError, approvePlacement, fetchAdminPlacement, rejectPlacement } from '@/lib/api'
import { useMessages } from '@/lib/messages'
import { adminPlacementKey, formatDateTime } from '@/lib/moderation'
import { formatPrice } from '@/lib/placements'
import { PlacementStatusBadge } from './PlacementStatusBadge'
import { RejectDialog } from './RejectDialog'
import { useAuthRedirect } from './useAuthRedirect'

type Decision = { kind: 'approve' } | { kind: 'reject'; reason: string }

interface ModerationDetailProps {
  id: string
  /** Called after a decision succeeded, so the page can move on to the next item in the queue. */
  onDecided: (id: string) => void
}

export function ModerationDetail({ id, onDecided }: ModerationDetailProps) {
  const { locale, t } = useLocale()
  const { apiErrorText } = useMessages()
  const redirectOnAuthError = useAuthRedirect()
  const queryClient = useQueryClient()
  const [rejectOpen, setRejectOpen] = useState(false)

  const detail = useQuery({
    queryKey: adminPlacementKey(id),
    queryFn: () => fetchAdminPlacement(id),
    // A 404 or 403 will not change by asking again.
    retry: (count, error) => !(error instanceof ApiRequestError) && count < 2,
  })

  useEffect(() => {
    if (detail.error) redirectOnAuthError(detail.error)
  }, [detail.error, redirectOnAuthError])

  const decide = useMutation({
    mutationFn: (decision: Decision) => {
      // The decision applies to the version on screen: the server refuses it if that moved.
      const expectedUpdatedAt = detail.data?.updatedAt ?? ''
      return decision.kind === 'approve'
        ? approvePlacement(id, { expectedUpdatedAt })
        : rejectPlacement(id, { expectedUpdatedAt, reason: decision.reason })
    },
    onSuccess: (placement, decision) => {
      queryClient.setQueryData(adminPlacementKey(id), placement)
      void queryClient.invalidateQueries({ queryKey: ['admin', 'placements'] })
      setRejectOpen(false)
      toast.success(
        decision.kind === 'approve'
          ? t('moderation.toast.approved')
          : t('moderation.toast.rejected'),
      )
      onDecided(id)
    },
    onError: (error) => {
      if (redirectOnAuthError(error)) return
      toast.error(apiErrorText(error))
      if (error instanceof ApiRequestError && error.status >= 400 && error.status < 500) {
        if (error.status === 409 || error.status === 404) {
          // The state moved on under the admin: show what it is now, and drop the typed reason,
          // which may no longer fit changed content.
          setRejectOpen(false)
          void queryClient.invalidateQueries({ queryKey: adminPlacementKey(id) })
          void queryClient.invalidateQueries({ queryKey: ['admin', 'placements'] })
        }
      }
    },
  })

  const backLink = (
    <Button variant="ghost" size="sm" className="-ml-2 lg:hidden" asChild>
      <Link to="/admin/moderation">
        <ArrowLeft aria-hidden="true" />
        {t('moderation.detail.back')}
      </Link>
    </Button>
  )

  if (detail.isPending) {
    return (
      <div className="space-y-4" aria-busy="true">
        {backLink}
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="aspect-video w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    )
  }

  if (detail.isError) {
    const notFound = detail.error instanceof ApiRequestError && detail.error.status === 404
    return (
      <div className="space-y-4">
        {backLink}
        <Card>
          <CardContent className="space-y-3 text-center">
            <p className="text-sm font-medium">
              {notFound ? t('moderation.error.notFound') : t('moderation.error.loadDetail')}
            </p>
            {notFound ? (
              <Button variant="outline" size="sm" asChild>
                <Link to="/admin/moderation">{t('moderation.detail.back')}</Link>
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={() => void detail.refetch()}>
                {t('moderation.retry')}
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  const placement = detail.data
  const pending = placement.status === 'PENDING_REVIEW'
  const noPhotos = placement.photos.length === 0

  return (
    <div className="space-y-4">
      {backLink}
      <Header placement={placement} />
      <Gallery placement={placement} />
      {noPhotos && (
        <Alert>
          <AlertDescription>{t('moderation.noPhotos')}</AlertDescription>
        </Alert>
      )}
      <Specs placement={placement} />

      <section aria-labelledby="mod-description" className="space-y-1">
        <h3 id="mod-description" className="text-sm font-semibold">
          {t('moderation.detail.description')}
        </h3>
        <p className="text-sm whitespace-pre-wrap text-muted-foreground">
          {placement.description || t('moderation.detail.noDescription')}
        </p>
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{t('moderation.detail.history')}</CardTitle>
        </CardHeader>
        <CardContent>
          {placement.events.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('moderation.detail.historyEmpty')}</p>
          ) : (
            <ul className="space-y-3">
              {placement.events.map((event) => {
                const text = t(
                  event.action === 'APPROVED'
                    ? 'moderation.event.approved'
                    : 'moderation.event.rejected',
                  {
                    admin: event.adminName ?? t('moderation.event.unknownAdmin'),
                    date: formatDateTime(event.createdAt, locale),
                  },
                )
                return (
                  <li key={event.id} className="text-sm">
                    <p>{text}</p>
                    {event.reason && (
                      <p className="mt-0.5 whitespace-pre-wrap text-muted-foreground">
                        {event.reason}
                      </p>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {pending && (
        <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center justify-end gap-2 border-t border-border/80 bg-background px-4 py-3">
          {noPhotos && (
            <p className="mr-auto text-xs text-muted-foreground">
              {t('moderation.noPhotos.blocked')}
            </p>
          )}
          <Button
            variant="outline"
            className="min-h-10"
            disabled={decide.isPending}
            onClick={() => setRejectOpen(true)}
          >
            {t('moderation.action.reject')}
          </Button>
          <Button
            className="min-h-10"
            disabled={decide.isPending || noPhotos}
            onClick={() => decide.mutate({ kind: 'approve' })}
          >
            {decide.isPending && decide.variables?.kind === 'approve'
              ? t('moderation.action.approving')
              : t('moderation.action.approve')}
          </Button>
        </div>
      )}

      <RejectDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        pending={decide.isPending}
        onSubmit={(reason) => decide.mutate({ kind: 'reject', reason })}
      />
    </div>
  )
}

function Header({ placement }: { placement: AdminPlacementDetail }) {
  const { t } = useLocale()
  return (
    <header className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold">{placement.title}</h2>
        <PlacementStatusBadge status={placement.status} />
      </div>
      <p className="text-sm text-muted-foreground">
        {placement.address}, {placement.city}
      </p>
      <p className="text-sm">
        <span className="text-muted-foreground">{t('moderation.detail.vendor')}: </span>
        {placement.vendor.name} · {placement.vendor.email}
      </p>
    </header>
  )
}

function Gallery({ placement }: { placement: AdminPlacementDetail }) {
  const [selected, setSelected] = useState(0)
  if (placement.photos.length === 0) return null
  const current = placement.photos[Math.min(selected, placement.photos.length - 1)]
  return (
    <div className="space-y-2">
      <img
        src={current}
        alt={placement.title}
        className="aspect-video w-full rounded-lg border border-border/80 bg-muted object-cover"
      />
      {placement.photos.length > 1 && (
        <ul className="flex flex-wrap gap-2">
          {placement.photos.map((photo, index) => (
            <li key={photo}>
              <button
                type="button"
                onClick={() => setSelected(index)}
                aria-current={photo === current ? 'true' : undefined}
                aria-label={`${placement.title} ${index + 1}`}
                className="size-14 overflow-hidden rounded-md border border-border/80 aria-[current=true]:ring-2 aria-[current=true]:ring-ring"
              >
                <img src={photo} alt="" className="size-full object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Specs({ placement }: { placement: AdminPlacementDetail }) {
  const { t } = useLocale()
  const size =
    placement.width !== null && placement.height !== null
      ? t('moderation.spec.sizeValue', { width: placement.width, height: placement.height })
      : '—'
  const rows: [string, string][] = [
    [t('moderation.spec.type'), t(`placement.type.${placement.type}`)],
    [t('moderation.spec.price'), formatPrice(placement.pricePerMonth)],
    [t('moderation.spec.tier'), t(`placement.tier.${placement.tier}`)],
    [t('moderation.spec.size'), size],
    [
      t('moderation.spec.lighting'),
      placement.lighting ? t('moderation.spec.lightingOn') : t('moderation.spec.lightingOff'),
    ],
    ...(placement.type === 'LED_SCREEN'
      ? [
          [
            t('moderation.spec.ledDuration'),
            placement.ledDurationSeconds !== null
              ? t('moderation.spec.ledDurationValue', { seconds: placement.ledDurationSeconds })
              : '—',
          ] as [string, string],
          [t('moderation.spec.ledPlays'), placement.ledPlaysPerDay?.toString() ?? '—'] as [
            string,
            string,
          ],
        ]
      : []),
    [t('moderation.spec.address'), `${placement.address}, ${placement.city}`],
    [t('moderation.spec.coordinates'), `${placement.latitude}, ${placement.longitude}`],
  ]
  return (
    <section aria-labelledby="mod-specs" className="space-y-2">
      <h3 id="mod-specs" className="text-sm font-semibold">
        {t('moderation.detail.specs')}
      </h3>
      <Separator />
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted-foreground">{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
