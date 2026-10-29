import {
  ADMIN_INQUIRY_CLIENT_QUERY_MAX_LENGTH,
  ADMIN_INQUIRY_PAGE_SIZE,
  adminInquiryQuerySchema,
  inquiryStatusSchema,
  type AdminInquiryDetail,
  type AdminInquiryQueryInput,
  type InquiryStatus,
} from '@reclo/shared'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router'
import { AuthControls } from '@/components/auth/AuthControls'
import { LanguageSwitcher } from '@/components/i18n/LanguageSwitcher'
import { InquiryStatusBadge } from '@/components/inquiries/InquiryStatusBadge'
import { useAuthRedirect } from '@/components/moderation/useAuthRedirect'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { statusKey, useLocale } from '@/i18n/useLocale'
import {
  adminInquiriesKey,
  adminInquiryKey,
  fetchAdminInquiries,
  fetchAdminInquiry,
} from '@/lib/admin-inquiries'
import { formatInquiryDate, formatUzPhone } from '@/lib/inquiries'
import { useMessages } from '@/lib/messages'
import { formatDateTime } from '@/lib/moderation'

const ALL_STATUSES = 'ALL'
const SEARCH_DEBOUNCE_MS = 300
/** The URL keys the filters live under, so a filtered view can be shared as a link. */
const FILTER_KEYS = ['clientQuery', 'status', 'from', 'to', 'page'] as const

