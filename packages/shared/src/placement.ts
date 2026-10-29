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

/** Bounds of the listing editor, exported so the web can fill in the `{min}`/`{max}` of a message. */
export const LISTING_LIMITS = {
  titleMin: 5,
  titleMax: 120,
  descriptionMax: 2000,
  addressMin: 3,
  addressMax: 200,
  cityMin: 2,
  cityMax: 80,
  priceMin: 100_000,
  priceMax: 1_000_000_000,
  sizeMax: 100,
  maxPhotos: 8,
  maxPhotoBytes: 5 * 1024 * 1024,
} as const

// Uzbekistan bounding box, the same one the map clamps to (map-design.md). A lat/lng swap falls
// outside it, so it is rejected too.
export const UZ_BOUNDS = { minLat: 37.0, maxLat: 45.6, minLng: 56.0, maxLng: 73.2 } as const

const required = { error: VALIDATION_CODES.required }

const latitudeSchema = z
  .number(required)
  .min(UZ_BOUNDS.minLat, VALIDATION_CODES.latitudeRange)
  .max(UZ_BOUNDS.maxLat, VALIDATION_CODES.latitudeRange)
const longitudeSchema = z
  .number(required)
  .min(UZ_BOUNDS.minLng, VALIDATION_CODES.longitudeRange)
  .max(UZ_BOUNDS.maxLng, VALIDATION_CODES.longitudeRange)

const sizeSchema = z.coerce
  .number(required)
  .positive(VALIDATION_CODES.sizeRange)
  .max(LISTING_LIMITS.sizeMax, VALIDATION_CODES.sizeRange)

export const createPlacementRequestSchema = z.object({
  title: z
    .string(required)
    .trim()
    .min(LISTING_LIMITS.titleMin, VALIDATION_CODES.titleLength)
    .max(LISTING_LIMITS.titleMax, VALIDATION_CODES.titleLength),
  description: z
    .string()
    .trim()
    .max(LISTING_LIMITS.descriptionMax, VALIDATION_CODES.descriptionTooLong)
    .optional(),
  type: z.enum(placementTypeSchema.options, required),
  latitude: latitudeSchema,
  longitude: longitudeSchema,
  address: z
    .string(required)
    .trim()
    .min(LISTING_LIMITS.addressMin, VALIDATION_CODES.addressLength)
    .max(LISTING_LIMITS.addressMax, VALIDATION_CODES.addressLength),
  city: z
    .string(required)
    .trim()
    .min(LISTING_LIMITS.cityMin, VALIDATION_CODES.cityLength)
    .max(LISTING_LIMITS.cityMax, VALIDATION_CODES.cityLength),
  pricePerMonth: z.coerce
    .number(required)
    .int(VALIDATION_CODES.priceRange)
    .min(LISTING_LIMITS.priceMin, VALIDATION_CODES.priceRange)
    .max(LISTING_LIMITS.priceMax, VALIDATION_CODES.priceRange), // UZS
  width: sizeSchema.optional(), // metres
  height: sizeSchema.optional(),
  lighting: z.boolean().default(false),
})
export type CreatePlacementRequest = z.infer<typeof createPlacementRequestSchema>

// `lighting` has a default on create; a partial of it would re-apply `false` to an edit that never
// mentioned it, so the default is dropped here.
export const updatePlacementRequestSchema = createPlacementRequestSchema
  .extend({ lighting: z.boolean() })
  .partial()
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: VALIDATION_CODES.nothingToUpdate,
  })
export type UpdatePlacementRequest = z.infer<typeof updatePlacementRequestSchema>

export const vendorPlacementListQuerySchema = z.object({
  status: placementStatusSchema.optional(), // omitted = every status except ARCHIVED
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
})
export type VendorPlacementListQuery = z.infer<typeof vendorPlacementListQuerySchema>

export const vendorPlacementSchema = placementDetailSchema.extend({
  archivedAt: z.string().nullable(),
})
export type VendorPlacement = z.infer<typeof vendorPlacementSchema>

export const vendorPlacementResponseSchema = z.object({ placement: vendorPlacementSchema })
export type VendorPlacementResponse = z.infer<typeof vendorPlacementResponseSchema>

export const vendorPlacementListResponseSchema = z.object({
  placements: z.array(vendorPlacementSchema),
  total: z.number().int().nonnegative(),
})
export type VendorPlacementListResponse = z.infer<typeof vendorPlacementListResponseSchema>
