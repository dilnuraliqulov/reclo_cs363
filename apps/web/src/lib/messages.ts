import {
  LISTING_LIMITS,
  MESSAGE_MAX_LENGTH,
  MESSAGE_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
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
      if (error instanceof ApiRequestError && error.code) {
        return t(`error.${error.code}`)
      }
      // A newer API, or no response at all: the English string the client already holds.
      if (error instanceof Error && error.message) return error.message
      return t('error.INTERNAL')
    }

    /**
     * One field's message, whether it came from the local Zod parse or from the server's
     * `fieldErrors`. A string that is not a known code passes through: Zod's own built-in messages
     * were never customised, so they are already readable.
     */
    function fieldErrorText(message: string | undefined): string | undefined {
      if (message === undefined) return undefined
      const parsed = validationCodeSchema.safeParse(message)
      if (!parsed.success) return message
      const key = parsed.data satisfies MessageKey
      return t(key, VALIDATION_VALUES[key])
    }

    /** `fieldErrorText` in the shape shadcn's `FieldError` takes. */
    function fieldError(error: { message?: string } | undefined): { message?: string } {
      return { message: fieldErrorText(error?.message) }
    }

    return { apiErrorText, fieldErrorText, fieldError }
  }, [t])
}
