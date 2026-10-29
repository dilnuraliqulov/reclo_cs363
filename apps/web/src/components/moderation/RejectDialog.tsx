import { zodResolver } from '@hookform/resolvers/zod'
import { REJECTION_REASON_LIMITS, rejectPlacementRequestSchema } from '@reclo/shared'
import { useEffect, useRef, type RefObject } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { FormError } from '@/components/forms/FormError'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Textarea } from '@/components/ui/textarea'
import { useFormFailure } from '@/hooks/useFormFailure'
import { useT } from '@/i18n/useLocale'
import { useMessages } from '@/lib/messages'

/** Only the reason is typed here; `expectedUpdatedAt` comes from the loaded listing on submit. */
const reasonSchema = rejectPlacementRequestSchema.pick({ reason: true })
type ReasonValues = z.infer<typeof reasonSchema>

/** The counter is announced to screen readers only this close to the limit. */
const ANNOUNCE_FROM = 50

interface RejectDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** True while the request runs: both buttons are disabled and the dialog cannot be dismissed. */
  pending: boolean
  onSubmit: (reason: string) => void
  /** The last failed request, to put its field errors next to the reason and the rest above the buttons. */
  error?: unknown
  /** Where focus goes when the dialog closes. It has no trigger of its own to return to. */
  returnFocusRef: RefObject<HTMLElement | null>
}

export function RejectDialog({
  open,
  onOpenChange,
  pending,
  onSubmit,
  error = null,
  returnFocusRef,
}: RejectDialogProps) {
  const t = useT()
  const { fieldError } = useMessages()
  const cancelRef = useRef<HTMLButtonElement>(null)

  const form = useForm<ReasonValues>({
    resolver: zodResolver(reasonSchema),
    mode: 'onSubmit',
    reValidateMode: 'onChange',
    defaultValues: { reason: '' },
  })
  const { formError, fail, clear } = useFormFailure(form)
  // The error arrives as a prop because the request lives in the parent; map it when it changes.
  useEffect(() => {
    if (error) fail(error)
    else clear()
  }, [error, fail, clear])
  const reason = useWatch({ control: form.control, name: 'reason' })
  const length = reason?.length ?? 0
  const remaining = REJECTION_REASON_LIMITS.max - length

  // However it closed (cancel, success, or a 409 closing it from outside), a reason typed for one
  // version of the listing is not carried over to the next attempt.
  const { reset } = form
  useEffect(() => {
    if (!open) reset()
  }, [open, reset])

  function handleOpenChange(next: boolean) {
    if (pending) return
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        // Cancel gets the focus, so Enter or Space on a dialog opened by mistake does no harm.
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          cancelRef.current?.focus()
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          returnFocusRef.current?.focus()
        }}
      >
        <form
          onSubmit={form.handleSubmit((values) => {
            clear()
            onSubmit(values.reason)
          })}
          noValidate
        >
          <DialogHeader>
            <DialogTitle>{t('moderation.reject.title')}</DialogTitle>
            <DialogDescription>{t('moderation.reject.description')}</DialogDescription>
          </DialogHeader>

          <div className="my-4">
            <Controller
              name="reason"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="reject-reason">
                    {t('moderation.reject.reasonLabel')}
                  </FieldLabel>
                  <Textarea
                    {...field}
                    id="reject-reason"
                    rows={4}
                    disabled={pending}
                    aria-invalid={fieldState.invalid}
                    aria-describedby={fieldState.invalid ? 'reject-reason-error' : undefined}
                  />
                  <div className="flex items-start justify-between gap-2">
                    <FieldDescription>{t('moderation.reject.reasonHelp')}</FieldDescription>
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                      {t('moderation.reject.counter', {
                        count: length,
                        max: REJECTION_REASON_LIMITS.max,
                      })}
                    </span>
                  </div>
                  <span className="sr-only" aria-live="polite">
                    {remaining <= ANNOUNCE_FROM && remaining >= 0
                      ? t('moderation.reject.remaining', { remaining })
                      : ''}
                  </span>
                  {fieldState.invalid && (
                    <FieldError id="reject-reason-error" errors={[fieldError(fieldState.error)]} />
                  )}
                </Field>
              )}
            />
          </div>

          <FormError message={formError} />

          <DialogFooter>
            <Button
              ref={cancelRef}
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => handleOpenChange(false)}
            >
              {t('moderation.reject.cancel')}
            </Button>
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending ? t('moderation.action.rejecting') : t('moderation.reject.confirm')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
