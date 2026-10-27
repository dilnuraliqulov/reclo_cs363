import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PrismaClient } from '../generated/prisma/client'
import type { InquiryCursor } from './cursor'
import { createPrismaInquiryStore } from './prisma-store'

const CLIENT_ID = '3d0f6f2a-7c8b-4f3d-9a1e-0b2c4d6e8f01'

const placement = {
  id: 'b1e0696a-54c3-4d40-84c4-f2a89326e680',
  title: 'Amir Temur Billboard',
  city: 'Tashkent',
  type: 'BILLBOARD' as const,
  status: 'ACTIVE' as const,
}

const row = {
  id: '8f1e2bb6-6ad8-4a2e-9f6e-1c2f6f2a31a0',
  placementId: placement.id,
  status: 'NEW' as const,
  message: 'We would like to run a two month campaign here.',
  contactName: 'Aziza Karimova',
  contactPhone: '+998901234567',
  contactEmail: 'aziza@example.com',
  desiredStartDate: new Date('2026-11-01T00:00:00.000Z'),
  durationMonths: 2,
  createdAt: new Date('2026-10-26T10:00:00.000Z'),
  placement,
}

const findMany = vi.fn()

function createStore() {
  const prisma = {
    inquiry: { findMany },
    placement: { findFirst: vi.fn() },
  } as unknown as PrismaClient
  return createPrismaInquiryStore(prisma)
}

function lastArgs() {
  return findMany.mock.lastCall?.[0]
}

