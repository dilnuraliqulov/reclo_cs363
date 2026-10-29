import type { AdminPlacementListResponse } from '@reclo/shared'
import { Link } from 'react-router'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useLocale } from '@/i18n/useLocale'
import { formatDateTime, formatWaiting } from '@/lib/moderation'
import { formatPrice } from '@/lib/placements'
import { PlacementStatusBadge } from './PlacementStatusBadge'

interface ModerationQueueProps {
  placements: AdminPlacementListResponse['placements']
  selectedId: string | undefined
  /** Other tabs than the queue itself also show each listing's status. */
  showStatus: boolean
  now: number
}

export function QueueSkeleton() {
  return (
    <ul className="space-y-2" aria-busy="true">
      {[0, 1, 2, 3, 4].map((row) => (
        <li key={row}>
          <Skeleton className="h-14 w-full rounded-lg" />
        </li>
      ))}
    </ul>
  )
}

export function ModerationQueue({ placements, selectedId, showStatus, now }: ModerationQueueProps) {
  const { locale, t } = useLocale()

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-16">{t('moderation.col.photo')}</TableHead>
          <TableHead>{t('moderation.col.title')}</TableHead>
          <TableHead className="hidden xl:table-cell">{t('moderation.col.type')}</TableHead>
          <TableHead className="hidden xl:table-cell">{t('moderation.col.vendor')}</TableHead>
          <TableHead className="hidden md:table-cell">{t('moderation.col.price')}</TableHead>
          <TableHead>{t('moderation.col.waitingSince')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {placements.map((placement) => {
          const selected = placement.id === selectedId
          return (
            <TableRow
              key={placement.id}
              aria-current={selected ? 'true' : undefined}
              data-state={selected ? 'selected' : undefined}
            >
              <TableCell>
                {placement.cover ? (
                  <img
                    src={placement.cover}
                    alt=""
                    className="size-12 rounded-md border border-border/80 object-cover"
                  />
                ) : (
                  <div className="size-12 rounded-md border border-dashed border-border bg-muted" />
                )}
              </TableCell>
              <TableCell className="whitespace-normal">
                <Link
                  to={`/admin/moderation/${placement.id}`}
                  className="font-medium hover:underline focus-visible:underline"
                >
                  {placement.title}
                </Link>
                <p className="text-xs text-muted-foreground">{placement.city}</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {placement.photoCount === 0 && (
                    <Badge variant="outline">{t('moderation.noPhotos')}</Badge>
                  )}
                  {showStatus && <PlacementStatusBadge status={placement.status} />}
                </div>
              </TableCell>
              <TableCell className="hidden xl:table-cell">
                {t(`placement.type.${placement.type}`)}
              </TableCell>
              <TableCell className="hidden xl:table-cell">{placement.vendorName}</TableCell>
              <TableCell className="hidden md:table-cell">
                {formatPrice(placement.pricePerMonth)}
              </TableCell>
              <TableCell className="whitespace-normal">
                <span title={formatDateTime(placement.updatedAt, locale)}>
                  {formatWaiting(placement.updatedAt, now, locale)}
                </span>
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}

interface PaginationProps {
  page: number
  pages: number
  onPage: (page: number) => void
}

export function QueuePagination({ page, pages, onPage }: PaginationProps) {
  const { t } = useLocale()
  return (
    <nav className="flex items-center justify-between gap-2" aria-label={t('moderation.title')}>
      <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        {t('moderation.prev')}
      </Button>
      <span className="text-xs text-muted-foreground">{t('moderation.page', { page, pages })}</span>
      <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        {t('moderation.next')}
      </Button>
    </nav>
  )
}
