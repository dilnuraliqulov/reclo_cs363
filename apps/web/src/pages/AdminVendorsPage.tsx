import { zodResolver } from '@hookform/resolvers/zod'
import { createVendorRequestSchema, type CreateVendorRequest } from '@reclo/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { ME_KEY } from '@/auth/useAuth'
import { AuthControls } from '@/components/auth/AuthControls'
import { FormError } from '@/components/forms/FormError'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useFormFailure } from '@/hooks/useFormFailure'
import { useLocale } from '@/i18n/useLocale'
import { ApiRequestError, createVendor, fetchVendors } from '@/lib/api'
import { useMessages } from '@/lib/messages'
import { formatDateTime } from '@/lib/moderation'
import { generatePassword } from '@/lib/password'

const VENDORS_QUERY_KEY = ['admin', 'vendors'] as const

const emptyForm: CreateVendorRequest = { companyName: '', email: '', password: '' }

export function AdminVendorsPage() {
  const { locale, t } = useLocale()
  const { fieldError } = useMessages()
  const queryClient = useQueryClient()
  // A generated password is shown so it can be copied; a typed one stays masked.
  const [showPassword, setShowPassword] = useState(false)

  const vendors = useQuery({ queryKey: VENDORS_QUERY_KEY, queryFn: fetchVendors })

  const form = useForm<CreateVendorRequest>({
    resolver: zodResolver(createVendorRequestSchema),
    defaultValues: emptyForm,
  })
  const { formError, fail, clear } = useFormFailure(form)

  const create = useMutation({
    mutationFn: createVendor,
    onSuccess: (vendor) => {
      toast.success(t('adminVendors.created', { email: vendor.email }))
      form.reset(emptyForm)
      setShowPassword(false)
      void queryClient.invalidateQueries({ queryKey: VENDORS_QUERY_KEY })
    },
    onError: (error) => {
      // The session ended or lost its role while the page was open; the route guard takes over.
      if (error instanceof ApiRequestError && (error.status === 401 || error.status === 403)) {
        void queryClient.invalidateQueries({ queryKey: ME_KEY })
        return
      }
      // Field codes (including EMAIL_TAKEN on `email`) land next to their inputs; the rest, such
      // as a rate limit or a server error, becomes the form-level message.
      fail(error)
    },
  })

  const list = vendors.data ?? []

  return (
    <div className="min-h-dvh bg-muted/20">
      <header className="flex items-center justify-between gap-3 border-b border-border/80 bg-background px-4 py-3">
        <div className="min-w-0">
          <h1 className="text-base font-semibold">{t('adminVendors.title')}</h1>
          <p className="truncate text-xs text-muted-foreground">{t('adminVendors.subtitle')}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <AuthControls />
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl space-y-4 p-4">
        <Card>
          <CardHeader>
            <CardTitle>{t('adminVendors.formTitle')}</CardTitle>
            <CardDescription>{t('adminVendors.formDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={form.handleSubmit((values) => {
                clear()
                create.mutate(values)
              })}
              noValidate
            >
              <FieldGroup>
                <Controller
                  name="companyName"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="vendor-company">
                        {t('adminVendors.companyName')}
                      </FieldLabel>
                      <Input
                        {...field}
                        id="vendor-company"
                        autoComplete="organization"
                        disabled={create.isPending}
                        aria-invalid={fieldState.invalid}
                      />
                      {fieldState.invalid && <FieldError errors={[fieldError(fieldState.error)]} />}
                    </Field>
                  )}
                />
                <Controller
                  name="email"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="vendor-email">{t('common.email')}</FieldLabel>
                      <Input
                        {...field}
                        id="vendor-email"
                        type="email"
                        autoComplete="off"
                        disabled={create.isPending}
                        aria-invalid={fieldState.invalid}
                      />
                      {fieldState.invalid && <FieldError errors={[fieldError(fieldState.error)]} />}
                    </Field>
                  )}
                />
                <Controller
                  name="password"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="vendor-password">{t('common.password')}</FieldLabel>
                      <div className="flex gap-2">
                        <Input
                          {...field}
                          onChange={(event) => {
                            setShowPassword(false)
                            field.onChange(event)
                          }}
                          id="vendor-password"
                          type={showPassword ? 'text' : 'password'}
                          autoComplete="new-password"
                          disabled={create.isPending}
                          aria-invalid={fieldState.invalid}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          disabled={create.isPending}
                          onClick={() => {
                            form.setValue('password', generatePassword(), {
                              shouldValidate: form.formState.isSubmitted,
                            })
                            setShowPassword(true)
                          }}
                        >
                          {t('adminVendors.generate')}
                        </Button>
                      </div>
                      <FieldDescription>{t('adminVendors.passwordHint')}</FieldDescription>
                      {fieldState.invalid && <FieldError errors={[fieldError(fieldState.error)]} />}
                    </Field>
                  )}
                />
                <FormError message={formError} />
                <Button type="submit" className="self-end" disabled={create.isPending}>
                  {create.isPending ? t('adminVendors.submitting') : t('adminVendors.submit')}
                </Button>
              </FieldGroup>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('adminVendors.listTitle', { count: list.length })}</CardTitle>
          </CardHeader>
          <CardContent>
            {vendors.isPending ? (
              <div className="space-y-2" aria-busy="true">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : vendors.isError ? (
              <p className="text-sm text-destructive">{t('adminVendors.listLoadFailed')}</p>
            ) : list.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('adminVendors.empty')}</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('adminVendors.companyName')}</TableHead>
                    <TableHead>{t('common.email')}</TableHead>
                    <TableHead>{t('adminVendors.createdColumn')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.map((vendor) => (
                    <TableRow key={vendor.id}>
                      <TableCell className="font-medium">{vendor.companyName}</TableCell>
                      <TableCell>{vendor.email}</TableCell>
                      <TableCell>{formatDateTime(vendor.createdAt, locale)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
