import { zodResolver } from '@hookform/resolvers/zod'
import {
  createInquiryRequestSchema,
  DURATION_MAX_MONTHS,
  inquiryConflictSchema,
  MESSAGE_MAX_LENGTH,
  type CreateInquiryFormValues,
  type CreateInquiryRequest,
  type PlacementMarker,
} from '@reclo/shared'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { Link, useLocation } from 'react-router'
import { toast } from 'sonner'
import { useAuth } from '@/auth/useAuth'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { ApiRequestError, createInquiry } from '@/lib/api'
import { formatInquiryDate } from '@/lib/inquiries'
import { apiErrorText, fieldError } from '@/lib/messages'

// All user-visible strings for this dialog, in one place for the future translation task (KAN-19).
const copy = {
  title: 'Send an inquiry',
  name: 'Your name',
  phone: 'Phone',
  phoneHint: 'Vendors usually reply on Telegram',
  email: 'Email',
  start: 'Preferred start',
  duration: 'Duration',
  durationPlaceholder: 'Select duration',
  month: 'month',
  months: 'months',
  message: 'Message',
  cancel: 'Cancel',
  submit: 'Send inquiry',
  submitting: 'Sending…',
  success: 'Inquiry sent. The vendor will contact you shortly.',
  signedOutTitle: 'Sign in to send an inquiry',
  signedOutBody: 'Inquiries are tied to your account, so you can follow them up later.',
  signIn: 'Sign in',
  duplicate: 'You already have an open inquiry for this placement',
  duplicateOn: (date: string) =>
    `You already have an open inquiry for this placement, sent ${date}.`,
}

const DURATION_OPTIONS = [1, 3, 6, 12, DURATION_MAX_MONTHS] as const

interface InquiryFormDialogProps {
  placement: PlacementMarker
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface InquiryFormProps {
  placement: PlacementMarker
  /** Pre-fills the contact email, which the client may change. */
  email: string
  onSent: () => void
  onCancel: () => void
  /** Called on a 401 mid-session, so the dialog can swap to the sign-in prompt. */
  onSessionLost: () => void
}

/** Pulls the 409 date out of the error body, when the server sent one. */
function duplicateMessage(error: unknown): string | null {
  if (!(error instanceof ApiRequestError) || error.status !== 409) return null
  const parsed = inquiryConflictSchema.safeParse(error.body)
  const sentAt = parsed.success ? parsed.data.existingInquiryCreatedAt : undefined
  return sentAt ? copy.duplicateOn(formatInquiryDate(sentAt)) : copy.duplicate
}

/**
 * The fields themselves. Mounted only once there is a session, so `defaultValues` always see the
 * account email and nothing has to reset them later.
 */
function InquiryForm({ placement, email, onSent, onCancel, onSessionLost }: InquiryFormProps) {
  // Set on a 409: the submit stays disabled, because retrying cannot succeed.
  const [duplicate, setDuplicate] = useState<string | null>(null)

  // Three generics: the schema coerces, so the values the form holds are not the values it submits.
  const form = useForm<CreateInquiryFormValues, unknown, CreateInquiryRequest>({
    resolver: zodResolver(createInquiryRequestSchema),
    mode: 'onSubmit',
    reValidateMode: 'onChange',
    defaultValues: {
      placementId: placement.id,
      message: '',
      contactName: '',
      contactPhone: '',
      contactEmail: email,
    },
  })

  const send = useMutation({
    mutationFn: createInquiry,
    onSuccess: () => {
      onSent()
      toast.success(copy.success)
    },
    onError: (error) => {
      const conflict = duplicateMessage(error)
      if (conflict) {
        setDuplicate(conflict)
        return
      }
      if (error instanceof ApiRequestError) {
        if (error.status === 401) {
          onSessionLost()
          return
        }
        if (error.fieldErrors) {
          for (const [name, messages] of Object.entries(error.fieldErrors)) {
            if (name in form.getValues() && messages[0]) {
              form.setError(name as keyof CreateInquiryFormValues, { message: messages[0] })
            }
          }
        }
      }
      toast.error(apiErrorText(error))
    },
  })

  // useWatch rather than form.watch: the latter returns a fresh function the React Compiler
  // cannot memoize, which turns the whole component into a compilation skip.
  const message = useWatch({ control: form.control, name: 'message' })
  const messageLength = message?.length ?? 0
  const isSending = send.isPending

  return (
    <form
      onSubmit={form.handleSubmit((values) => send.mutate(values))}
      noValidate
      aria-busy={isSending}
    >
      <FieldGroup>
        <Controller
          name="contactName"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="inquiry-name">{copy.name}</FieldLabel>
              <Input
                {...field}
                id="inquiry-name"
                autoComplete="name"
                disabled={isSending}
                aria-invalid={fieldState.invalid}
              />
              {fieldState.invalid && <FieldError errors={[fieldError(fieldState.error)]} />}
            </Field>
          )}
        />

