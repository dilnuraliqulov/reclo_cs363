import {
  MESSAGE_MAX_LENGTH,
  MESSAGE_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  validationCodeSchema,
  type ErrorCode,
  type ValidationCode,
} from '@reclo/shared'
import { ApiRequestError } from './api'

/**
 * English words for the codes the API and the shared schemas return in place of sentences
 * (`docs/i18n-design.md`). This table is what KAN-78 replaces with the `uz`/`ru`/`en` catalogs; it
 * exists so that moving the server to codes changes nothing a user sees.
 *
 * Both records are exhaustive over their code union, so adding a code without words to show for it
 * does not compile.
 */
const ERROR_TEXT: Record<ErrorCode, string> = {
  NOT_AUTHENTICATED: 'Not authenticated',
  FORBIDDEN: 'Forbidden',
  INVALID_CREDENTIALS: 'Invalid email or password',
  EMAIL_TAKEN: 'Email is already registered',
  INVALID_INPUT: 'Invalid input',
  INVALID_QUERY: 'Invalid query parameters',
  MALFORMED_JSON: 'Malformed JSON',
  INVALID_PLACEMENT_ID: 'Invalid placement id',
  PLACEMENT_NOT_FOUND: 'Placement not found',
  DUPLICATE_INQUIRY: 'You already have an open inquiry for this placement',
  RATE_LIMITED: 'Too many attempts, try again later',
  MARKER_QUERY_FAILED: 'Failed to query map markers',
  PLACEMENT_FETCH_FAILED: 'Failed to fetch placement detail',
  INTERNAL: 'Something went wrong',
}

// The length bounds come back from the shared constants, which is where the interpolation the codes
// dropped on the wire belongs.
const VALIDATION_TEXT: Record<ValidationCode, string> = {
  'validation.email.invalid': 'Enter a valid email',
  'validation.email.taken': 'Email is already registered',
  'validation.password.required': 'Enter your password',
  'validation.password.tooShort': `Password must be at least ${PASSWORD_MIN_LENGTH} characters`,
  'validation.password.tooLong': `Password must be at most ${PASSWORD_MAX_LENGTH} characters`,
  'validation.name.required': 'Enter your name',
  'validation.phone.uz': 'Enter a valid Uzbek number, e.g. +998 90 123 45 67',
  'validation.message.tooShort': `Message must be at least ${MESSAGE_MIN_LENGTH} characters`,
  'validation.message.tooLong': `Message must be at most ${MESSAGE_MAX_LENGTH} characters`,
  'validation.cursor.invalid': 'Invalid cursor',
  'validation.bounds.latOrder': 'minLat must be less than or equal to maxLat',
  'validation.bounds.lngOrder': 'minLng must be less than or equal to maxLng',
}

/**
 * What to show for a failed request. Prefers the code, and falls back to the response's `error`
 * string for a code this build does not know — a newer API must not put a bare token on screen.
 */
export function apiErrorText(error: unknown): string {
  if (error instanceof ApiRequestError && error.code) return ERROR_TEXT[error.code]
  return error instanceof Error ? error.message : ERROR_TEXT.INTERNAL
}

/**
 * One field's message, whether it came from the local parse or from the server's `fieldErrors`.
 * A string that is not a known code passes through: Zod's own built-in messages were never
 * customised, so they are already readable.
 */
export function fieldErrorText(message: string | undefined): string | undefined {
  if (message === undefined) return undefined
  const code = validationCodeSchema.safeParse(message)
  return code.success ? VALIDATION_TEXT[code.data] : message
}

/** `fieldErrorText` in the shape shadcn's `FieldError` takes. */
export function fieldError(error: { message?: string } | undefined): { message?: string } {
  return { message: fieldErrorText(error?.message) }
}
