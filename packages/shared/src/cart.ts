import { z } from 'zod'
import { VALIDATION_CODES } from './errors'
import { placementTypeSchema, type PlacementDetail, type PlacementMarker } from './placement'

/** The `localStorage` key holding the whole cart as one JSON document. */
export const CART_STORAGE_KEY = 'reclo.cart'

/** Bump when the stored shape changes. An unknown version reads as an empty cart. */
export const CART_VERSION = 1

/** Bounds the restore fan-out (one detail request per item) and the stored size. */
export const CART_MAX_ITEMS = 20

/** What a cart row needs to render without a network round trip. Revalidated on load. */
export const cartItemSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  type: placementTypeSchema,
  city: z.string(),
  address: z.string(),
  pricePerMonth: z.number().int().nonnegative(),
  photo: z.string().url().optional(),
  addedAt: z.string().datetime(),
})
export type CartItem = z.infer<typeof cartItemSchema>

export const cartStateSchema = z
  .object({
    version: z.literal(CART_VERSION),
    items: z.array(cartItemSchema).max(CART_MAX_ITEMS),
  })
  .refine((state) => new Set(state.items.map((item) => item.id)).size === state.items.length, {
    message: 'Duplicate placement in cart',
    path: ['items'],
  })
export type CartState = z.infer<typeof cartStateSchema>

/** Every `/api/cart` answer: the whole account cart, oldest first (KAN-31). */
export const cartResponseSchema = z.object({
  items: z.array(cartItemSchema).max(CART_MAX_ITEMS),
})
export type CartResponse = z.infer<typeof cartResponseSchema>

/** `POST /api/cart/merge`: the ids in the browser's cart, in the order they were added. */
export const mergeCartRequestSchema = z.object({
  placementIds: z
    .array(z.string().uuid())
    .max(CART_MAX_ITEMS)
    .refine((ids) => new Set(ids).size === ids.length, { message: VALIDATION_CODES.invalid }),
})
export type MergeCartRequest = z.infer<typeof mergeCartRequestSchema>

/** Builds the stored snapshot from either the map marker or the full detail. */
export function toCartItem(
  placement: PlacementMarker | PlacementDetail,
  addedAt: string = new Date().toISOString(),
): CartItem {
  const item: CartItem = {
    id: placement.id,
    title: placement.title,
    type: placement.type,
    city: placement.city,
    address: placement.address,
    pricePerMonth: placement.pricePerMonth,
    addedAt,
  }
  if (placement.photo) item.photo = placement.photo
  return item
}