export function AdminInquiriesPage() {
  const { locale, t } = useLocale()
  const { apiErrorText, fieldErrorText } = useMessages()
  const redirectOnAuthError = useAuthRedirect()
  const [searchParams, setSearchParams] = useSearchParams()

  const raw: AdminInquiryQueryInput = useMemo(() => {
    const value = (key: string) => searchParams.get(key) || undefined
    return {
      clientQuery: value('clientQuery'),
      status: value('status') as InquiryStatus | undefined,
      from: value('from'),
      to: value('to'),
      page: value('page'),
    }
  }, [searchParams])
  const parsed = adminInquiryQuerySchema.safeParse(raw)
  const query = parsed.success ? parsed.data : undefined
  const dateError = parsed.success
    ? undefined
    : parsed.error.issues.find((issue) => issue.path[0] === 'to' || issue.path[0] === 'from')
  const selectedId = searchParams.get('inquiry')

  const [searchInput, setSearchInput] = useState(raw.clientQuery ?? '')

  function updateParams(changes: Record<string, string | undefined>, resetPage = true) {
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current)
        for (const [key, value] of Object.entries(changes)) {
          if (value) next.set(key, value)
          else next.delete(key)
        }
        if (resetPage && !('page' in changes)) next.delete('page')
        return next
      },
      { replace: true },
    )
  }

  // Typing settles before it reaches the URL, so every keystroke is not a request.
  useEffect(() => {
    const trimmed = searchInput.trim()
    if (trimmed === (searchParams.get('clientQuery') ?? '')) return
    const handle = setTimeout(
      () => updateParams({ clientQuery: trimmed || undefined }),
      SEARCH_DEBOUNCE_MS,
    )
    return () => clearTimeout(handle)
    // updateParams only wraps setSearchParams, which is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput, searchParams])

  const list = useQuery({
    queryKey: adminInquiriesKey(query ?? {}),
    queryFn: () => fetchAdminInquiries(query),
    enabled: query !== undefined,
    // Keep the rows on screen while a filter or page change loads.
    placeholderData: keepPreviousData,
  })

  useEffect(() => {
    if (list.error) redirectOnAuthError(list.error)
  }, [list.error, redirectOnAuthError])

  const inquiries = list.data?.inquiries ?? []
  const total = list.data?.total ?? 0
  const page = list.data?.page ?? query?.page ?? 1
  const pages = Math.max(1, Math.ceil(total / (list.data?.pageSize ?? ADMIN_INQUIRY_PAGE_SIZE)))
  const hasFilters = FILTER_KEYS.some((key) => key !== 'page' && searchParams.has(key))

  function resetFilters() {
    setSearchInput('')
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current)
        for (const key of FILTER_KEYS) next.delete(key)
        return next
      },
      { replace: true },
    )
  }

  function openInquiry(id: string | undefined) {
    updateParams({ inquiry: id }, false)
  }

  return (
    <div className="min-h-dvh bg-muted/20">
      <header className="flex items-center justify-between gap-3 border-b border-border/80 bg-background px-4 py-3">
        <div className="min-w-0">
          <h1 className="text-base font-semibold">{t('adminInquiries.title')}</h1>
          <p className="truncate text-xs text-muted-foreground">{t('adminInquiries.subtitle')}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <LanguageSwitcher />
          <AuthControls />
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl space-y-4 p-4">
        <Card>
          <CardContent>
            <div className="flex flex-wrap items-end gap-3">
              <Field className="w-full sm:w-64">
                <FieldLabel htmlFor="admin-inquiries-client">
                  {t('adminInquiries.filter.client')}
                </FieldLabel>
                <Input
                  id="admin-inquiries-client"
                  type="search"
                  value={searchInput}
                  maxLength={ADMIN_INQUIRY_CLIENT_QUERY_MAX_LENGTH}
                  placeholder={t('adminInquiries.filter.clientPlaceholder')}
                  onChange={(event) => setSearchInput(event.target.value)}
                />
              </Field>
              <Field className="w-44">
                <FieldLabel htmlFor="admin-inquiries-status">
                  {t('adminInquiries.filter.status')}
                </FieldLabel>
                <Select
                  value={raw.status ?? ALL_STATUSES}
                  onValueChange={(value) =>
                    updateParams({ status: value === ALL_STATUSES ? undefined : value })
                  }
                >
                  <SelectTrigger id="admin-inquiries-status" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_STATUSES}>
                      {t('adminInquiries.filter.allStatuses')}
                    </SelectItem>
                    {inquiryStatusSchema.options.map((option) => (
                      <SelectItem key={option} value={option}>
                        {t(statusKey(option))}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field className="w-40" data-invalid={dateError !== undefined}>
                <FieldLabel htmlFor="admin-inquiries-from">
                  {t('adminInquiries.filter.from')}
                </FieldLabel>
                <Input
                  id="admin-inquiries-from"
                  type="date"
                  value={raw.from ?? ''}
                  max={raw.to}
                  aria-invalid={dateError !== undefined}
                  onChange={(event) => updateParams({ from: event.target.value || undefined })}
                />
              </Field>
              <Field className="w-40" data-invalid={dateError !== undefined}>
                <FieldLabel htmlFor="admin-inquiries-to">
                  {t('adminInquiries.filter.to')}
                </FieldLabel>
                <Input
                  id="admin-inquiries-to"
                  type="date"
                  value={raw.to ?? ''}
                  min={raw.from}
                  aria-invalid={dateError !== undefined}
                  onChange={(event) => updateParams({ to: event.target.value || undefined })}
                />
              </Field>
              <Button
                variant="outline"
                disabled={!hasFilters && !searchInput}
                onClick={resetFilters}
              >
                {t('adminInquiries.filter.reset')}
              </Button>
            </div>
            {!parsed.success && (
              <FieldError
                className="mt-2"
                errors={[
                  {
                    message: fieldErrorText(dateError?.message ?? parsed.error.issues[0]?.message),
                  },
                ]}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('adminInquiries.listTitle', { count: total })}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!parsed.success ? (
              <p className="text-sm text-muted-foreground">{t('adminInquiries.fixFilters')}</p>
            ) : list.isPending ? (
              <div className="space-y-2" aria-busy="true">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : list.isError ? (
              <div className="py-6 text-center">
                <p className="text-sm font-medium">{t('adminInquiries.loadFailed')}</p>
                <p className="mt-1 text-sm text-muted-foreground">{apiErrorText(list.error)}</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => void list.refetch()}
                >
                  {t('adminInquiries.retry')}
                </Button>
              </div>
            ) : inquiries.length === 0 ? (
              <div className="py-6 text-center">
                <p className="text-sm text-muted-foreground">
                  {hasFilters ? t('adminInquiries.emptyFiltered') : t('adminInquiries.empty')}
                </p>
                {hasFilters && (
                  <Button variant="outline" size="sm" className="mt-3" onClick={resetFilters}>
                    {t('adminInquiries.filter.reset')}
                  </Button>
                )}
              </div>
            ) : (
              <>
                <Table aria-busy={list.isFetching}>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('adminInquiries.column.date')}</TableHead>
                      <TableHead>{t('adminInquiries.column.client')}</TableHead>
                      <TableHead>{t('adminInquiries.column.placement')}</TableHead>
                      <TableHead>{t('adminInquiries.column.vendor')}</TableHead>
                      <TableHead>{t('adminInquiries.column.status')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {inquiries.map((inquiry) => (
                      <TableRow
                        key={inquiry.id}
                        tabIndex={0}
                        className="cursor-pointer"
                        aria-current={inquiry.id === selectedId ? 'true' : undefined}
                        onClick={() => openInquiry(inquiry.id)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            openInquiry(inquiry.id)
                          }
                        }}
                      >
                        <TableCell className="whitespace-nowrap">
                          {formatInquiryDate(inquiry.createdAt, locale)}
                        </TableCell>
                        <TableCell>
                          <p className="font-medium">{inquiry.contactName}</p>
                          <p className="text-xs text-muted-foreground">{inquiry.client.email}</p>
                        </TableCell>
                        <TableCell>
                          {inquiry.placement ? (
                            <>
                              <p>{inquiry.placement.title}</p>
                              <p className="text-xs text-muted-foreground">
                                {t(`placement.type.${inquiry.placement.type}`)},{' '}
                                {inquiry.placement.city}
                              </p>
                            </>
                          ) : (
                            <span className="text-muted-foreground">
                              {t('inquiry.row.deleted')}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>{inquiry.vendor.companyName ?? inquiry.vendor.email}</TableCell>
                        <TableCell>
                          <InquiryStatusBadge status={inquiry.status} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <nav
                  className="flex items-center justify-between gap-2"
                  aria-label={t('adminInquiries.pagination')}
                >
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => updateParams({ page: String(page - 1) }, false)}
                  >
                    {t('adminInquiries.prev')}
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    {t('adminInquiries.page', { page, pages })}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= pages}
                    onClick={() => updateParams({ page: String(page + 1) }, false)}
                  >
                    {t('adminInquiries.next')}
                  </Button>
                </nav>
              </>
            )}
          </CardContent>
        </Card>
      </main>

      <InquiryDetailDialog id={selectedId} onClose={() => openInquiry(undefined)} />
    </div>
  )
}

function InquiryDetailDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { t } = useLocale()
  const { apiErrorText } = useMessages()
  const redirectOnAuthError = useAuthRedirect()

  const detail = useQuery({
    queryKey: adminInquiryKey(id ?? ''),
    queryFn: () => fetchAdminInquiry(id ?? ''),
    enabled: id !== null,
  })

  useEffect(() => {
    if (detail.error) redirectOnAuthError(detail.error)
  }, [detail.error, redirectOnAuthError])

  return (
    <Dialog open={id !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('adminInquiries.detail.title')}</DialogTitle>
          <DialogDescription>{t('adminInquiries.detail.description')}</DialogDescription>
        </DialogHeader>
        {detail.isPending ? (
          <div className="space-y-2" aria-busy="true">
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : detail.isError ? (
          <div className="py-4 text-center">
            <p className="text-sm text-destructive">{apiErrorText(detail.error)}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => void detail.refetch()}
            >
              {t('adminInquiries.retry')}
            </Button>
          </div>
        ) : (
          <InquiryDetail inquiry={detail.data} />
        )}
      </DialogContent>
    </Dialog>
  )
}

function DetailItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="break-words text-sm">{children}</dd>
    </div>
  )
}

