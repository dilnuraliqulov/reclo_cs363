import { z } from 'zod'
import { VALIDATION_CODES } from './errors'
import { placementDetailSchema, placementStatusSchema, placementTypeSchema } from './placement'

/** Bounds of a rejection reason, exported so the form can show the counter and the messages. */
export const REJECTION_REASON_LIMITS = { min: 10, max: 500 } as const

export const moderationActionSchema = z.enum(['APPROVED', 'REJECTED'])
export type ModerationAction = z.infer<typeof moderationActionSchema>

export const adminPlacementListQuerySchema = z.object({
  status: placementStatusSchema.default('PENDING_REVIEW'),
  type: placementTypeSchema.optional(),
  city: z.string().trim().min(1).max(80).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
})
export type AdminPlacementListQuery = z.infer<typeof adminPlacementListQuerySchema>

export const approvePlacementRequestSchema = z.object({
  /** `updatedAt` of the detail the admin was viewing: the decision applies to that version only. */
  expectedUpdatedAt: z.string().datetime(),
})
export type ApprovePlacementRequest = z.infer<typeof approvePlacementRequestSchema>

export const rejectPlacementRequestSchema = approvePlacementRequestSchema.extend({
  reason: z
    .string({ error: VALIDATION_CODES.required })
    .trim()
    .min(REJECTION_REASON_LIMITS.min, VALIDATION_CODES.reasonTooShort)
    .max(REJECTION_REASON_LIMITS.max, VALIDATION_CODES.reasonTooLong),
})
export type RejectPlacementRequest = z.infer<typeof rejectPlacementRequestSchema>

export const moderationEventSchema = z.object({
  id: z.string(),
  action: moderationActionSchema,
  reason: z.string().nullable(),
  adminName: z.string().nullable(), // null once the admin account is deleted
  createdAt: z.string(),
})
export type ModerationEvent = z.infer<typeof moderationEventSchema>

export const adminPlacementSummarySchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  type: placementTypeSchema,
  city: z.string(),
  pricePerMonth: z.number().int().nonnegative(),
  status: placementStatusSchema,
  cover: z.string().url().nullable(),
  photoCount: z.number().int().nonnegative(),
  vendorName: z.string(),
  updatedAt: z.string(), // queue position / "waiting since"
})
export type AdminPlacementSummary = z.infer<typeof adminPlacementSummarySchema>

export const adminPlacementDetailSchema = placementDetailSchema.extend({
  vendor: z.object({ id: z.string(), name: z.string(), email: z.string() }),
  archivedAt: z.string().nullable(),
  events: z.array(moderationEventSchema), // newest first
})
export type AdminPlacementDetail = z.infer<typeof adminPlacementDetailSchema>

export const adminPlacementListResponseSchema = z.object({
  placements: z.array(adminPlacementSummarySchema),
  total: z.number().int().nonnegative(),
})
export type AdminPlacementListResponse = z.infer<typeof adminPlacementListResponseSchema>

export const adminPlacementResponseSchema = z.object({ placement: adminPlacementDetailSchema })
export type AdminPlacementResponse = z.infer<typeof adminPlacementResponseSchema>
