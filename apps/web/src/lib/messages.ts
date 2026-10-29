import {
  LISTING_LIMITS,
  MESSAGE_MAX_LENGTH,
  MESSAGE_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  REJECTION_REASON_LIMITS,
  apiErrorSchema,
  validationCodeSchema,
} from '@reclo/shared'
import { useMemo } from 'react'
import { useT } from '@/i18n/useLocale'
import type { MessageKey, Values } from '@/i18n/catalog'
import { ApiRequestError } from './api'

/**
 * The bounds a validation code dropped on the wire. KAN-77 replaced the interpolated sentences with
 * codes, because the sentence belongs to no one language; the numbers come back here, from the
 * shared constants that set them.
 */
const VALIDATION_VALUES: Partial<Record<MessageKey, Values>> = {
  'validation.password.tooShort': { min: PASSWORD_MIN_LENGTH },
  'validation.password.tooLong': { max: PASSWORD_MAX_LENGTH },
  'validation.message.tooShort': { min: MESSAGE_MIN_LENGTH },
  'validation.message.tooLong': { max: MESSAGE_MAX_LENGTH },
  'validation.title.length': { min: LISTING_LIMITS.titleMin, max: LISTING_LIMITS.titleMax },
  'validation.description.tooLong': { max: LISTING_LIMITS.descriptionMax },
  'validation.address.length': { min: LISTING_LIMITS.addressMin, max: LISTING_LIMITS.addressMax },
  'validation.city.length': { min: LISTING_LIMITS.cityMin, max: LISTING_LIMITS.cityMax },
  'validation.price.range': {
    min: LISTING_LIMITS.priceMin.toLocaleString('en'),
    max: LISTING_LIMITS.priceMax.toLocaleString('en'),
  },
  'validation.size.range': { max: LISTING_LIMITS.sizeMax },
  'validation.reason.tooShort': { min: REJECTION_REASON_LIMITS.min },
  'validation.reason.tooLong': { max: REJECTION_REASON_LIMITS.max },
}

/** What to say about a failure that came with no code: no response at all, or not our JSON. */
function statusMessageKey(status: number): MessageKey {
  if (status === 0) return 'error.NETWORK'
  if (status === 401) return 'error.NOT_AUTHENTICATED'
  if (status === 403) return 'error.FORBIDDEN'
  if (status === 404) return 'error.NOT_FOUND'
  if (status === 413) return 'error.PAYLOAD_TOO_LARGE'
  if (status === 415) return 'error.UNSUPPORTED_MEDIA_TYPE'
  if (status === 429) return 'error.RATE_LIMITED'
  return 'error.INTERNAL'
}

/**
 * Turns what the API said into what this reader sees. Both halves prefer a code and fall back to
 * the raw text, so neither a code this build does not know nor a plain network error can leave the
 * user with a bare token on screen.
 */
export function useMessages() {
  const t = useT()

  return useMemo(() => {
    /** What to show for a failed request. */
    function apiErrorText(error: unknown): string {
      if (error instanceof ApiRequestError) {
        if (error.code) return t(`error.${error.code}`)
        // A well-formed error body with a code this build does not know (a newer server): its
        // sentence is the only description there is (KAN-79). Anything else, such as no response
        // or an HTML error page from a proxy, has no sentence worth showing, only a status.
        if (apiErrorSchema.safeParse(error.body).success && error.message) return error.message
        return t(statusMessageKey(error.status))
      }
      return t('error.INTERNAL')
    }

    /**
     * One field's message, whether it came from the local Zod parse or from the server's
     * `fieldErrors`. Anything that is not a code this build knows reads as "not valid": a newer
     * server's code, or a sentence, must not reach the screen as it is.
     */
    function fieldErrorText(message: string | undefined): string | undefined {
      if (message === undefined) return undefined
      const parsed = validationCodeSchema.safeParse(message)
      const key = (parsed.success ? parsed.data : 'validation.invalid') satisfies MessageKey
      return t(key, VALIDATION_VALUES[key])
    }

    /** `fieldErrorText` in the shape shadcn's `FieldError` takes. */
    function fieldError(error: { message?: string } | undefined): { message?: string } {
      return { message: fieldErrorText(error?.message) }
    }

    return { apiErrorText, fieldErrorText, fieldError }
  }, [t])
}