describe('createPrismaInquiryStore.listClientInquiries', () => {
  beforeEach(() => {
    findMany.mockReset()
    findMany.mockResolvedValue([row])
  })

  describe('the query', () => {
    it('scopes every page to the one client', async () => {
      await createStore().listClientInquiries({ clientId: CLIENT_ID, limit: 20 })

      expect(lastArgs().where.clientId).toBe(CLIENT_ID)
    })

    it('orders by createdAt then id, both descending', async () => {
      await createStore().listClientInquiries({ clientId: CLIENT_ID, limit: 20 })

      // The id is not decoration: it is the tie-break the cursor depends on, so the sort and the
      // cursor predicate have to agree on it.
      expect(lastArgs().orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }])
    })

    it('takes exactly the limit it was given', async () => {
      await createStore().listClientInquiries({ clientId: CLIENT_ID, limit: 21 })

      expect(lastArgs().take).toBe(21)
    })

    it('omits the status filter when none was asked for, so All means all', async () => {
      await createStore().listClientInquiries({ clientId: CLIENT_ID, limit: 20 })

      expect(lastArgs().where).not.toHaveProperty('status')
    })

    it('narrows to one status when asked', async () => {
      await createStore().listClientInquiries({
        clientId: CLIENT_ID,
        status: 'RESPONDED',
        limit: 20,
      })

      expect(lastArgs().where.status).toBe('RESPONDED')
    })

    it('adds no cursor predicate on the first page', async () => {
      await createStore().listClientInquiries({ clientId: CLIENT_ID, limit: 20 })

      expect(lastArgs().where).not.toHaveProperty('OR')
    })

    it('asks for rows strictly older than the cursor, by createdAt or by id within it', async () => {
      const cursor: InquiryCursor = { createdAt: row.createdAt, id: row.id }

      await createStore().listClientInquiries({ clientId: CLIENT_ID, cursor, limit: 20 })

      expect(lastArgs().where.OR).toEqual([
        { createdAt: { lt: cursor.createdAt } },
        { createdAt: cursor.createdAt, id: { lt: cursor.id } },
      ])
    })

    it('joins the placement without filtering on its status', async () => {
      await createStore().listClientInquiries({ clientId: CLIENT_ID, limit: 20 })

      // A vendor archiving a listing must not erase the client's record of what they sent, so the
      // join carries `status` to decide the link and never excludes a row.
      const select = lastArgs().select.placement.select
      expect(select.status).toBe(true)
      expect(lastArgs().select.placement).not.toHaveProperty('where')
    })
  })

  describe('the rows it returns', () => {
    it('maps an ACTIVE placement to a viewable summary', async () => {
      const [item] = await createStore().listClientInquiries({ clientId: CLIENT_ID, limit: 20 })

      expect(item?.placement).toEqual({
        id: placement.id,
        title: placement.title,
        city: placement.city,
        type: placement.type,
        isViewable: true,
      })
    })

    it('keeps an archived placement but marks it unviewable', async () => {
      findMany.mockResolvedValue([{ ...row, placement: { ...placement, status: 'ARCHIVED' } }])

      const [item] = await createStore().listClientInquiries({ clientId: CLIENT_ID, limit: 20 })

      expect(item?.placement?.title).toBe(placement.title)
      expect(item?.placement?.isViewable).toBe(false)
    })

    it.each(['PENDING', 'INACTIVE', 'ARCHIVED'] as const)(
      'treats a %s placement as unviewable, because only ACTIVE is on the map',
      async (status) => {
        findMany.mockResolvedValue([{ ...row, placement: { ...placement, status } }])

        const [item] = await createStore().listClientInquiries({ clientId: CLIENT_ID, limit: 20 })

        expect(item?.placement?.isViewable).toBe(false)
      },
    )

    it('returns a null placement when the listing was hard-deleted', async () => {
      findMany.mockResolvedValue([{ ...row, placement: null }])

      const [item] = await createStore().listClientInquiries({ clientId: CLIENT_ID, limit: 20 })

      expect(item?.placement).toBeNull()
    })

    it('sends the dates over the wire in their client-facing shapes', async () => {
      const [item] = await createStore().listClientInquiries({ clientId: CLIENT_ID, limit: 20 })

      expect(item?.createdAt).toBe('2026-10-26T10:00:00.000Z')
      // Date only: the stored time component is an artefact of the column type.
      expect(item?.desiredStartDate).toBe('2026-11-01')
    })

    it('leaves the optional campaign fields null when they were not filled in', async () => {
      findMany.mockResolvedValue([{ ...row, desiredStartDate: null, durationMonths: null }])

      const [item] = await createStore().listClientInquiries({ clientId: CLIENT_ID, limit: 20 })

      expect(item?.desiredStartDate).toBeNull()
      expect(item?.durationMonths).toBeNull()
    })

    it('never leaks the internal columns, even when the row carries them', async () => {
      findMany.mockResolvedValue([
        { ...row, clientId: CLIENT_ID, vendorId: 'vendor-1', updatedAt: new Date() },
      ])

      const [item] = await createStore().listClientInquiries({ clientId: CLIENT_ID, limit: 20 })

      expect(item).not.toHaveProperty('clientId')
      expect(item).not.toHaveProperty('vendorId')
      expect(item).not.toHaveProperty('updatedAt')
      // The placement's status decides `isViewable` and then stays on the server.
      expect(item?.placement).not.toHaveProperty('status')
    })

    it('returns an empty list rather than failing when the client has no inquiries', async () => {
      findMany.mockResolvedValue([])

      await expect(
        createStore().listClientInquiries({ clientId: CLIENT_ID, limit: 20 }),
      ).resolves.toEqual([])
    })
  })

  describe('paging rows that share a createdAt', () => {
    // The reason for the `(createdAt, id)` tie-break. Two inquiries submitted in the same
    // millisecond are ordered only by id, and a cursor carrying just the timestamp would either
    // return the same row again or step past its sibling.
    //
    // No database is available in this suite, so these tests run the store's own `where` against a
    // small evaluator standing in for Postgres. That checks the predicate is internally consistent
    // with the sort; it does not prove Prisma emits the SQL we expect. Running the migration and
    // paging a real table is still outstanding.
    type Row = { id: string; createdAt: Date }

    const sameMoment = new Date('2026-10-26T10:00:00.000Z')
    const earlier = new Date('2026-10-26T09:00:00.000Z')

    const table: Row[] = [
      { id: 'c', createdAt: sameMoment },
      { id: 'b', createdAt: sameMoment },
      { id: 'a', createdAt: sameMoment },
      { id: 'z', createdAt: earlier },
    ]

    /** The subset of Prisma's `where` the cursor predicate uses, evaluated over one row. */
    function matches(where: Record<string, unknown>, candidate: Row): boolean {
      const or = where.OR as
        [{ createdAt: { lt: Date } }, { createdAt: Date; id: { lt: string } }] | undefined
      if (!or) return true
      const [olderMoment, sameMomentSmallerId] = or
      return (
        candidate.createdAt.valueOf() < olderMoment.createdAt.lt.valueOf() ||
        (candidate.createdAt.valueOf() === sameMomentSmallerId.createdAt.valueOf() &&
          candidate.id < sameMomentSmallerId.id.lt)
      )
    }

    /** Stands in for Postgres: filter by the store's `where`, sort as the store asked, then take. */
    function query(args: {
      where: Record<string, unknown>
      orderBy: unknown
      take: number
    }): Row[] {
      expect(args.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }])
      return table
        .filter((candidate) => matches(args.where, candidate))
        .sort(
          (left, right) =>
            right.createdAt.valueOf() - left.createdAt.valueOf() || right.id.localeCompare(left.id),
        )
        .slice(0, args.take)
    }

    beforeEach(() => {
      findMany.mockReset()
      findMany.mockImplementation(async (args: Parameters<typeof query>[0]) =>
        query(args).map((found) => ({ ...row, ...found, placement })),
      )
    })

    it('walks every row exactly once, one row at a time', async () => {
      const store = createStore()
      const seen: string[] = []
      let cursor: InquiryCursor | undefined

      // One row per page is the worst case: every page boundary falls inside the shared timestamp.
      for (let page = 0; page < table.length + 1; page += 1) {
        const [item] = await store.listClientInquiries({ clientId: CLIENT_ID, cursor, limit: 1 })
        if (!item) break
        seen.push(item.id)
        cursor = { createdAt: new Date(item.createdAt), id: item.id }
      }

      expect(seen).toEqual(['c', 'b', 'a', 'z'])
    })

    it('stops instead of returning the cursor row again', async () => {
      const store = createStore()

      const last = await store.listClientInquiries({
        clientId: CLIENT_ID,
        cursor: { createdAt: earlier, id: 'z' },
        limit: 20,
      })

      expect(last).toEqual([])
    })

    it('does not skip the siblings sharing the cursor row timestamp', async () => {
      const store = createStore()

      const rest = await store.listClientInquiries({
        clientId: CLIENT_ID,
        cursor: { createdAt: sameMoment, id: 'c' },
        limit: 20,
      })

      expect(rest.map((item) => item.id)).toEqual(['b', 'a', 'z'])
    })
  })
})
