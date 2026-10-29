import { zodResolver } from '@hookform/resolvers/zod'
import {
  computeVat,
  DEFAULT_VAT_RATE_BPS,
  MINOR_UNITS_PER_UZS,
  placementPricingSchema,
  PRICING_MAX_DURATIONS,
  PRICING_MAX_TERMS,
  type PlacementPricing,
  type VendorPlacement,
} from '@reclo/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, X } from 'lucide-react'
import { Controller, useForm, useWatch, type Control, type Path } from 'react-hook-form'
import { toast } from 'sonner'
import { FormError } from '@/components/forms/FormError'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useApiErrorHandler } from '@/hooks/useApiErrorHandler'
import { useT } from '@/i18n/useLocale'
import { useMessages } from '@/lib/messages'
import { formatPrice } from '@/lib/placements'
import { fetchVendorPlacementPricing, saveVendorPlacementPricing } from '@/lib/vendor-placements'

const pricingKey = (id: string) => ['vendor-placement-pricing', id]

/** UZS as typed into a box, to integer tiyin. A blank box is NaN, so the schema flags it. */
function toTiyin(text: string): number {
  return text.trim() === '' ? Number.NaN : Math.round(Number(text) * MINOR_UNITS_PER_UZS)
}

function toInt(text: string): number {
  return text.trim() === '' ? Number.NaN : Number(text)
}

const shown = (value: number, scale = 1) => (Number.isFinite(value) ? value / scale : '')

const uzs = (tiyin: number) => formatPrice(tiyin / MINOR_UNITS_PER_UZS)

function defaultPricing(placement: VendorPlacement): PlacementPricing {
  return {
    matrix: {
      terms: [1],
      durations: [placement.ledDurationSeconds ?? 30],
      prices: [[placement.pricePerMonth * MINOR_UNITS_PER_UZS]],
    },
    vat: { vatEnabled: true, vatRate: DEFAULT_VAT_RATE_BPS },
  }
}

export function PricingCard({ placement }: { placement: VendorPlacement }) {
  const t = useT()
  const { apiErrorText } = useMessages()
  const pricing = useQuery({
    queryKey: pricingKey(placement.id),
    queryFn: () => fetchVendorPlacementPricing(placement.id),
    refetchOnWindowFocus: false,
    retry: false,
  })

  return (
    <Card role="group" aria-labelledby="listing-pricing-matrix-title">
      <CardHeader>
        <CardTitle id="listing-pricing-matrix-title">{t('pricing.title')}</CardTitle>
        <CardDescription>{t('pricing.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        {pricing.isPending ? (
          <Skeleton className="h-40 w-full" aria-hidden />
        ) : pricing.isError ? (
          <div className="space-y-2">
            <p className="text-sm font-medium">{t('pricing.loadFailed')}</p>
            <p className="text-sm text-muted-foreground">{apiErrorText(pricing.error)}</p>
            <Button variant="outline" size="sm" onClick={() => pricing.refetch()}>
              {t('listing.error.retry')}
            </Button>
          </div>
        ) : (
          <PricingEditor
            placementId={placement.id}
            initial={pricing.data ?? defaultPricing(placement)}
          />
        )}
      </CardContent>
    </Card>
  )
}

