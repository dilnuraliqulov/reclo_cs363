import type {
  AdminPlacementDetail,
  AdminPlacementListQuery,
  AdminPlacementListResponse,
} from '@reclo/shared'

/** Why a decision did not happen. The route turns each into its own 404 / 409 code. */
export type DecisionRefusal = 'NOT_FOUND' | 'NOT_PENDING' | 'CHANGED' | 'NO_PHOTOS'

export type DecisionResult =
  { ok: true; placement: AdminPlacementDetail } | { ok: false; reason: DecisionRefusal }

/**
 * Moderation persistence (docs/moderation-design.md). Not owner-scoped: an admin can open any
 * listing. A decision applies to the version the admin was looking at, named by `expectedUpdatedAt`.
 */
export interface AdminPlacementStore {
  list: (query: AdminPlacementListQuery) => Promise<AdminPlacementListResponse>
  findById: (id: string) => Promise<AdminPlacementDetail | null>
  /** PENDING_REVIEW -> ACTIVE, if still pending, unchanged since read, and it has a photo. */
  approve: (id: string, adminId: string, expectedUpdatedAt: Date) => Promise<DecisionResult>
  /** PENDING_REVIEW -> REJECTED with the reason stored on the audit event. */
  reject: (
    id: string,
    adminId: string,
    expectedUpdatedAt: Date,
    reason: string,
  ) => Promise<DecisionResult>
}
