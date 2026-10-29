import { z } from 'zod'
import { VALIDATION_CODES } from './errors'
import { inquiryPlacementSummarySchema, inquiryStatusSchema } from './inquiry'

export const ADMIN_INQUIRY_PAGE_SIZE = 20
export const ADMIN_INQUIRY_CLIENT_QUERY_MAX_LENGTH = 120

/**
 * The admin dispute view (KAN-15). Unlike `inquiryHistoryQuerySchema` this pages by number, not by
 * cursor: an admin settling a dispute jumps between pages and wants a total, and the list is
 * read-only so rows do not shift under them.
 *
 * `clientQuery` matches the client's account email or the contact name/email on the inquiry,
 * case-insensitively. `from` and `to` are calendar dates, both inclusive, on `createdAt`.
 */
export const adminInquiryQuerySchema = z
  .object({
    clientQuery: z
      .string()
      .trim()
      .max(ADMIN_INQUIRY_CLIENT_QUERY_MAX_LENGTH)
      .optional()
      .transform((value) => (value ? value : undefined)),
    status: inquiryStatusSchema.optional(),
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    page: z.coerce.number().int().min(1).default(1),
  })
  .refine((q) => !q.from || !q.to || q.from <= q.to, {
    message: VALIDATION_CODES.dateOrder,
    path: ['to'],
  })
export type AdminInquiryQuery = z.infer<typeof adminInquiryQuerySchema>
/** What the filter form and the URL hold before coercion. */
export type AdminInquiryQueryInput = z.input<typeof adminInquiryQuerySchema>

export const adminInquiryClientSchema = z.object({
  id: z.string(),
  email: z.string(),
})
export type AdminInquiryClient = z.infer<typeof adminInquiryClientSchema>

export const adminInquiryVendorSchema = z.object({
  id: z.string(),
  email: z.string(),
  companyName: z.string().nullable(),
})
export type AdminInquiryVendor = z.infer<typeof adminInquiryVendorSchema>

/**
 * One entry in an inquiry's message history. Today an inquiry carries exactly one message, the
 * client's, so the API returns a one-element array; the shape is a list so vendor replies (KAN-17)
 * can be added without changing the contract.
 */
export const adminInquiryMessageSchema = z.object({
  author: z.enum(['CLIENT', 'VENDOR']),
  body: z.string(),
  createdAt: z.string(),
})
export type AdminInquiryMessage = z.infer<typeof adminInquiryMessageSchema>

/** A list row: everything needed to scan the list without opening the detail. */
export const adminInquirySummarySchema = z.object({
  id: z.string().uuid(),
  status: inquiryStatusSchema,
  client: adminInquiryClientSchema,
  contactName: z.string(),
  contactEmail: z.string(),
  vendor: adminInquiryVendorSchema,
  /** Null only when the placement was hard-deleted. */
  placement: inquiryPlacementSummarySchema.nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type AdminInquirySummary = z.infer<typeof adminInquirySummarySchema>

export const adminInquiryListResponseSchema = z.object({
  inquiries: z.array(adminInquirySummarySchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
})
export type AdminInquiryListResponse = z.infer<typeof adminInquiryListResponseSchema>

/** The detail adds the full contact record and the message history. */
export const adminInquiryDetailSchema = adminInquirySummarySchema.extend({
  contactPhone: z.string(),
  desiredStartDate: z.string().nullable(),
  durationMonths: z.number().int().nullable(),
  messages: z.array(adminInquiryMessageSchema),
})
export type AdminInquiryDetail = z.infer<typeof adminInquiryDetailSchema>

export const adminInquiryDetailResponseSchema = z.object({ inquiry: adminInquiryDetailSchema })
export type AdminInquiryDetailResponse = z.infer<typeof adminInquiryDetailResponseSchema>
