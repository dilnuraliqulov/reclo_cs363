import { randomUUID } from 'node:crypto'
import type { PrismaClient } from '../generated/prisma/client'

/**
 * Test double for the slice of Prisma the placement stores use. It evaluates `where` for real
 * (equality, `in`, `not`, `gte`/`lte`, list `equals`/`isEmpty`, Date equality), so a store test proves a transition is
 * refused from the wrong state rather than only that some `where` was passed.
 */
export interface FakeRow {
  id: string
  title: string
  description: string | null
  type: 'BILLBOARD' | 'LED_SCREEN'
  status: 'ACTIVE' | 'PENDING_REVIEW' | 'INACTIVE' | 'REJECTED' | 'ARCHIVED'
  latitude: number
  longitude: number
  address: string
  city: string
  pricePerMonth: number
  width: number | null
  height: number | null
  lighting: boolean
  ledDurationSeconds: number | null
  ledPlaysPerDay: number | null
  photos: string[]
  archivedAt: Date | null
  vendorId: string
  createdAt: Date
  updatedAt: Date
}

export interface FakeUser {
  id: string
  email: string
}

export interface FakeEvent {
  id: string
  placementId: string
  adminId: string | null
  action: 'APPROVED' | 'REJECTED'
  reason: string | null
  createdAt: Date
}

type Condition = Record<string, unknown>
type Order = Record<string, 'asc' | 'desc'>

function matchesField(value: unknown, condition: unknown): boolean {
  if (condition instanceof Date) {
    return value instanceof Date && value.getTime() === condition.getTime()
  }
  if (condition === null || typeof condition !== 'object') {
    return value === condition
  }
  const c = condition as Condition
  if ('equals' in c) {
    const same = Array.isArray(value)
      ? Array.isArray(c['equals']) &&
        value.length === c['equals'].length &&
        value.every((item, index) => item === (c['equals'] as unknown[])[index])
      : value === c['equals']
    if (!same) return false
  }
  if ('isEmpty' in c && ((value as unknown[]).length === 0) !== c['isEmpty']) return false
  if ('in' in c && !(c['in'] as unknown[]).includes(value)) return false
  if ('not' in c && value === c['not']) return false
  if ('gte' in c && !((value as number) >= (c['gte'] as number))) return false
  if ('lte' in c && !((value as number) <= (c['lte'] as number))) return false
  return true
}

function matches(row: FakeRow, where: Condition = {}): boolean {
  return Object.entries(where).every(([key, condition]) =>
    matchesField((row as unknown as Condition)[key], condition),
  )
}

