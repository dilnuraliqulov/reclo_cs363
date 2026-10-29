import { zodResolver } from '@hookform/resolvers/zod'
import {
  createPlacementRequestSchema,
  LISTING_LIMITS,
  placementTypeSchema,
  type CreatePlacementFormValues,
  type CreatePlacementRequest,
  type UpdatePlacementRequest,
  type VendorPlacement,
} from '@reclo/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Controller, useForm, useWatch, type Control, type Resolver } from 'react-hook-form'
import { Link, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { LocationPicker } from '@/components/vendor/LocationPicker'
import { PhotosCard } from '@/components/vendor/PhotosCard'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { useApiErrorHandler } from '@/hooks/useApiErrorHandler'
import { useT } from '@/i18n/useLocale'
import { ApiRequestError } from '@/lib/api'
import { useMessages } from '@/lib/messages'
import { formatPrice } from '@/lib/placements'
import { createVendorPlacement, updateVendorPlacement } from '@/lib/vendor-placements'

type FieldName = keyof CreatePlacementFormValues

const FIELD_NAMES: FieldName[] = [
  'title',
  'description',
  'type',
  'latitude',
  'longitude',
  'address',
  'city',
  'pricePerMonth',
  'width',
  'height',
  'lighting',
]

const EMPTY_VALUES: CreatePlacementFormValues = {
  title: '',
  description: '',
  type: undefined as unknown as CreatePlacementFormValues['type'],
  latitude: undefined as unknown as number,
  longitude: undefined as unknown as number,
  address: '',
  city: '',
  pricePerMonth: '',
  width: '',
  height: '',
  lighting: false,
}

function valuesFrom(placement: VendorPlacement): CreatePlacementFormValues {
  return {
    title: placement.title,
    description: placement.description ?? '',
    type: placement.type,
    latitude: placement.latitude,
    longitude: placement.longitude,
    address: placement.address,
    city: placement.city,
    pricePerMonth: String(placement.pricePerMonth),
    width: placement.width === null ? '' : String(placement.width),
    height: placement.height === null ? '' : String(placement.height),
    lighting: placement.lighting,
  }
}

const blankToUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value

// The shared schema's optional fields are "absent", not "empty": a cleared text box must reach it as
// absent, or `width` would coerce '' to 0 and fail the range check.
const baseResolver = zodResolver(createPlacementRequestSchema)
const resolver: Resolver<CreatePlacementFormValues, unknown, CreatePlacementRequest> = (
  values,
  context,
  options,
) =>
  baseResolver(
    {
      ...values,
      description: blankToUndefined(values.description) as string | undefined,
      width: blankToUndefined(values.width),
      height: blankToUndefined(values.height),
    },
    context,
    options,
  )

const roundCoordinate = (value: number) => Math.round(value * 1e6) / 1e6

interface ListingFormProps {
  /** The listing being edited, or null to create one. */
  placement: VendorPlacement | null
  /** The server's copy of the listing changed (photos, restore); the page keeps its cache current. */
  onPlacementChange: (placement: VendorPlacement) => void
  /** The photo card finished a batch; the page refetches. */
  onPhotosSettled: () => void
  /** A listing status banner or any other content to show above the form. */
  banner?: React.ReactNode
}

export function ListingForm({
  placement,
  onPlacementChange,
  onPhotosSettled,
  banner,
}: ListingFormProps) {
  const t = useT()
  const { fieldError } = useMessages()
  const handleError = useApiErrorHandler()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const form = useForm<CreatePlacementFormValues, unknown, CreatePlacementRequest>({
    resolver,
    defaultValues: placement ? valuesFrom(placement) : EMPTY_VALUES,
    // Validate on submit first, then on every change, as the design says.
    mode: 'onSubmit',
    reValidateMode: 'onChange',
  })
  const { control, formState, setValue } = form
  const { dirtyFields, isDirty } = formState

  const archived = placement?.status === 'ARCHIVED'

  const save = useMutation({
    mutationFn: async (data: CreatePlacementRequest) => {
      if (!placement) return createVendorPlacement(data)
      // Only what changed: an untouched field is not re-sent, so it cannot re-trigger moderation.
      const patch: Record<string, unknown> = {}
      for (const key of Object.keys(dirtyFields) as (keyof CreatePlacementRequest)[]) {
        if (data[key] !== undefined) patch[key] = data[key]
      }
      return updateVendorPlacement(placement.id, patch as UpdatePlacementRequest)
    },
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: ['vendor-placements'] })
      queryClient.setQueryData(['vendor-placement', saved.id], saved)
      if (!placement) {
        toast.success(t('listing.saved.created'))
        void navigate(`/vendor/placements/${saved.id}/edit`, { replace: true })
        return
      }
      const wasLive = placement.status === 'ACTIVE' || placement.status === 'INACTIVE'
      toast.success(
        wasLive && saved.status === 'PENDING_REVIEW'
          ? t('listing.saved.backInReview')
          : t('listing.saved.changes'),
      )
      form.reset(valuesFrom(saved))
      onPlacementChange(saved)
    },
    onError: (error) => {
      // A 400 carries a message per field: put each next to its input.
      if (error instanceof ApiRequestError && error.status === 400 && error.fieldErrors) {
        let mapped = false
        for (const [name, messages] of Object.entries(error.fieldErrors)) {
          if (FIELD_NAMES.includes(name as FieldName) && messages[0]) {
            form.setError(name as FieldName, { message: messages[0] }, { shouldFocus: !mapped })
            mapped = true
          }
        }
        if (mapped) return
      }
      handleError(error)
    },
  })

  // The browser's own prompt, for a closed tab or a typed address. Navigation inside the app is not
  // intercepted: the app uses <BrowserRouter>, which has no blocker.
  useEffect(() => {
    if (!isDirty || save.isPending) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [isDirty, save.isPending])

  const description = useWatch({ control, name: 'description' }) ?? ''
  const price = Number(useWatch({ control, name: 'pricePerMonth' }))
  const latitude = useWatch({ control, name: 'latitude' }) as number | undefined
  const longitude = useWatch({ control, name: 'longitude' }) as number | undefined

  const locked = save.isPending || archived
  const nearLimit = description.length >= LISTING_LIMITS.descriptionMax * 0.9

  function pickLocation(nextLatitude: number, nextLongitude: number) {
    const options = { shouldDirty: true, shouldValidate: true }
    setValue('latitude', roundCoordinate(nextLatitude), options)
    setValue('longitude', roundCoordinate(nextLongitude), options)
  }

  return (
    <form
      noValidate
      onSubmit={form.handleSubmit((data) => save.mutate(data))}
      className="space-y-4 pb-24"
    >
      {banner}
      <fieldset disabled={locked} className="min-w-0 space-y-4 border-0 p-0">
        <Card role="group" aria-labelledby="listing-basics-title">
          <CardHeader>
            <CardTitle id="listing-basics-title">{t('listing.editor.basics')}</CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Controller
                name="title"
                control={control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="listing-title">{t('listing.field.title')}</FieldLabel>
                    <Input
                      {...field}
                      id="listing-title"
                      aria-invalid={fieldState.invalid}
                      value={String(field.value ?? '')}
                    />
                    {fieldState.invalid && <FieldError errors={[fieldError(fieldState.error)]} />}
                  </Field>
                )}
              />
              <Controller
                name="type"
                control={control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="listing-type">{t('listing.field.type')}</FieldLabel>
                    <Select
                      value={field.value ?? ''}
                      onValueChange={field.onChange}
                      disabled={locked}
                    >
                      <SelectTrigger
                        id="listing-type"
                        ref={field.ref}
                        onBlur={field.onBlur}
                        aria-invalid={fieldState.invalid}
                        className="w-full"
                      >
                        <SelectValue placeholder={t('listing.field.typePlaceholder')} />
                      </SelectTrigger>
                      <SelectContent>
                        {placementTypeSchema.options.map((type) => (
                          <SelectItem key={type} value={type}>
                            {t(`listing.type.${type}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {fieldState.invalid && <FieldError errors={[fieldError(fieldState.error)]} />}
                  </Field>
                )}
              />
              <Controller
                name="description"
                control={control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="listing-description">
                      {t('listing.field.description')}
                    </FieldLabel>
                    <Textarea
                      {...field}
                      id="listing-description"
                      rows={5}
                      aria-invalid={fieldState.invalid}
                      value={field.value ?? ''}
                    />
                    <FieldDescription
                      className="text-right tabular-nums"
                      aria-live={nearLimit ? 'polite' : 'off'}
                    >
                      {t('listing.field.counter', {
                        count: description.length,
                        max: LISTING_LIMITS.descriptionMax,
                      })}
                    </FieldDescription>
                    {fieldState.invalid && <FieldError errors={[fieldError(fieldState.error)]} />}
                  </Field>
                )}
              />
            </FieldGroup>
          </CardContent>
        </Card>

        <Card role="group" aria-labelledby="listing-location-title">
          <CardHeader>
            <CardTitle id="listing-location-title">{t('listing.editor.location')}</CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Controller
                name="city"
                control={control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="listing-city">{t('listing.field.city')}</FieldLabel>
                    <Input
                      {...field}
                      id="listing-city"
                      aria-invalid={fieldState.invalid}
                      value={String(field.value ?? '')}
                    />
                    {fieldState.invalid && <FieldError errors={[fieldError(fieldState.error)]} />}
                  </Field>
                )}
              />
              <Controller
                name="address"
                control={control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="listing-address">{t('listing.field.address')}</FieldLabel>
                    <Input
                      {...field}
                      id="listing-address"
                      aria-invalid={fieldState.invalid}
                      value={String(field.value ?? '')}
                    />
                    {fieldState.invalid && <FieldError errors={[fieldError(fieldState.error)]} />}
                  </Field>
                )}
              />
              <LocationPicker
                latitude={latitude}
                longitude={longitude}
                onChange={pickLocation}
                disabled={locked}
              />
              <p className="text-xs text-muted-foreground">{t('listing.map.hint')}</p>
              <p className="text-xs" aria-live="polite">
                {latitude !== undefined && longitude !== undefined
                  ? t('listing.map.coordinates', { lat: latitude, lng: longitude })
                  : t('listing.map.noPin')}
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <CoordinateField
                  control={control}
                  name="latitude"
                  id="listing-latitude"
                  label={t('listing.field.latitude')}
                />
                <CoordinateField
                  control={control}
                  name="longitude"
                  id="listing-longitude"
                  label={t('listing.field.longitude')}
                />
              </div>
            </FieldGroup>
          </CardContent>
        </Card>

        <Card role="group" aria-labelledby="listing-pricing-title">
          <CardHeader>
            <CardTitle id="listing-pricing-title">{t('listing.editor.pricing')}</CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Controller
                name="pricePerMonth"
                control={control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="listing-price">{t('listing.field.price')}</FieldLabel>
                    <Input
                      {...field}
                      id="listing-price"
                      inputMode="numeric"
                      aria-invalid={fieldState.invalid}
                      value={String(field.value ?? '')}
                    />
                    {Number.isFinite(price) && price > 0 && (
                      <FieldDescription>{formatPrice(price)}</FieldDescription>
                    )}
                    {fieldState.invalid && <FieldError errors={[fieldError(fieldState.error)]} />}
                  </Field>
                )}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <Controller
                  name="width"
                  control={control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="listing-width">{t('listing.field.width')}</FieldLabel>
                      <Input
                        {...field}
                        id="listing-width"
                        inputMode="decimal"
                        aria-invalid={fieldState.invalid}
                        value={String(field.value ?? '')}
                      />
                      {fieldState.invalid && <FieldError errors={[fieldError(fieldState.error)]} />}
                    </Field>
                  )}
                />
                <Controller
                  name="height"
                  control={control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="listing-height">{t('listing.field.height')}</FieldLabel>
                      <Input
                        {...field}
                        id="listing-height"
                        inputMode="decimal"
                        aria-invalid={fieldState.invalid}
                        value={String(field.value ?? '')}
                      />
                      {fieldState.invalid && <FieldError errors={[fieldError(fieldState.error)]} />}
                    </Field>
                  )}
                />
              </div>
              <Controller
                name="lighting"
                control={control}
                render={({ field }) => (
                  <Field orientation="horizontal">
                    <Switch
                      id="listing-lighting"
                      checked={field.value ?? false}
                      onCheckedChange={field.onChange}
                      onBlur={field.onBlur}
                    />
                    <FieldLabel htmlFor="listing-lighting">
                      {t('listing.field.lighting')}
                    </FieldLabel>
                  </Field>
                )}
              />
            </FieldGroup>
          </CardContent>
        </Card>
      </fieldset>

      <PhotosCard
        placement={placement}
        disabled={archived}
        onChange={(updated) => {
          queryClient.setQueryData(['vendor-placement', updated.id], updated)
          onPlacementChange(updated)
        }}
        onSettled={onPhotosSettled}
      />

      <div className="fixed inset-x-0 bottom-0 z-20 flex justify-end gap-2 border-t border-border/80 bg-background/95 p-3 backdrop-blur-sm">
        <Button variant="outline" asChild>
          <Link to="/vendor/placements">{t('listing.cancel')}</Link>
        </Button>
        <Button type="submit" disabled={locked || (placement !== null && !isDirty)}>
          {save.isPending
            ? t('listing.submit.saving')
            : placement
              ? t('listing.submit.save')
              : t('listing.submit.create')}
        </Button>
      </div>
    </form>
  )
}

/**
 * A latitude/longitude input. It keeps its own text, because a number cannot hold "41." while the
 * user is still typing, and follows the form when the map moves the pin.
 */
function CoordinateField({
  control,
  name,
  id,
  label,
}: {
  control: Control<CreatePlacementFormValues, unknown, CreatePlacementRequest>
  name: 'latitude' | 'longitude'
  id: string
  label: string
}) {
  const { fieldError } = useMessages()
  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState }) => (
        <CoordinateInput
          id={id}
          label={label}
          value={field.value as number | undefined}
          inputRef={field.ref}
          onBlur={field.onBlur}
          onValue={field.onChange}
          invalid={fieldState.invalid}
          error={fieldState.invalid ? fieldError(fieldState.error) : undefined}
        />
      )}
    />
  )
}

function CoordinateInput({
  id,
  label,
  value,
  inputRef,
  onBlur,
  onValue,
  invalid,
  error,
}: {
  id: string
  label: string
  value: number | undefined
  inputRef: React.Ref<HTMLInputElement>
  onBlur: () => void
  onValue: (value: number | undefined) => void
  invalid: boolean
  error: { message?: string } | undefined
}) {
  const [text, setText] = useState(value === undefined ? '' : String(value))

  // The map moved the pin: show its value, unless the text already means the same number. Done
  // while rendering, the way React documents it for state that follows a prop.
  const [shown, setShown] = useState(value)
  if (value !== shown) {
    setShown(value)
    if (value !== undefined && Number(text) !== value) setText(String(value))
  }

  return (
    <Field data-invalid={invalid}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        ref={inputRef}
        inputMode="decimal"
        value={text}
        aria-invalid={invalid}
        onBlur={onBlur}
        onChange={(event) => {
          const next = event.target.value
          setText(next)
          const parsed = next.trim() === '' ? undefined : Number(next.replace(',', '.'))
          onValue(parsed === undefined || Number.isNaN(parsed) ? undefined : parsed)
        }}
      />
      {invalid && <FieldError errors={[error ?? {}]} />}
    </Field>
  )
}
