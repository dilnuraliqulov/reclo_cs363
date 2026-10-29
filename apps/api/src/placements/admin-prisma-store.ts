import type {
  AdminPlacementDetail,
  AdminPlacementListQuery,
  AdminPlacementSummary,
} from '@reclo/shared'
import type { Prisma, PrismaClient } from '../generated/prisma/client'
import type { AdminPlacementStore, DecisionRefusal, DecisionResult } from './admin-store'
import { publicPhotoUrl } from './photo-storage'
import { getPlacementTier } from './tier'

/** How many events the detail returns, newest first. */
const EVENT_LIMIT = 20

const detailInclude = {
  vendor: { select: { id: true, email: true } },
  moderationEvents: {
    orderBy: { createdAt: 'desc' },
    take: EVENT_LIMIT,
    include: { admin: { select: { email: true } } },
  },
} satisfies Prisma.PlacementInclude

type DetailRow = Prisma.PlacementGetPayload<{ include: typeof detailInclude }>

/** Users have no display name yet, so the part of the email before the `@` stands in for it. */
function displayName(email: string): string {
  return email.split('@')[0] || email
}

export class PrismaAdminPlacementStore implements AdminPlacementStore {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly publicUrl = '',
  ) {}

  async list(query: AdminPlacementListQuery) {
    const where: Prisma.PlacementWhereInput = {
      status: query.status,
      ...(query.type ? { type: query.type } : {}),
      ...(query.city ? { city: { equals: query.city, mode: 'insensitive' } } : {}),
    }
    const [rows, total] = await Promise.all([
      this.prisma.placement.findMany({
        where,
        // Oldest first: while pending, `updatedAt` is when it last entered or changed in the queue.
        orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: { vendor: { select: { email: true } } },
      }),
      this.prisma.placement.count({ where }),
    ])
    const placements = rows.map((row): AdminPlacementSummary => ({
      id: row.id,
      title: row.title,
      type: row.type,
      city: row.city,
      pricePerMonth: row.pricePerMonth,
      status: row.status,
      cover: row.photos[0] ? publicPhotoUrl(row.photos[0], this.publicUrl) : null,
      photoCount: row.photos.length,
      vendorName: displayName(row.vendor.email),
      updatedAt: row.updatedAt.toISOString(),
    }))
    return { placements, total }
  }

  async findById(id: string) {
    const row = await this.prisma.placement.findUnique({ where: { id }, include: detailInclude })
    return row ? this.toDetail(row) : null
  }

  approve(id: string, adminId: string, expectedUpdatedAt: Date) {
    return this.decide(id, adminId, expectedUpdatedAt, {
      status: 'ACTIVE',
      action: 'APPROVED',
      needsPhoto: true,
    })
  }

  reject(id: string, adminId: string, expectedUpdatedAt: Date, reason: string) {
    return this.decide(id, adminId, expectedUpdatedAt, {
      status: 'REJECTED',
      action: 'REJECTED',
      reason,
      needsPhoto: false,
    })
  }

  /**
   * The decision is one conditional `updateMany`: it only matches a listing that is still pending,
   * unchanged since the admin looked, and (for approval) has a photo. The audit event is written in
   * the same transaction, so a decision without its event cannot exist. The read after a miss only
   * picks the error code; it never decides anything.
   */
  private async decide(
    id: string,
    adminId: string,
    expectedUpdatedAt: Date,
    decision: {
      status: 'ACTIVE' | 'REJECTED'
      action: 'APPROVED' | 'REJECTED'
      reason?: string
      needsPhoto: boolean
    },
  ): Promise<DecisionResult> {
    const placement = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.placement.updateMany({
        where: {
          id,
          status: 'PENDING_REVIEW',
          updatedAt: expectedUpdatedAt,
          ...(decision.needsPhoto ? { photos: { isEmpty: false } } : {}),
        },
        data: { status: decision.status },
      })
      if (count === 0) return null
      await tx.moderationEvent.create({
        data: {
          placementId: id,
          adminId,
          action: decision.action,
          reason: decision.reason ?? null,
        },
      })
      return tx.placement.findUniqueOrThrow({ where: { id }, include: detailInclude })
    })
    if (placement) return { ok: true, placement: this.toDetail(placement) }
    return { ok: false, reason: await this.refusalReason(id, expectedUpdatedAt) }
  }

  private async refusalReason(id: string, expectedUpdatedAt: Date): Promise<DecisionRefusal> {
    const row = await this.prisma.placement.findUnique({
      where: { id },
      select: { status: true, updatedAt: true },
    })
    if (!row) return 'NOT_FOUND'
    if (row.status !== 'PENDING_REVIEW') return 'NOT_PENDING'
    if (row.updatedAt.getTime() !== expectedUpdatedAt.getTime()) return 'CHANGED'
    return 'NO_PHOTOS'
  }

  private toDetail(row: DetailRow): AdminPlacementDetail {
    const photos = row.photos.map((photo) => publicPhotoUrl(photo, this.publicUrl))
    return {
      id: row.id,
      title: row.title,
      type: row.type,
      status: row.status,
      latitude: row.latitude,
      longitude: row.longitude,
      address: row.address,
      city: row.city,
      pricePerMonth: row.pricePerMonth,
      ...(photos[0] ? { photo: photos[0] } : {}),
      tier: getPlacementTier(row.pricePerMonth),
      description: row.description,
      width: row.width,
      height: row.height,
      lighting: row.lighting,
      ledDurationSeconds: row.ledDurationSeconds,
      ledPlaysPerDay: row.ledPlaysPerDay,
      photos,
      vendorId: row.vendorId,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
      vendor: { id: row.vendor.id, name: displayName(row.vendor.email), email: row.vendor.email },
      events: row.moderationEvents.map((event) => ({
        id: event.id,
        action: event.action,
        reason: event.reason,
        adminName: event.admin ? displayName(event.admin.email) : null,
        createdAt: event.createdAt.toISOString(),
      })),
    }
  }
}
