import { z } from 'zod'

/**
 * Why the request failed, as a stable token rather than a sentence. The client holds the words, in
 * whichever language its reader asked for; localizing on the server would mean guessing the
 * reader's language from a header, and would make the same failure read differently in a log and on
 * screen (`docs/i18n-design.md`).
 */
export const errorCodeSchema = z.enum([
  'NOT_AUTHENTICATED',
  'FORBIDDEN',
  'INVALID_CREDENTIALS',
  'EMAIL_TAKEN',
  'INVALID_INPUT',
  'INVALID_QUERY',
  'MALFORMED_JSON',
  'PAYLOAD_TOO_LARGE',
  'UNSUPPORTED_MEDIA_TYPE',
  'NOT_FOUND',
  'INVALID_PLACEMENT_ID',
  'PLACEMENT_NOT_FOUND',
  'DUPLICATE_INQUIRY',
  'RATE_LIMITED',
  'MARKER_QUERY_FAILED',
  'PLACEMENT_FETCH_FAILED',
  'LISTING_STATE_INVALID',
  'PHOTO_REQUIRED',
  'PHOTO_LIMIT',
  'PHOTO_TOO_LARGE',
  'PHOTO_TYPE_INVALID',
  'PHOTO_NOT_FOUND',
  'PLACEMENT_NOT_PENDING',
  'PLACEMENT_CHANGED',
  'PLACEMENT_NO_PHOTOS',
  'CART_FULL',
  'INTERNAL',
])
export type ErrorCode = z.infer<typeof errorCodeSchema>

/**
 * Codes for the per-field messages in this package's schemas. They cannot be sentences: each schema
 * is parsed by both the web form and the API route, so its message belongs to no single language.
 *
 * Keys are for writing the schemas; the values are what travels, and what the web's catalogs key on.
 */
export const VALIDATION_CODES = {
  emailInvalid: 'validation.email.invalid',
  emailTaken: 'validation.email.taken',
  passwordRequired: 'validation.password.required',
  passwordTooShort: 'validation.password.tooShort',
  passwordTooLong: 'validation.password.tooLong',
  nameRequired: 'validation.name.required',
  phoneUz: 'validation.phone.uz',
  messageTooShort: 'validation.message.tooShort',
  messageTooLong: 'validation.message.tooLong',
  cursorInvalid: 'validation.cursor.invalid',
  latOrder: 'validation.bounds.latOrder',
  lngOrder: 'validation.bounds.lngOrder',
  required: 'validation.required',
  invalid: 'validation.invalid',
  titleLength: 'validation.title.length',
  descriptionTooLong: 'validation.description.tooLong',
  addressLength: 'validation.address.length',
  cityLength: 'validation.city.length',
  priceRange: 'validation.price.range',
  latitudeRange: 'validation.latitude.range',
  longitudeRange: 'validation.longitude.range',
  sizeRange: 'validation.size.range',
  nothingToUpdate: 'validation.update.empty',
  ledTypeOnly: 'validation.led.typeOnly',
  ledRange: 'validation.led.range',
  reasonTooShort: 'validation.reason.tooShort',
  reasonTooLong: 'validation.reason.tooLong',
  companyNameRequired: 'validation.companyName.required',
  companyNameTooLong: 'validation.companyName.tooLong',
} as const

/**
 * Zod's built-in messages are English sentences ("Invalid input: expected string, received
 * undefined"). Any issue a schema did not give its own code lands here instead, so a wrong type or
 * a missing key reaches the reader as a code and never as a sentence (KAN-80). A message set on a
 * schema still wins over this, as it does over Zod's own default.
 */
z.config({
  customError: (issue) =>
    issue.code === 'invalid_type' && issue.input === undefined
      ? VALIDATION_CODES.required
      : VALIDATION_CODES.invalid,
})

export const validationCodeSchema = z.enum(VALIDATION_CODES)
export type ValidationCode = z.infer<typeof validationCodeSchema>

export const apiErrorSchema = z.object({
  /**
   * English, for logs and for a client that does not recognise `code`. It is not what a user should
   * be shown when `code` is present.
   */
  error: z.string(),
  /**
   * `.catch` rather than a plain `.optional()`: a client built against an older build of this
   * package must not lose the whole body because the server has since learned a new code. An
   * unrecognised code becomes `undefined`, and the reader falls back to `error` (KAN-79).
   */
  code: errorCodeSchema.optional().catch(undefined),
  fieldErrors: z.record(z.string(), z.array(z.string())).optional(),
})

export type ApiError = z.infer<typeof apiErrorSchema>