function InquiryDetail({ inquiry }: { inquiry: AdminInquiryDetail }) {
  const { locale, t } = useLocale()
  const { placement } = inquiry
  const messages = [...inquiry.messages].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <InquiryStatusBadge status={inquiry.status} />
        <span className="text-xs text-muted-foreground">
          {t('adminInquiries.detail.created')}: {formatDateTime(inquiry.createdAt, locale)} ·{' '}
          {t('adminInquiries.detail.updated')}: {formatDateTime(inquiry.updatedAt, locale)}
        </span>
      </div>

      <dl className="grid gap-3 sm:grid-cols-2">
        <DetailItem label={t('adminInquiries.detail.clientAccount')}>
          {inquiry.client.email}
        </DetailItem>
        <DetailItem label={t('adminInquiries.detail.contact')}>
          <span className="block">{inquiry.contactName}</span>
          <span className="block">{inquiry.contactEmail}</span>
          <span className="block">{formatUzPhone(inquiry.contactPhone)}</span>
        </DetailItem>
        <DetailItem label={t('adminInquiries.detail.vendor')}>
          {inquiry.vendor.companyName && (
            <span className="block">{inquiry.vendor.companyName}</span>
          )}
          <span className="block">{inquiry.vendor.email}</span>
        </DetailItem>
        <DetailItem label={t('adminInquiries.detail.placement')}>
          {placement ? (
            <>
              {placement.isViewable ? (
                <Link
                  to={`/placements?focus=${placement.id}`}
                  className="block font-medium text-primary underline-offset-4 hover:underline"
                >
                  {placement.title}
                </Link>
              ) : (
                <span className="block">{placement.title}</span>
              )}
              <span className="block text-muted-foreground">
                {t(`placement.type.${placement.type}`)}, {placement.city}
              </span>
            </>
          ) : (
            <span className="text-muted-foreground">{t('inquiry.row.deleted')}</span>
          )}
        </DetailItem>
        <DetailItem label={t('inquiry.row.start')}>
          {inquiry.desiredStartDate
            ? formatInquiryDate(inquiry.desiredStartDate, locale)
            : t('adminInquiries.detail.notSet')}
        </DetailItem>
        <DetailItem label={t('inquiry.row.duration')}>
          {inquiry.durationMonths !== null
            ? t('inquiry.months', { count: inquiry.durationMonths })
            : t('adminInquiries.detail.notSet')}
        </DetailItem>
      </dl>

      <Separator />

      <section className="space-y-2">
        <h3 className="text-sm font-medium">{t('adminInquiries.detail.messages')}</h3>
        {messages.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('adminInquiries.detail.noMessages')}</p>
        ) : (
          <ol className="space-y-2">
            {messages.map((message, index) => (
              <li key={index} className="rounded-lg border border-border/80 bg-muted/30 p-3">
                <p className="mb-1 text-xs text-muted-foreground">
                  <span className="font-medium">
                    {t(`adminInquiries.author.${message.author}`)}
                  </span>{' '}
                  · {formatDateTime(message.createdAt, locale)}
                </p>
                {/* Plain text; nothing in this pipeline renders it as HTML. */}
                <p className="whitespace-pre-wrap text-sm">{message.body}</p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  )
}
