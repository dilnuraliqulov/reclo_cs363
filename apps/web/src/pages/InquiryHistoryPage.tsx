import { inquiryStatusSchema, type InquiryStatus } from '@reclo/shared'
import { useInfiniteQuery } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { Link } from 'react-router'
import { AuthControls } from '@/components/auth/AuthControls'
import { LanguageSwitcher } from '@/components/i18n/LanguageSwitcher'
import { InquiryHistoryRow } from '@/components/inquiries/InquiryHistoryRow'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { statusKey, useT } from '@/i18n/useLocale'
import { fetchInquiryHistory } from '@/lib/api'
import { useMessages } from '@/lib/messages'

const ALL = 'ALL'
type Filter = typeof ALL | InquiryStatus

const FILTERS: Filter[] = [ALL, ...inquiryStatusSchema.options]

export function InquiryHistoryPage() {
  const [filter, setFilter] = useState<Filter>(ALL)
  const t = useT()
  const { apiErrorText } = useMessages()
  // "Load older" keeps focus after the fetch, so a keyboard user is not returned to the top.
  const loadMoreRef = useRef<HTMLButtonElement>(null)

  const history = useInfiniteQuery({
    queryKey: ['inquiries', filter],
    queryFn: ({ pageParam }) =>
      fetchInquiryHistory({
        status: filter === ALL ? undefined : filter,
        cursor: pageParam ?? undefined,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  })

  const inquiries = history.data?.pages.flatMap((page) => page.inquiries) ?? []
  const isFiltered = filter !== ALL

  return (
    <div className="min-h-dvh bg-muted/20">
      <header className="flex items-center justify-between gap-3 border-b border-border/80 bg-background px-4 py-3">
        <div className="min-w-0">
          <h1 className="text-base font-semibold">{t('inquiry.history.title')}</h1>
          <p className="truncate text-xs text-muted-foreground">{t('inquiry.history.subtitle')}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <LanguageSwitcher />
          <AuthControls />
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl space-y-4 p-4">
        <Tabs value={filter} onValueChange={(value) => setFilter(value as Filter)}>
          <TabsList>
            {FILTERS.map((value) => (
              <TabsTrigger key={value} value={value}>
                {value === ALL ? t('inquiry.history.all') : t(statusKey(value))}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {history.isPending ? (
          // The shape is known, so skeleton rows rather than a spinner: the page should not jump.
          <ul className="space-y-2">
            {[0, 1, 2].map((row) => (
              <li key={row}>
                <Skeleton className="h-16 w-full rounded-lg" />
              </li>
            ))}
          </ul>
        ) : history.isError ? (
          <div className="rounded-lg border border-border/80 bg-background p-6 text-center">
            <p className="text-sm font-medium">{t('inquiry.history.errorTitle')}</p>
            <p className="mt-1 text-sm text-muted-foreground">{apiErrorText(history.error)}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => history.refetch()}>
              {t('inquiry.history.retry')}
            </Button>
          </div>
        ) : inquiries.length === 0 ? (
          // A client who filtered to Replied and saw the first-run prompt would think their
          // history had been lost, so the two empty states are kept distinct.
          <div className="rounded-lg border border-border/80 bg-background p-8 text-center">
            {isFiltered ? (
              <>
                <p className="text-sm font-medium">{t('inquiry.history.filteredEmpty')}</p>
                <Button variant="outline" size="sm" className="mt-3" onClick={() => setFilter(ALL)}>
                  {t('inquiry.history.clearFilter')}
                </Button>
              </>
            ) : (
              <>
                <p className="text-sm font-medium">{t('inquiry.history.emptyTitle')}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t('inquiry.history.emptyBody')}
                </p>
                <Button size="sm" className="mt-3" asChild>
                  <Link to="/placements">{t('inquiry.history.emptyAction')}</Link>
                </Button>
              </>
            )}
          </div>
        ) : (
          <>
            <ul className="space-y-2">
              {inquiries.map((inquiry) => (
                <InquiryHistoryRow key={inquiry.id} inquiry={inquiry} />
              ))}
            </ul>

            {history.hasNextPage && (
              <div className="flex justify-center">
                <Button
                  ref={loadMoreRef}
                  variant="outline"
                  size="sm"
                  disabled={history.isFetchingNextPage}
                  onClick={() => {
                    void history.fetchNextPage().then(() => loadMoreRef.current?.focus())
                  }}
                >
                  {history.isFetchingNextPage
                    ? t('inquiry.history.loadingOlder')
                    : t('inquiry.history.loadOlder')}
                </Button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
