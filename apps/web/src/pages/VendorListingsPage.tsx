import { type PlacementStatus, type VendorPlacement } from '@reclo/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { ArchiveListingDialog } from '@/components/vendor/ArchiveListingDialog'
import { ListingActionsMenu } from '@/components/vendor/ListingActionsMenu'
import { ListingStatusBadge } from '@/components/vendor/ListingStatusBadge'
import { VendorPageHeader } from '@/components/vendor/VendorPageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useApiErrorHandler } from '@/hooks/useApiErrorHandler'
import { useIsMobile } from '@/hooks/useIsMobile'
import { useLocale } from '@/i18n/useLocale'
import { formatPrice } from '@/lib/placements'
import { useMessages } from '@/lib/messages'
import {
  VENDOR_PAGE_SIZE,
  changeVendorPlacementState,
  fetchVendorPlacements,
  type VendorListingAction,
} from '@/lib/vendor-placements'

const ALL = 'ALL'
type Tab = typeof ALL | PlacementStatus

// Active · Pending review · Rejected · Inactive · Archived · All, the order the design gives.
const TABS: Tab[] = ['ACTIVE', 'PENDING_REVIEW', 'REJECTED', 'INACTIVE', 'ARCHIVED', ALL]

const SKELETON_ROWS = [0, 1, 2, 3, 4]

