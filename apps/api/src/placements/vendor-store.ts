import type {
  CreatePlacementRequest,
  PlacementStatus,
  UpdatePlacementRequest,
  VendorPlacement,
  VendorPlacementListQuery,
} from '@reclo/shared'

/**
 * What a state-changing call came to. `conflict` carries the status the listing was in, so the route
 * can name it; `not_found` covers a missing listing and someone else's alike.
 */
export type MutationResult =
  | { kind: 'ok'; placement: VendorPlacement }
  | { kind: 'not_found' }
  | { kind: 'conflict'; status: PlacementStatus }
  /** LED values sent for a listing that is not an LED screen (and the body did not change that). */
  | { kind: 'led_not_allowed' }

export type AddPhotoResult = MutationResult | { kind: 'photo_limit' }
export type RemovePhotoResult = MutationResult | { kind: 'photo_missing' }

/** Every method takes `vendorId` and scopes its query by it: ownership is part of the query. */
export interface VendorPlacementStore {
  create: (vendorId: string, data: CreatePlacementRequest) => Promise<VendorPlacement>
  list: (
    vendorId: string,
    query: VendorPlacementListQuery,
  ) => Promise<{ placements: VendorPlacement[]; total: number }>
  find: (vendorId: string, id: string) => Promise<VendorPlacement | null>
  /** Archived listings answer `conflict`; ACTIVE and INACTIVE ones go back to PENDING_REVIEW. */
  update: (vendorId: string, id: string, data: UpdatePlacementRequest) => Promise<MutationResult>
  archive: (vendorId: string, id: string) => Promise<MutationResult>
  restore: (vendorId: string, id: string) => Promise<MutationResult>
  pause: (vendorId: string, id: string) => Promise<MutationResult>
  resume: (vendorId: string, id: string) => Promise<MutationResult>
  /** Appends a site-relative photo path; counts as a content edit. */
  addPhoto: (vendorId: string, id: string, photoPath: string) => Promise<AddPhotoResult>
  /** Drops a site-relative photo path; counts as a content edit. */
  removePhoto: (vendorId: string, id: string, photoPath: string) => Promise<RemovePhotoResult>
}
