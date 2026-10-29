import { placementTypeSchema, type PlacementStatus, type PlacementType } from '@reclo/shared'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { AuthControls } from '@/components/auth/AuthControls'
import { LanguageSwitcher } from '@/components/i18n/LanguageSwitcher'
import { ModerationDetail } from '@/components/moderation/ModerationDetail'
import {
  ModerationQueue,
  QueuePagination,
  QueueSkeleton,
} from '@/components/moderation/ModerationQueue'
import { useAuthRedirect } from '@/components/moderation/useAuthRedirect'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useLocale } from '@/i18n/useLocale'
import { fetchAdminPlacements } from '@/lib/api'
import { useMessages } from '@/lib/messages'

const PAGE_SIZE = 20
const ALL_TYPES = 'ALL'
/** The API takes one status at a time, so the tabs are the statuses an admin may look up. */
const STATUS_TABS: PlacementStatus[] = [
  'PENDING_REVIEW',
  'REJECTED',
  'ACTIVE',
  'INACTIVE',
  'ARCHIVED',
]
const CITY_DEBOUNCE_MS = 300

export function ModerationPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { t } = useLocale()
  const { apiErrorText } = useMessages()
  const redirectOnAuthError = useAuthRedirect()

  const [status, setStatus] = useState<PlacementStatus>('PENDING_REVIEW')
  const [type, setType] = useState<PlacementType | undefined>()
  const [cityInput, setCityInput] = useState('')
  const [city, setCity] = useState('')
  const [page, setPage] = useState(1)
  // Set when a decision moves the selection, so focus follows it to the next row.
  const focusNext = useRef(false)

  useEffect(() => {
    const handle = setTimeout(() => {
      setCity(cityInput.trim())
      setPage(1)
    }, CITY_DEBOUNCE_MS)
    return () => clearTimeout(handle)
  }, [cityInput])

  const list = useQuery({
    queryKey: ['admin', 'placements', { status, type, city, page }],
    queryFn: () =>
      fetchAdminPlacements({
        status,
        type,
        city: city || undefined,
        page,
        pageSize: PAGE_SIZE,
      }),
    // Keep the rows on screen while a filter or page change loads.
    placeholderData: keepPreviousData,
  })

  useEffect(() => {
    if (list.error) redirectOnAuthError(list.error)
  }, [list.error, redirectOnAuthError])

  const placements = list.data?.placements ?? []
  const total = list.data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const hasFilters = type !== undefined || city !== ''

  // After a decision the selection moves to the item that now sits in the same position.
  useEffect(() => {
    if (!focusNext.current) return
    focusNext.current = false
    document.querySelector<HTMLElement>('tr[aria-current="true"] a')?.focus()
  }, [id])

  function onDecided(decidedId: string) {
    const index = placements.findIndex((placement) => placement.id === decidedId)
    const next = placements[index + 1] ?? placements[index - 1]
    focusNext.current = next !== undefined
    navigate(next ? `/admin/moderation/${next.id}` : '/admin/moderation', { replace: true })
  }

  function clearFilters() {
    setType(undefined)
    setCityInput('')
    setCity('')
    setPage(1)
  }

  return (
    <div className="min-h-dvh bg-muted/20">
      <header className="flex items-center justify-between gap-3 border-b border-border/80 bg-background px-4 py-3">
        <div className="min-w-0">
          <h1 className="text-base font-semibold">{t('moderation.title')}</h1>
          <p className="truncate text-xs text-muted-foreground">
            {status === 'PENDING_REVIEW' && list.data
              ? t('moderation.waiting', { count: total })
              : t('moderation.subtitle')}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <LanguageSwitcher />
          <AuthControls />
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-7xl gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <section
          aria-label={t('moderation.title')}
          className={`min-w-0 space-y-3 ${id ? 'max-lg:hidden' : ''}`}
        >
          <div className="overflow-x-auto">
            <Tabs
              value={status}
              onValueChange={(value) => {
                setStatus(value as PlacementStatus)
                setPage(1)
              }}
            >
              <TabsList>
                {STATUS_TABS.map((value) => (
                  <TabsTrigger key={value} value={value}>
                    {t(`placement.status.${value}`)}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={type ?? ALL_TYPES}
              onValueChange={(value) => {
                setType(value === ALL_TYPES ? undefined : (value as PlacementType))
                setPage(1)
              }}
            >
              <SelectTrigger className="w-40" aria-label={t('moderation.filter.type')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_TYPES}>{t('moderation.filter.allTypes')}</SelectItem>
                {placementTypeSchema.options.map((option) => (
                  <SelectItem key={option} value={option}>
                    {t(`placement.type.${option}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              className="w-44"
              value={cityInput}
              maxLength={80}
              aria-label={t('moderation.filter.city')}
              placeholder={t('moderation.filter.cityPlaceholder')}
              onChange={(event) => setCityInput(event.target.value)}
            />
          </div>

          {list.isPending ? (
            <QueueSkeleton />
          ) : list.isError ? (
            <div className="rounded-lg border border-border/80 bg-background p-6 text-center">
              <p className="text-sm font-medium">{t('moderation.error.load')}</p>
              <p className="mt-1 text-sm text-muted-foreground">{apiErrorText(list.error)}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => void list.refetch()}
              >
                {t('moderation.retry')}
              </Button>
            </div>
          ) : placements.length === 0 && total === 0 ? (
            <div className="rounded-lg border border-border/80 bg-background p-8 text-center">
              <p className="text-sm font-medium">
                {!hasFilters && status === 'PENDING_REVIEW'
                  ? t('moderation.empty.pending')
                  : t('moderation.empty.filtered')}
              </p>
              {hasFilters && (
                <Button variant="outline" size="sm" className="mt-3" onClick={clearFilters}>
                  {t('moderation.filter.clear')}
                </Button>
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-border/80 bg-background">
              <ModerationQueue
                placements={placements}
                selectedId={id}
                showStatus={status !== 'PENDING_REVIEW'}
                now={list.dataUpdatedAt}
              />
            </div>
          )}

          {list.data && total > 0 && <QueuePagination page={page} pages={pages} onPage={setPage} />}
        </section>

        <section className={`min-w-0 ${id ? '' : 'max-lg:hidden'}`}>
          {id ? (
            <ModerationDetail key={id} id={id} onDecided={onDecided} />
          ) : (
            <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              {t('moderation.selectPrompt')}
            </p>
          )}
        </section>
      </main>
    </div>
  )
}
