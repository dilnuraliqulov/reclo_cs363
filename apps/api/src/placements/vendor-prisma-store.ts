import {
  LISTING_LIMITS,
  type CreatePlacementRequest,
  type PlacementStatus,
  type UpdatePlacementRequest,
  type VendorPlacement,
  type VendorPlacementListQuery,
} from '@reclo/shared'
import type { PrismaClient } from '../generated/prisma/client'
import { publicPhotoUrl } from './photo-storage'
import { getPlacementTier } from './tier'
import type {
  AddPhotoResult,
  MutationResult,
  RemovePhotoResult,
  VendorPlacementStore,
} from './vendor-store'

/** The vendor-initiated transitions of docs/listing-design.md. Edits are handled in `update`. */
const TRANSITIONS = {
  archive: { from: ['ACTIVE', 'PENDING_REVIEW', 'INACTIVE'], to: 'ARCHIVED' },
  restore: { from: ['ARCHIVED'], to: 'PENDING_REVIEW' },
  pause: { from: ['ACTIVE'], to: 'INACTIVE' },
  resume: { from: ['INACTIVE'], to: 'ACTIVE' },
} as const satisfies Record<string, { from: PlacementStatus[]; to: PlacementStatus }>

/** Statuses a content edit sends back through moderation. */
const REVIEWED: PlacementStatus[] = ['ACTIVE', 'INACTIVE']

/** Concurrent uploads to one listing race on the photo list; this many tries before giving up. */
const PHOTO_ATTEMPTS = 3

type PlacementRow = NonNullable<Awaited<ReturnType<PrismaClient['placement']['findFirst']>>>