        <Controller
          name="contactPhone"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="inquiry-phone">{copy.phone}</FieldLabel>
              <Input
                {...field}
                id="inquiry-phone"
                type="tel"
                autoComplete="tel"
                placeholder="+998 90 123 45 67"
                disabled={isSending}
                aria-invalid={fieldState.invalid}
              />
              <FieldDescription>{copy.phoneHint}</FieldDescription>
              {fieldState.invalid && <FieldError errors={[fieldError(fieldState.error)]} />}
            </Field>
          )}
        />

        <Controller
          name="contactEmail"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="inquiry-email">{copy.email}</FieldLabel>
              <Input
                {...field}
                id="inquiry-email"
                type="email"
                autoComplete="email"
                disabled={isSending}
                aria-invalid={fieldState.invalid}
              />
              {fieldState.invalid && <FieldError errors={[fieldError(fieldState.error)]} />}
            </Field>
          )}
        />

        <div className="grid gap-3 sm:grid-cols-2">
          <Controller
            name="desiredStartDate"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="inquiry-start">{copy.start}</FieldLabel>
                <Input
                  {...field}
                  value={field.value ?? ''}
                  id="inquiry-start"
                  type="date"
                  disabled={isSending}
                  aria-invalid={fieldState.invalid}
                />
                {fieldState.invalid && <FieldError errors={[fieldError(fieldState.error)]} />}
              </Field>
            )}
          />

          <Controller
            name="durationMonths"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="inquiry-duration">{copy.duration}</FieldLabel>
                <Select
                  value={field.value ? String(field.value) : undefined}
                  onValueChange={(value) => field.onChange(Number(value))}
                  disabled={isSending}
                >
                  <SelectTrigger
                    id="inquiry-duration"
                    aria-invalid={fieldState.invalid}
                    className="w-full"
                  >
                    <SelectValue placeholder={copy.durationPlaceholder} />
                  </SelectTrigger>
                  <SelectContent>
                    {DURATION_OPTIONS.map((months) => (
                      <SelectItem key={months} value={String(months)}>
                        {months} {months === 1 ? copy.month : copy.months}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {fieldState.invalid && <FieldError errors={[fieldError(fieldState.error)]} />}
              </Field>
            )}
          />
        </div>

        <Controller
          name="message"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="inquiry-message">{copy.message}</FieldLabel>
              <Textarea
                {...field}
                id="inquiry-message"
                rows={4}
                maxLength={MESSAGE_MAX_LENGTH}
                disabled={isSending}
                aria-invalid={fieldState.invalid}
              />
              <FieldDescription
                // Announcing every keystroke would be noise, so the counter speaks only
                // once the limit comes into view.
                aria-live={messageLength > MESSAGE_MAX_LENGTH - 100 ? 'polite' : 'off'}
              >
                {messageLength}/{MESSAGE_MAX_LENGTH}
              </FieldDescription>
              {fieldState.invalid && <FieldError errors={[fieldError(fieldState.error)]} />}
            </Field>
          )}
        />

        {duplicate && <FieldError className="font-medium">{duplicate}</FieldError>}
      </FieldGroup>

      <DialogFooter className="mt-6 flex flex-col sm:flex-row gap-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSending}>
          {copy.cancel}
        </Button>
        <Button type="submit" disabled={isSending || duplicate !== null}>
          {isSending ? copy.submitting : copy.submit}
        </Button>
      </DialogFooter>
    </form>
  )
}

export function InquiryFormDialog({ placement, open, onOpenChange }: InquiryFormDialogProps) {
  const { user } = useAuth()
  const location = useLocation()
  // A 401 mid-session swaps the body to the sign-in prompt rather than silently failing.
  const [sessionLost, setSessionLost] = useState(false)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>
            {placement.title} · {placement.address}
          </DialogDescription>
        </DialogHeader>

        {!user || sessionLost ? (
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <p className="font-medium">{copy.signedOutTitle}</p>
              <p className="text-sm text-muted-foreground">{copy.signedOutBody}</p>
            </div>
            <Button asChild>
              <Link to={`/sign-in?next=${encodeURIComponent(location.pathname)}`}>
                {copy.signIn}
              </Link>
            </Button>
          </div>
        ) : (
          <InquiryForm
            placement={placement}
            email={user.email}
            onSent={() => onOpenChange(false)}
            onCancel={() => onOpenChange(false)}
            onSessionLost={() => setSessionLost(true)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
