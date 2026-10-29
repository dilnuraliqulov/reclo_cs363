import { useCallback, useState } from 'react'
import type { FieldValues, Path, UseFormReturn } from 'react-hook-form'
import { ApiRequestError } from '@/lib/api'
import { useMessages } from '@/lib/messages'

/**
 * Puts a failed request where the reader can act on it. The server's `fieldErrors` codes go next to
 * their inputs (the first one takes focus); everything else (`_form`, a field this form does not
 * have, a 429, a 5xx, no connection) becomes one localized form-level message.
 *
 * `fail` returns the message it set, or null when every error found a field.
 */
export function useFormFailure<T extends FieldValues>(
  form: Pick<UseFormReturn<T>, 'setError' | 'getValues'>,
) {
  const { apiErrorText, fieldErrorText } = useMessages()
  const [formError, setFormError] = useState<string | null>(null)
  const { setError, getValues } = form

  const clear = useCallback(() => setFormError(null), [])

  const fail = useCallback(
    (error: unknown): string | null => {
      let mapped = 0
      let leftover = false
      if (error instanceof ApiRequestError && error.fieldErrors) {
        const values = getValues()
        for (const [name, messages] of Object.entries(error.fieldErrors)) {
          if (name !== '_form' && name in values && messages[0]) {
            setError(name as Path<T>, { message: messages[0] }, { shouldFocus: mapped === 0 })
            mapped += 1
          } else {
            leftover = true
          }
        }
      }
      if (mapped > 0 && !leftover) {
        setFormError(null)
        return null
      }
      const unmapped = error instanceof ApiRequestError ? error.fieldErrors?._form?.[0] : undefined
      const text = unmapped ? fieldErrorText(unmapped)! : apiErrorText(error)
      setFormError(text)
      return text
    },
    [apiErrorText, fieldErrorText, getValues, setError],
  )

  return { formError, fail, clear }
}