export class PrismaVendorPlacementStore implements VendorPlacementStore {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly publicUrl = '',
    private readonly now: () => Date = () => new Date(),
  ) {}

  async create(vendorId: string, data: CreatePlacementRequest) {
    const row = await this.prisma.placement.create({
      // Stated rather than left to the schema default, so a changed default cannot publish.
      data: { ...data, vendorId, status: 'PENDING_REVIEW', photos: [] },
    })
    return this.toVendorPlacement(row)
  }

  async list(vendorId: string, query: VendorPlacementListQuery) {
    const where = {
      vendorId,
      status: query.status ?? { not: 'ARCHIVED' as const },
    }
    const [rows, total] = await Promise.all([
      this.prisma.placement.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.placement.count({ where }),
    ])
    return { placements: rows.map((row) => this.toVendorPlacement(row)), total }
  }

  async find(vendorId: string, id: string) {
    const row = await this.prisma.placement.findFirst({ where: { id, vendorId } })
    return row ? this.toVendorPlacement(row) : null
  }

  async update(
    vendorId: string,
    id: string,
    data: UpdatePlacementRequest,
  ): Promise<MutationResult> {
    const sendsLed = data.ledDurationSeconds !== undefined || data.ledPlaysPerDay !== undefined
    // The type after the update is the body's, else the stored one. Leaving LED_SCREEN clears the
    // LED values in the same statement; LED values without a type in the body are checked against
    // the stored type by the `where`, so the check cannot race a concurrent type change.
    const content: Omit<UpdatePlacementRequest, 'ledDurationSeconds' | 'ledPlaysPerDay'> & {
      ledDurationSeconds?: number | null
      ledPlaysPerDay?: number | null
    } =
      data.type !== undefined && data.type !== 'LED_SCREEN'
        ? { ...data, ledDurationSeconds: null, ledPlaysPerDay: null }
        : data
    const typeGuard = sendsLed && data.type === undefined ? { type: 'LED_SCREEN' as const } : {}

    // A live or paused listing goes back to review with its new content, in the same statement.
    const moved = await this.prisma.placement.updateMany({
      where: { id, vendorId, status: { in: REVIEWED }, ...typeGuard },
      data: { ...content, status: 'PENDING_REVIEW' },
    })
    if (moved.count === 0) {
      const stayed = await this.prisma.placement.updateMany({
        where: { id, vendorId, status: 'PENDING_REVIEW', ...typeGuard },
        data: content,
      })
      if (stayed.count === 0) return this.notUpdated(vendorId, id, sendsLed && !data.type)
    }
    return this.reload(vendorId, id)
  }

  archive(vendorId: string, id: string) {
    return this.transition(vendorId, id, 'archive')
  }

  restore(vendorId: string, id: string) {
    return this.transition(vendorId, id, 'restore')
  }

  pause(vendorId: string, id: string) {
    return this.transition(vendorId, id, 'pause')
  }

  resume(vendorId: string, id: string) {
    return this.transition(vendorId, id, 'resume')
  }

  addPhoto(vendorId: string, id: string, photoPath: string): Promise<AddPhotoResult> {
    return this.editPhotos(vendorId, id, (photos) =>
      photos.length >= LISTING_LIMITS.maxPhotos ? 'photo_limit' : [...photos, photoPath],
    )
  }

  removePhoto(vendorId: string, id: string, photoPath: string): Promise<RemovePhotoResult> {
    return this.editPhotos(vendorId, id, (photos) =>
      photos.includes(photoPath) ? photos.filter((p) => p !== photoPath) : 'photo_missing',
    )
  }

  /** Zero rows updated means the conditional `where` failed: a 409 or a 404 to the caller. */
  private async transition(
    vendorId: string,
    id: string,
    name: keyof typeof TRANSITIONS,
  ): Promise<MutationResult> {
    const { from, to } = TRANSITIONS[name]
    const result = await this.prisma.placement.updateMany({
      where: { id, vendorId, status: { in: [...from] } },
      data: {
        status: to,
        // Set on the way into ARCHIVED, cleared on the way out, untouched otherwise.
        ...(name === 'archive' ? { archivedAt: this.now() } : {}),
        ...(name === 'restore' ? { archivedAt: null } : {}),
      },
    })
    return result.count === 0 ? this.notUpdated(vendorId, id) : this.reload(vendorId, id)
  }

  /**
   * Photo edits are compare-and-swap on the current list: `photos: { equals }` fails the update if
   * another request changed the list since it was read, so two uploads cannot both take the last
   * slot. The edit also moves the listing back to review, like any other content change.
   */
  private async editPhotos<Refusal extends 'photo_limit' | 'photo_missing'>(
    vendorId: string,
    id: string,
    mutate: (photos: string[]) => string[] | Refusal,
  ): Promise<MutationResult | { kind: Refusal }> {
    let status: PlacementStatus = 'PENDING_REVIEW'
    for (let attempt = 0; attempt < PHOTO_ATTEMPTS; attempt++) {
      const row = await this.prisma.placement.findFirst({
        where: { id, vendorId },
        select: { status: true, photos: true },
      })
      if (!row) return { kind: 'not_found' }
      status = row.status
      if (row.status === 'ARCHIVED') return { kind: 'conflict', status: row.status }

      const photos = mutate(row.photos)
      if (typeof photos === 'string') return { kind: photos }

      const result = await this.prisma.placement.updateMany({
        where: { id, vendorId, status: row.status, photos: { equals: row.photos } },
        data: { photos, status: 'PENDING_REVIEW' },
      })
      if (result.count === 1) return this.reload(vendorId, id)
    }
    return { kind: 'conflict', status }
  }

  private async notUpdated(
    vendorId: string,
    id: string,
    checkLed = false,
  ): Promise<MutationResult> {
    const row = await this.prisma.placement.findFirst({
      where: { id, vendorId },
      select: { status: true, type: true },
    })
    if (!row) return { kind: 'not_found' }
    if (checkLed && row.status !== 'ARCHIVED' && row.type !== 'LED_SCREEN') {
      return { kind: 'led_not_allowed' }
    }
    return { kind: 'conflict', status: row.status }
  }

  private async reload(vendorId: string, id: string): Promise<MutationResult> {
    const placement = await this.find(vendorId, id)
    return placement ? { kind: 'ok', placement } : { kind: 'not_found' }
  }

  private toVendorPlacement(row: PlacementRow): VendorPlacement {
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
      photos,
      ledDurationSeconds: row.ledDurationSeconds,
      ledPlaysPerDay: row.ledPlaysPerDay,
      vendorId: row.vendorId,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
    }
  }
}