export function createFakePrisma(
  initial: Partial<FakeRow>[] = [],
  users: FakeUser[] = [],
  initialEvents: Partial<FakeEvent>[] = [],
) {
  let tick = 0
  const base = (): FakeRow => ({
    id: randomUUID(),
    title: 'Amir Temur Billboard',
    description: null,
    type: 'BILLBOARD',
    status: 'PENDING_REVIEW',
    latitude: 41.311,
    longitude: 69.279,
    address: 'Amir Temur Ave 10',
    city: 'Tashkent',
    pricePerMonth: 5_000_000,
    width: null,
    height: null,
    lighting: false,
    ledDurationSeconds: null,
    ledPlaysPerDay: null,
    photos: [],
    archivedAt: null,
    vendorId: 'vendor-1',
    createdAt: new Date(Date.UTC(2026, 9, 1, 0, 0, tick++)),
    updatedAt: new Date(Date.UTC(2026, 9, 1, 0, 0, 0)),
  })
  const rows: FakeRow[] = initial.map((partial) => ({ ...base(), ...partial }))
  let eventTick = 0
  const makeEvent = (partial: Partial<FakeEvent>): FakeEvent => ({
    id: randomUUID(),
    placementId: '',
    adminId: null,
    action: 'APPROVED',
    reason: null,
    createdAt: new Date(Date.UTC(2026, 9, 1, 1, 0, eventTick++)),
    ...partial,
  })
  const events: FakeEvent[] = initialEvents.map(makeEvent)

  const sortBy = <T>(list: T[], orderBy: Order | Order[] | undefined): T[] => {
    const order = (Array.isArray(orderBy) ? orderBy : orderBy ? [orderBy] : []).flatMap(
      Object.entries,
    )
    return [...list].sort((a, b) => {
      for (const [key, direction] of order) {
        const left = (a as Condition)[key] as Date | string
        const right = (b as Condition)[key] as Date | string
        if (left < right) return direction === 'asc' ? -1 : 1
        if (left > right) return direction === 'asc' ? 1 : -1
      }
      return 0
    })
  }

  /** The `include`s the stores ask for: the vendor and the (newest first) moderation events. */
  const hydrate = (row: FakeRow, include: Condition | undefined) => {
    const out: Record<string, unknown> = { ...row, photos: [...row.photos] }
    if (include?.['vendor']) {
      const vendor = users.find((user) => user.id === row.vendorId)
      if (!vendor) throw new Error('fake: vendor missing')
      out['vendor'] = { ...vendor }
    }
    if (include?.['moderationEvents']) {
      const spec = include['moderationEvents'] as { orderBy?: Order; take?: number }
      out['moderationEvents'] = sortBy(
        events.filter((event) => event.placementId === row.id),
        spec.orderBy,
      )
        .slice(0, spec.take)
        .map((event) => {
          const admin = users.find((user) => user.id === event.adminId)
          return { ...event, admin: admin ? { email: admin.email } : null }
        })
    }
    return out
  }

  const calls = { updateMany: [] as Condition[], findFirst: [] as Condition[] }
  /** Runs just before each `updateMany`, to play another request's write in between. */
  const hooks: { beforeUpdateMany?: () => void; beforeEventCreate?: () => void } = {}

  const placement = {
    async findFirst({ where }: { where?: Condition }) {
      calls.findFirst.push(where ?? {})
      const row = rows.find((candidate) => matches(candidate, where))
      return row ? { ...row, photos: [...row.photos] } : null
    },
    async findMany({
      where,
      skip = 0,
      take,
      orderBy = { createdAt: 'desc' },
      include,
    }: {
      where?: Condition
      skip?: number
      take?: number
      orderBy?: Order | Order[]
      include?: Condition
    }) {
      const found = sortBy(
        rows.filter((candidate) => matches(candidate, where)),
        orderBy,
      )
      return found
        .slice(skip, take === undefined ? undefined : skip + take)
        .map((r) => hydrate(r, include))
    },
    async findUnique({ where, include }: { where: { id: string }; include?: Condition }) {
      const row = rows.find((candidate) => candidate.id === where.id)
      return row ? hydrate(row, include) : null
    },
    async findUniqueOrThrow(args: { where: { id: string }; include?: Condition }) {
      const row = await placement.findUnique(args)
      if (!row) throw new Error('fake: not found')
      return row
    },
    async count({ where }: { where?: Condition }) {
      return rows.filter((candidate) => matches(candidate, where)).length
    },
    async create({ data }: { data: Partial<FakeRow> }) {
      const row = { ...base(), ...data }
      rows.push(row)
      return { ...row }
    },
    async updateMany({ where, data }: { where?: Condition; data: Partial<FakeRow> }) {
      calls.updateMany.push(where ?? {})
      hooks.beforeUpdateMany?.()
      const found = rows.filter((candidate) => matches(candidate, where))
      for (const row of found) Object.assign(row, data, { updatedAt: new Date() })
      return { count: found.length }
    },
  }

  const moderationEvent = {
    async create({ data }: { data: Partial<FakeEvent> }) {
      hooks.beforeEventCreate?.()
      const event = makeEvent(data)
      events.push(event)
      return { ...event }
    },
    async findMany({ where, orderBy }: { where?: Condition; orderBy?: Order; select?: Condition }) {
      return sortBy(
        events.filter((event) => matches(event as unknown as FakeRow, where)),
        orderBy,
      ).map((event) => ({ ...event }))
    },
  }

  const client = {
    placement,
    moderationEvent,
    /** Runs `work` against the same tables; a throw puts every row and event back as they were. */
    async $transaction<T>(work: (tx: unknown) => Promise<T>): Promise<T> {
      const savedRows = rows.map((row) => ({ ...row, photos: [...row.photos] }))
      const savedEvents = [...events]
      try {
        return await work(client)
      } catch (error) {
        rows.splice(0, rows.length, ...savedRows)
        events.splice(0, events.length, ...savedEvents)
        throw error
      }
    },
  }

  return { prisma: client as unknown as PrismaClient, rows, events, calls, hooks }
}
