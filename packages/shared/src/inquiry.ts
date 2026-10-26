import { z } from 'zod'
import { apiErrorSchema } from './errors'

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
  .pipe(z.string().regex(/^\+998\d{9}$/, 'Enter a valid Uzbek number, e.g. +998 90 123 45 67'))

/**
 * Unknown keys are stripped, so `status`, `clientId` and `vendorId` in a request body have no
 * effect: all three are set server-side.
 */
export const createInquiryRequestSchema = z.object({
  placementId: z.string().uuid(),
  message: z
    .string()
    .trim()
    .min(MESSAGE_MIN_LENGTH, `Message must be at least ${MESSAGE_MIN_LENGTH} characters`)
    .max(MESSAGE_MAX_LENGTH, `Message must be at most ${MESSAGE_MAX_LENGTH} characters`),
  contactName: z.string().trim().min(2, 'Enter your name').max(120),
  contactPhone: uzPhoneSchema,
  contactEmail: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email')),
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
