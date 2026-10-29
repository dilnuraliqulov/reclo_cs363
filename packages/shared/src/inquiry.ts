import { z } from 'zod'
import { emailSchema } from './auth'
import { apiErrorSchema, VALIDATION_CODES } from './errors'
import { placementTypeSchema } from './placement'

export const inquiryStatusSchema = z.enum(['NEW', 'READ', 'RESPONDED', 'CLOSED'])
export type InquiryStatus = z.infer<typeof inquiryStatusSchema>

export const MESSAGE_MIN_LENGTH = 10
export const MESSAGE_MAX_LENGTH = 2000
export const DURATION_MAX_MONTHS = 24

/** Days an open inquiry blocks a second one for the same client and placement. */
export const DUPLICATE_WINDOW_DAYS = 14

/** Statuses that count as open, so a second inquiry on the same placement is refused. */
export const OPEN_INQUIRY_STATUSES = ['NEW', 'READ'] as const satisfies InquiryStatus[]

/** Accepts the forms people actually type and normalises them to E.164. */
export const uzPhoneSchema = z
  .string()
  .trim()
  .transform((value) => {
    const digits = value.replace(/[\s()\-.]/g, '').replace(/^\+/, '')
    if (/^00998\d{9}$/.test(digits)) return `+${digits.slice(2)}`
    if (/^998\d{9}$/.test(digits)) return `+${digits}`
    if (/^\d{9}$/.test(digits)) return `+998${digits}`
    return value
  })
  .pipe(z.string().regex(/^\+998\d{9}$/, VALIDATION_CODES.phoneUz))

/**
 * Unknown keys are stripped, so `status`, `clientId` and `vendorId` in a request body have no
 * effect: all three are set server-side.
 */
export const createInquiryRequestSchema = z.object({
  placementId: z.string().uuid(),
  message: z
    .string()
    .trim()
    .min(MESSAGE_MIN_LENGTH, VALIDATION_CODES.messageTooShort)
    .max(MESSAGE_MAX_LENGTH, VALIDATION_CODES.messageTooLong),
  contactName: z
    .string()
    .trim()
    .min(2, VALIDATION_CODES.nameRequired)
    .max(120, VALIDATION_CODES.nameRequired),
  contactPhone: uzPhoneSchema,
  contactEmail: emailSchema,
  desiredStartDate: z.string().date().optional(),
  durationMonths: z.coerce.number().int().min(1).max(DURATION_MAX_MONTHS).optional(),
})
export type CreateInquiryRequest = z.infer<typeof createInquiryRequestSchema>
/**
 * What a form holds before validation: `durationMonths` is coerced and `contactPhone` normalised,
 * so the input and output types differ. Web forms are typed against this.
 */
export type CreateInquiryFormValues = z.input<typeof createInquiryRequestSchema>

/** The inquiry as its sender sees it. The vendor's identity is deliberately absent. */
export const inquirySchema = z.object({
  id: z.string().uuid(),
  placementId: z.string().uuid(),
  status: inquiryStatusSchema,
  message: z.string(),
  contactName: z.string(),
  contactPhone: z.string(),
  contactEmail: z.string(),
  desiredStartDate: z.string().nullable(),
  durationMonths: z.number().int().nullable(),
  createdAt: z.string(),
})
export type Inquiry = z.infer<typeof inquirySchema>

export const inquiryResponseSchema = z.object({ inquiry: inquirySchema })
export type InquiryResponse = z.infer<typeof inquiryResponseSchema>

/**
 * The 409 body. `existingInquiryCreatedAt` lets the form name the date the earlier inquiry was
 * sent, so the 14-day expiry is visible rather than mysterious.
 */
export const inquiryConflictSchema = apiErrorSchema.extend({
  existingInquiryCreatedAt: z.string().optional(),
})
export type InquiryConflict = z.infer<typeof inquiryConflictSchema>

export const INQUIRY_PAGE_SIZE = 20
export const INQUIRY_PAGE_SIZE_MAX = 50

/**
 * The client history query. `limit` is coerced because it arrives as a query string, so as with
 * `createInquiryRequestSchema` the input and output types differ.
 *
 * There is deliberately no `clientId`: the route reads it from the session, so one client's
 * history is not reachable by guessing another's id. The admin dispute view (KAN-15) is a separate
 * route with its own guard.
 */
export const inquiryHistoryQuerySchema = z.object({
  status: inquiryStatusSchema.optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(INQUIRY_PAGE_SIZE_MAX).default(INQUIRY_PAGE_SIZE),
})
export type InquiryHistoryQuery = z.infer<typeof inquiryHistoryQuerySchema>

/**
 * The placement context carried on a history row, enough to render the list without a second
 * fetch. `isViewable` is false once the placement is archived or inactive: the row still shows,
 * because archiving a listing must not erase the client's record of what they sent, but it renders
 * without a link.
 */
export const inquiryPlacementSummarySchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  city: z.string(),
  type: placementTypeSchema,
  isViewable: z.boolean(),
})
export type InquiryPlacementSummary = z.infer<typeof inquiryPlacementSummarySchema>

/**
 * Extends `inquirySchema` rather than redeclaring its fields, so the row the history shows and the
 * row `POST /api/inquiries` returns cannot drift apart. `placement` is null only when the placement
 * was hard-deleted.
 */
export const inquiryHistoryItemSchema = inquirySchema.extend({
  placement: inquiryPlacementSummarySchema.nullable(),
})
export type InquiryHistoryItem = z.infer<typeof inquiryHistoryItemSchema>

export const inquiryHistoryResponseSchema = z.object({
  inquiries: z.array(inquiryHistoryItemSchema),
  nextCursor: z.string().nullable(),
})
export type InquiryHistoryResponse = z.infer<typeof inquiryHistoryResponseSchema>