function PricingEditor({
  placementId,
  initial,
}: {
  placementId: string
  initial: PlacementPricing
}) {
  const t = useT()
  const handleError = useApiErrorHandler()
  const queryClient = useQueryClient()
  const form = useForm<PlacementPricing>({
    resolver: zodResolver(placementPricingSchema),
    defaultValues: initial,
  })
  const { control, getValues, setValue, reset, formState } = form
  const matrix = useWatch({ control, name: 'matrix' })
  const vat = useWatch({ control, name: 'vat' })

  const save = useMutation({
    mutationFn: (data: PlacementPricing) => saveVendorPlacementPricing(placementId, data),
    onSuccess: (saved) => {
      toast.success(t('pricing.saved'))
      queryClient.setQueryData(pricingKey(placementId), saved)
      reset(saved)
    },
    onError: handleError,
    onSettled: () => queryClient.invalidateQueries({ queryKey: pricingKey(placementId) }),
  })

  function setMatrix(next: PlacementPricing['matrix']) {
    setValue('matrix', next, { shouldDirty: true, shouldValidate: formState.isSubmitted })
  }

  function addTerm() {
    const m = getValues('matrix')
    const next = Math.max(0, ...m.terms.filter(Number.isFinite)) + 1
    setMatrix({
      ...m,
      terms: [...m.terms, next],
      prices: [...m.prices, m.durations.map(() => 0)],
    })
  }

  function removeTerm(index: number) {
    const m = getValues('matrix')
    setMatrix({
      ...m,
      terms: m.terms.filter((_, i) => i !== index),
      prices: m.prices.filter((_, i) => i !== index),
    })
  }

  function addDuration() {
    const m = getValues('matrix')
    const last = m.durations.filter(Number.isFinite).at(-1) ?? 0
    setMatrix({
      ...m,
      durations: [...m.durations, last + 5],
      prices: m.prices.map((row) => [...row, 0]),
    })
  }

  function removeDuration(index: number) {
    const m = getValues('matrix')
    setMatrix({
      ...m,
      durations: m.durations.filter((_, i) => i !== index),
      prices: m.prices.map((row) => row.filter((_, i) => i !== index)),
    })
  }

  const invalid = formState.isSubmitted && !formState.isValid

  return (
    <form
      noValidate
      onSubmit={form.handleSubmit((data) => save.mutate(data))}
      className="space-y-4"
    >
      <FormError message={invalid ? t('pricing.invalid') : null} />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-32 align-bottom">
              {t('pricing.termHeader')} / {t('pricing.durationHeader')}
            </TableHead>
            {matrix.durations.map((_, col) => (
              <TableHead key={col} className="min-w-36 py-2">
                <div className="flex items-center gap-1">
                  <NumberInput
                    control={control}
                    name={`matrix.durations.${col}`}
                    label={t('pricing.durationLabel', { n: col + 1 })}
                    parse={toInt}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8 shrink-0"
                    disabled={matrix.durations.length <= 1}
                    aria-label={t('pricing.removeDuration', { n: col + 1 })}
                    onClick={() => removeDuration(col)}
                  >
                    <X aria-hidden />
                  </Button>
                </div>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {matrix.terms.map((_, row) => (
            <TableRow key={row}>
              <TableCell>
                <div className="flex items-center gap-1">
                  <NumberInput
                    control={control}
                    name={`matrix.terms.${row}`}
                    label={t('pricing.termLabel', { n: row + 1 })}
                    parse={toInt}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8 shrink-0"
                    disabled={matrix.terms.length <= 1}
                    aria-label={t('pricing.removeTerm', { n: row + 1 })}
                    onClick={() => removeTerm(row)}
                  >
                    <X aria-hidden />
                  </Button>
                </div>
              </TableCell>
              {matrix.durations.map((_, col) => {
                const net = matrix.prices[row]?.[col] ?? Number.NaN
                const amounts = Number.isFinite(net) ? computeVat(net, vat) : null
                return (
                  <TableCell key={col} className="align-top">
                    <NumberInput
                      control={control}
                      name={`matrix.prices.${row}.${col}`}
                      label={t('pricing.priceLabel', { term: row + 1, duration: col + 1 })}
                      parse={toTiyin}
                      scale={MINOR_UNITS_PER_UZS}
                      step="0.01"
                    />
                    {amounts && vat.vatEnabled && (
                      <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                        {t('pricing.cellPreview', {
                          vat: uzs(amounts.vat),
                          gross: uzs(amounts.gross),
                        })}
                      </p>
                    )}
                  </TableCell>
                )
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={matrix.terms.length >= PRICING_MAX_TERMS}
          onClick={addTerm}
        >
          <Plus aria-hidden />
          {t('pricing.addTerm')}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={matrix.durations.length >= PRICING_MAX_DURATIONS}
          onClick={addDuration}
        >
          <Plus aria-hidden />
          {t('pricing.addDuration')}
        </Button>
      </div>

      <FieldGroup>
        <Controller
          name="vat.vatEnabled"
          control={control}
          render={({ field }) => (
            <Field orientation="horizontal">
              <Switch
                id="pricing-vat-enabled"
                checked={field.value}
                onCheckedChange={field.onChange}
              />
              <FieldLabel htmlFor="pricing-vat-enabled">{t('pricing.vatEnabled')}</FieldLabel>
            </Field>
          )}
        />
        <Controller
          name="vat.vatRate"
          control={control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid} className="max-w-48">
              <FieldLabel htmlFor="pricing-vat-rate">{t('pricing.vatRate')}</FieldLabel>
              <Input
                id="pricing-vat-rate"
                type="number"
                inputMode="decimal"
                step="0.01"
                min={0}
                max={100}
                disabled={!vat.vatEnabled}
                aria-invalid={fieldState.invalid}
                name={field.name}
                ref={field.ref}
                onBlur={field.onBlur}
                value={shown(field.value, 100)}
                onChange={(event) =>
                  field.onChange(
                    event.target.value.trim() === ''
                      ? Number.NaN
                      : Math.round(Number(event.target.value) * 100),
                  )
                }
              />
              <FieldDescription>{t('pricing.vatRateHint')}</FieldDescription>
            </Field>
          )}
        />
      </FieldGroup>

      <div className="flex justify-end">
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? t('pricing.saving') : t('pricing.save')}
        </Button>
      </div>
    </form>
  )
}

function NumberInput({
  control,
  name,
  label,
  parse,
  scale = 1,
  step = '1',
}: {
  control: Control<PlacementPricing>
  name: Path<PlacementPricing>
  label: string
  parse: (text: string) => number
  scale?: number
  step?: string
}) {
  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState }) => (
        <Input
          type="number"
          inputMode="decimal"
          min={0}
          step={step}
          aria-label={label}
          aria-invalid={fieldState.invalid}
          name={field.name}
          ref={field.ref}
          onBlur={field.onBlur}
          value={typeof field.value === 'number' ? shown(field.value, scale) : ''}
          onChange={(event) => field.onChange(parse(event.target.value))}
        />
      )}
    />
  )
}
