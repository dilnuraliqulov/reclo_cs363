import { z } from 'zod'
import { VALIDATION_CODES } from './errors'

export const placementTypeSchema = z.enum(['BILLBOARD', 'LED_SCREEN'])
export type PlacementType = z.infer<typeof placementTypeSchema>

export const placementStatusSchema = z.enum(['ACTIVE', 'PENDING_REVIEW', 'INACTIVE', 'ARCHIVED'])
export type PlacementStatus = z.infer<typeof placementStatusSchema>

export const placementTierSchema = z.enum(['BRONZE', 'SILVER', 'GOLD'])
export type PlacementTier = z.infer<typeof placementTierSchema>

export const mapBoundsQuerySchema = z
  .object({
    minLat: z.coerce.number().min(-90).max(90),
    maxLat: z.coerce.number().min(-90).max(90),
    minLng: z.coerce.number().min(-180).max(180),
    maxLng: z.coerce.number().min(-180).max(180),
    type: placementTypeSchema.optional(),
    city: z.string().trim().optional(),
    minPrice: z.coerce.number().int().nonnegative().optional(),
    maxPrice: z.coerce.number().int().positive().optional(),
    ledDurationSeconds: z.coerce.number().int().positive().optional(),
    ledPlaysPerDay: z.coerce.number().int().positive().optional(),
  })
  .refine((data) => data.minLat <= data.maxLat, {
    message: VALIDATION_CODES.latOrder,
    path: ['minLat'],
  })
  .refine((data) => data.minLng <= data.maxLng, {
    message: VALIDATION_CODES.lngOrder,
    path: ['minLng'],
  })
  .refine((data) => {
    if (data.ledDurationSeconds === undefined && data.ledPlaysPerDay === undefined) return true
    return data.type === 'LED_SCREEN'
  }, {
    message: 'LED attributes can only be filtered for LED_SCREEN placements',
    path: ['type'],
  })
export type MapBoundsQuery = z.infer<typeof mapBoundsQuerySchema>

export const placementMarkerSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  type: placementTypeSchema,
  status: placementStatusSchema,
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  address: z.string(),
  city: z.string(),
  pricePerMonth: z.number().int().nonnegative(),
  photo: z.string().url().optional(),
})
export type PlacementMarker = z.infer<typeof placementMarkerSchema>

export const mapMarkersResponseSchema = z.object({
  markers: z.array(placementMarkerSchema),
  total: z.number().int().nonnegative(),
})
export type MapMarkersResponse = z.infer<typeof mapMarkersResponseSchema>

export const placementDetailSchema = placementMarkerSchema.extend({
  tier: placementTierSchema,
  description: z.string().nullable(),
  width: z.number().nullable(),
  height: z.number().nullable(),
  lighting: z.boolean(),
  photos: z.array(z.string().url()),
  ledDurationSeconds: z.number().int().positive().nullable(),
  ledPlaysPerDay: z.number().int().positive().nullable(),
  vendorId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type PlacementDetail = z.infer<typeof placementDetailSchema>
