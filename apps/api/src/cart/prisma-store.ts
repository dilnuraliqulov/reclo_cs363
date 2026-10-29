import { CART_MAX_ITEMS, type CartItem } from '@reclo/shared'
import type { Prisma, PrismaClient } from '../generated/prisma/client'
import { publicPhotoUrl } from '../placements/photo-storage'
import type { AddToCartResult, CartStore } from './store'

type Tx = Prisma.TransactionClient

const ROW_SELECT = {
  addedAt: true,
  placement: {
    select: {
      id: true,
      title: true,
      type: true,
      city: true,
      address: true,
      pricePerMonth: true,
      photos: true,
    },
  },
} as const

export class PrismaCartStore implements CartStore {
  constructor(
    private readonly prisma: PrismaClient,
    /** Prefixed onto stored site-relative photo paths, as in the public placement routes. */
    private readonly publicUrl = '',
  ) {}

  list(userId: string): Promise<CartItem[]> {
    return this.prisma.$transaction(async (tx) => {
      await this.prune(tx, userId)
      return this.read(tx, userId)
    })
  }

  add(userId: string, placementId: string): Promise<AddToCartResult> {
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, userId)
      await this.prune(tx, userId)
      const placement = await tx.placement.findFirst({
        where: { id: placementId, status: 'ACTIVE' },
        select: { id: true },
      })
      if (!placement) return { outcome: 'not_found' }

      const existing = await tx.cartItem.findUnique({
        where: { userId_placementId: { userId, placementId } },
        select: { placementId: true },
      })
      if (existing) return { outcome: 'present', items: await this.read(tx, userId) }

      if ((await tx.cartItem.count({ where: { userId } })) >= CART_MAX_ITEMS) {
        return { outcome: 'full' }
      }
      await tx.cartItem.create({ data: { userId, placementId } })
      return { outcome: 'added', items: await this.read(tx, userId) }
    })
  }

  remove(userId: string, placementId: string): Promise<CartItem[]> {
    return this.prisma.$transaction(async (tx) => {
      await tx.cartItem.deleteMany({ where: { userId, placementId } })
      await this.prune(tx, userId)
      return this.read(tx, userId)
    })
  }

  async clear(userId: string): Promise<void> {
    await this.prisma.cartItem.deleteMany({ where: { userId } })
  }

  merge(userId: string, placementIds: readonly string[]): Promise<CartItem[]> {
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, userId)
      await this.prune(tx, userId)
      const present = new Set(
        (await tx.cartItem.findMany({ where: { userId }, select: { placementId: true } })).map(
          (row) => row.placementId,
        ),
      )
      const active = new Set(
        (
          await tx.placement.findMany({
            where: { id: { in: [...placementIds] }, status: 'ACTIVE' },
            select: { id: true },
          })
        ).map((placement) => placement.id),
      )

      const room = Math.max(0, CART_MAX_ITEMS - present.size)
      const toAdd = placementIds.filter((id) => active.has(id) && !present.has(id)).slice(0, room)
      if (toAdd.length > 0) {
        // One timestamp per row, a millisecond apart, so the merged items keep the browser's order.
        const start = Date.now()
        await tx.cartItem.createMany({
          data: toAdd.map((placementId, index) => ({
            userId,
            placementId,
            addedAt: new Date(start + index),
          })),
          skipDuplicates: true,
        })
      }
      return this.read(tx, userId)
    })
  }

  /**
   * Serialises the writes of one user's cart: two racing adds would otherwise both count 19 and
   * both insert. Locking the user row is enough, because every cart write goes through here first.
   */
  private async lock(tx: Tx, userId: string): Promise<void> {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`
  }

  /** Archived, paused or re-reviewed placements leave the cart, as the KAN-18 restore pass did. */
  private async prune(tx: Tx, userId: string): Promise<void> {
    await tx.cartItem.deleteMany({ where: { userId, placement: { status: { not: 'ACTIVE' } } } })
  }

  private async read(tx: Tx, userId: string): Promise<CartItem[]> {
    const rows = await tx.cartItem.findMany({
      where: { userId },
      select: ROW_SELECT,
      orderBy: [{ addedAt: 'asc' }, { placementId: 'asc' }],
    })
    return rows.map(({ addedAt, placement }) => ({
      id: placement.id,
      title: placement.title,
      type: placement.type,
      city: placement.city,
      address: placement.address,
      pricePerMonth: placement.pricePerMonth,
      ...(placement.photos[0]
        ? { photo: publicPhotoUrl(placement.photos[0], this.publicUrl) }
        : {}),
      addedAt: addedAt.toISOString(),
    }))
  }
}
