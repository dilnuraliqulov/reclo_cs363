import { zodResolver } from '@hookform/resolvers/zod'
import { createVendorRequestSchema, type CreateVendorRequest } from '@reclo/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { ME_KEY } from '@/auth/useAuth'
import { AuthControls } from '@/components/auth/AuthControls'
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
import { ApiRequestError, createVendor, fetchVendors } from '@/lib/api'
import { useMessages } from '@/lib/messages'
import { generatePassword } from '@/lib/password'

// Admin screens are English only: KAN-76 scoped translation to the client-facing UI. The strings
// stay together here so they can move into the catalogs if that changes.
const copy = {
  title: 'Vendors',
  subtitle: 'Create accounts for billboard and LED screen owners.',
  formTitle: 'New vendor account',
  formDescription: 'The vendor signs in with this email and password. Share them securely.',
  companyName: 'Company name',
  email: 'Email',
  password: 'Password',
  passwordHint: 'At least 8 characters. Copy it before creating the account.',
  generate: 'Generate',
  submit: 'Create vendor account',
  submitting: 'Creating…',
  created: (email: string) => `Vendor account created for ${email}`,
  emailTaken: 'An account with this email already exists',
  listTitle: (count: number) => `Vendor accounts (${count})`,
  listLoadFailed: 'Could not load vendor accounts.',
  empty: 'No vendor accounts yet.',
  createdColumn: 'Created',
}

const VENDORS_QUERY_KEY = ['admin', 'vendors'] as const

const dateFormat = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' })

const emptyForm: CreateVendorRequest = { companyName: '', email: '', password: '' }

export function AdminVendorsPage() {
  const { apiErrorText, fieldError } = useMessages()
  const queryClient = useQueryClient()
  // A generated password is shown so it can be copied; a typed one stays masked.
  const [showPassword, setShowPassword] = useState(false)

  const vendors = useQuery({ queryKey: VENDORS_QUERY_KEY, queryFn: fetchVendors })

  const form = useForm<CreateVendorRequest>({
    resolver: zodResolver(createVendorRequestSchema),
    defaultValues: emptyForm,
  })

  const create = useMutation({
    mutationFn: createVendor,
    onSuccess: (vendor) => {
      toast.success(copy.created(vendor.email))
      form.reset(emptyForm)
      setShowPassword(false)
      void queryClient.invalidateQueries({ queryKey: VENDORS_QUERY_KEY })
    },
    onError: (error) => {
      if (error instanceof ApiRequestError) {
        // The session ended or lost its role while the page was open; the route guard takes over.
        if (error.status === 401 || error.status === 403) {
          void queryClient.invalidateQueries({ queryKey: ME_KEY })
          return
        }
        if (error.status === 409) {
          form.setError('email', { message: copy.emailTaken })
          return
        }
        if (error.fieldErrors) {
          for (const [name, messages] of Object.entries(error.fieldErrors)) {
            if (isFormField(name) && messages[0]) form.setError(name, { message: messages[0] })
          }
        }
      }
      toast.error(apiErrorText(error))
    },
  })

  const list = vendors.data ?? []

  return (
    <div className="min-h-dvh bg-muted/20">
      <header className="flex items-center justify-between gap-3 border-b border-border/80 bg-background px-4 py-3">
        <div className="min-w-0">
          <h1 className="text-base font-semibold">{copy.title}</h1>
          <p className="truncate text-xs text-muted-foreground">{copy.subtitle}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <AuthControls />
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl space-y-4 p-4">
        <Card>
          <CardHeader>
            <CardTitle>{copy.formTitle}</CardTitle>
            <CardDescription>{copy.formDescription}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={form.handleSubmit((values) => create.mutate(values))} noValidate>
              <FieldGroup>
                <Controller
                  name="companyName"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="vendor-company">{copy.companyName}</FieldLabel>
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
                      <FieldLabel htmlFor="vendor-email">{copy.email}</FieldLabel>
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
                      <FieldLabel htmlFor="vendor-password">{copy.password}</FieldLabel>
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
                          {copy.generate}
                        </Button>
                      </div>
                      <FieldDescription>{copy.passwordHint}</FieldDescription>
                      {fieldState.invalid && <FieldError errors={[fieldError(fieldState.error)]} />}
                    </Field>
                  )}
                />
                <Button type="submit" className="self-end" disabled={create.isPending}>
                  {create.isPending ? copy.submitting : copy.submit}
                </Button>
              </FieldGroup>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{copy.listTitle(list.length)}</CardTitle>
          </CardHeader>
          <CardContent>
            {vendors.isPending ? (
              <div className="space-y-2" aria-busy="true">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : vendors.isError ? (
              <p className="text-sm text-destructive">{copy.listLoadFailed}</p>
            ) : list.length === 0 ? (
              <p className="text-sm text-muted-foreground">{copy.empty}</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{copy.companyName}</TableHead>
                    <TableHead>{copy.email}</TableHead>
                    <TableHead>{copy.createdColumn}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.map((vendor) => (
                    <TableRow key={vendor.id}>
                      <TableCell className="font-medium">{vendor.companyName}</TableCell>
                      <TableCell>{vendor.email}</TableCell>
                      <TableCell>{dateFormat.format(new Date(vendor.createdAt))}</TableCell>
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

function isFormField(name: string): name is keyof CreateVendorRequest {
  return name in emptyForm
}