export function VendorListingsPage() {
  const [tab, setTab] = useState<Tab>(ALL)
  const [page, setPage] = useState(1)
  const [archiveTarget, setArchiveTarget] = useState<VendorPlacement | null>(null)
  const { t, locale } = useLocale()
  const { apiErrorText } = useMessages()
  const handleError = useApiErrorHandler()
  const queryClient = useQueryClient()
  const isMobile = useIsMobile()

  const listings = useQuery({
    queryKey: ['vendor-placements', tab, page],
    queryFn: () => fetchVendorPlacements({ status: tab === ALL ? undefined : tab, page }),
    // Keep the old rows on screen while the next page loads, so the table does not collapse.
    placeholderData: (previous) => previous,
  })

  const stateChange = useMutation({
    mutationFn: ({ id, action }: { id: string; action: VendorListingAction }) =>
      changeVendorPlacementState(id, action),
    onSuccess: (_placement, { action }) => {
      toast.success(t(`listing.done.${action}`))
      setArchiveTarget(null)
    },
    onError: (error) => {
      setArchiveTarget(null)
      handleError(error)
    },
    // A 409 means the list was stale (another tab, an admin), so refetch whatever the outcome.
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['vendor-placements'] }),
  })

  const placements = listings.data?.placements ?? []
  const total = listings.data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / VENDOR_PAGE_SIZE))

  function selectTab(value: Tab) {
    setTab(value)
    setPage(1)
  }

  function onAction(placement: VendorPlacement, action: VendorListingAction) {
    if (action === 'archive') {
      setArchiveTarget(placement)
      return
    }
    stateChange.mutate({ id: placement.id, action })
  }

  const dateFormat = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' })
  const tabLabel = (value: Tab) =>
    value === ALL ? t('listing.tab.all') : t(`placement.status.${value}`)

  return (
    <div className="min-h-dvh bg-muted/20">
      <VendorPageHeader>
        <h1 className="text-base font-semibold">{t('listing.title')}</h1>
        <p className="truncate text-xs text-muted-foreground">{t('listing.subtitle')}</p>
      </VendorPageHeader>

      <main className="mx-auto w-full max-w-5xl space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* On a narrow screen the tabs scroll sideways instead of wrapping. */}
          <Tabs
            value={tab}
            onValueChange={(value) => selectTab(value as Tab)}
            className="max-w-full overflow-x-auto"
          >
            <TabsList>
              {TABS.map((value) => (
                <TabsTrigger key={value} value={value}>
                  {tabLabel(value)}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <Button asChild>
            <Link to="/vendor/placements/new">{t('listing.new')}</Link>
          </Button>
        </div>

        {listings.isPending ? (
          <ul className="space-y-2" aria-hidden>
            {SKELETON_ROWS.map((row) => (
              <li key={row}>
                <Skeleton className="h-16 w-full rounded-lg" />
              </li>
            ))}
          </ul>
        ) : listings.isError ? (
          <Card>
            <CardContent className="text-center">
              <p className="text-sm font-medium">{t('listing.error.load')}</p>
              <p className="mt-1 text-sm text-muted-foreground">{apiErrorText(listings.error)}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => listings.refetch()}
              >
                {t('listing.error.retry')}
              </Button>
            </CardContent>
          </Card>
        ) : placements.length === 0 ? (
          <EmptyState tab={tab} onShowAll={() => selectTab(ALL)} tabLabel={tabLabel} />
        ) : (
          <>
            {isMobile ? (
              <ul className="space-y-2">
                {placements.map((placement) => (
                  <li key={placement.id}>
                    <Card size="sm">
                      <CardContent className="flex items-center gap-3">
                        <Cover placement={placement} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{placement.title}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {formatPrice(placement.pricePerMonth)}
                          </p>
                          <div className="mt-1">
                            <ListingStatusBadge status={placement.status} />
                          </div>
                        </div>
                        <ListingActionsMenu
                          placement={placement}
                          disabled={stateChange.isPending}
                          onAction={onAction}
                        />
                      </CardContent>
                    </Card>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="rounded-lg border border-border/80 bg-background">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('listing.col.photo')}</TableHead>
                      <TableHead>{t('listing.col.title')}</TableHead>
                      <TableHead>{t('listing.col.type')}</TableHead>
                      <TableHead>{t('listing.col.price')}</TableHead>
                      <TableHead>{t('listing.col.status')}</TableHead>
                      <TableHead>{t('listing.col.updated')}</TableHead>
                      <TableHead className="w-12">
                        <span className="sr-only">{t('listing.col.actions')}</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {placements.map((placement) => (
                      <TableRow key={placement.id}>
                        <TableCell>
                          <Cover placement={placement} />
                        </TableCell>
                        <TableCell>
                          <p className="font-medium">{placement.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {placement.address}, {placement.city}
                          </p>
                        </TableCell>
                        <TableCell>{t(`placement.type.${placement.type}`)}</TableCell>
                        <TableCell>{formatPrice(placement.pricePerMonth)}</TableCell>
                        <TableCell>
                          <ListingStatusBadge status={placement.status} />
                        </TableCell>
                        <TableCell>{dateFormat.format(new Date(placement.updatedAt))}</TableCell>
                        <TableCell>
                          <ListingActionsMenu
                            placement={placement}
                            disabled={stateChange.isPending}
                            onAction={onAction}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {pages > 1 && (
              <nav className="flex items-center justify-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((current) => current - 1)}
                >
                  {t('listing.page.previous')}
                </Button>
                <span className="text-sm text-muted-foreground" aria-live="polite">
                  {t('listing.page.label', { page, pages })}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= pages}
                  onClick={() => setPage((current) => current + 1)}
                >
                  {t('listing.page.next')}
                </Button>
              </nav>
            )}
          </>
        )}
      </main>

      <ArchiveListingDialog
        placement={archiveTarget}
        isPending={stateChange.isPending}
        onCancel={() => setArchiveTarget(null)}
        onConfirm={() =>
          archiveTarget && stateChange.mutate({ id: archiveTarget.id, action: 'archive' })
        }
      />
    </div>
  )
}

function Cover({ placement }: { placement: VendorPlacement }) {
  const { t } = useLocale()
  return placement.photo ? (
    <img src={placement.photo} alt="" className="size-14 shrink-0 rounded-md object-cover" />
  ) : (
    <div className="flex size-14 shrink-0 items-center justify-center rounded-md bg-muted px-1 text-center text-[10px] text-muted-foreground">
      {t('listing.noPhoto')}
    </div>
  )
}

function EmptyState({
  tab,
  onShowAll,
  tabLabel,
}: {
  tab: Tab
  onShowAll: () => void
  tabLabel: (tab: Tab) => string
}) {
  const { t } = useLocale()
  // Empty for a filter is not the same as no listings at all: a vendor who filtered to Archived and
  // saw the first-run prompt would think their listings had been lost.
  return (
    <div className="rounded-lg border border-border/80 bg-background p-8 text-center">
      {tab === ALL ? (
        <>
          <p className="text-sm font-medium">{t('listing.empty.none')}</p>
          <Button size="sm" className="mt-3" asChild>
            <Link to="/vendor/placements/new">{t('listing.new')}</Link>
          </Button>
        </>
      ) : (
        <>
          <p className="text-sm font-medium">
            {tab === 'ARCHIVED'
              ? t('listing.empty.archived')
              : t('listing.empty.filtered', { status: tabLabel(tab) })}
          </p>
          <Button variant="outline" size="sm" className="mt-3" onClick={onShowAll}>
            {t('listing.empty.showAll')}
          </Button>
        </>
      )}
    </div>
  )
}
