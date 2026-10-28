import { randomUUID } from 'node:crypto'
import type { PrismaClient } from '../generated/prisma/client'

/**
 * Test double for the slice of Prisma the placement stores use. It evaluates `where` for real
 * (equality, `in`, `not`, `gte`/`lte`, list `equals`), so a store test proves a transition is
 * refused from the wrong state rather than only that some `where` was passed.
 */
export interface FakeRow {
  id: string
  title: string
  description: string | null
  type: 'BILLBOARD' | 'LED_SCREEN' | 'WALL_MURAL' | 'CITY_FORMAT'
  status: 'ACTIVE' | 'PENDING_REVIEW' | 'INACTIVE' | 'ARCHIVED'
  latitude: number
  longitude: number
  address: string
  city: string
  pricePerMonth: number
  width: number | null
  height: number | null
  lighting: boolean
  photos: string[]
  archivedAt: Date | null
  vendorId: string
  createdAt: Date
  updatedAt: Date
}

type Condition = Record<string, unknown>

function matchesField(value: unknown, condition: unknown): boolean {
  if (condition === null || typeof condition !== 'object' || condition instanceof Date) {
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

export function createFakePrisma(initial: Partial<FakeRow>[] = []) {
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
    photos: [],
    archivedAt: null,
    vendorId: 'vendor-1',
    createdAt: new Date(Date.UTC(2026, 9, 1, 0, 0, tick++)),
    updatedAt: new Date(Date.UTC(2026, 9, 1, 0, 0, 0)),
  })
  const rows: FakeRow[] = initial.map((partial) => ({ ...base(), ...partial }))

  const calls = { updateMany: [] as Condition[], findFirst: [] as Condition[] }
  /** Runs just before each `updateMany`, to play another request's write in between. */
  const hooks: { beforeUpdateMany?: () => void } = {}

  const placement = {
    async findFirst({ where }: { where?: Condition }) {
      calls.findFirst.push(where ?? {})
      const row = rows.find((candidate) => matches(candidate, where))
      return row ? { ...row, photos: [...row.photos] } : null
    },
    async findMany({ where, skip = 0, take }: { where?: Condition; skip?: number; take?: number }) {
      const found = rows
        .filter((candidate) => matches(candidate, where))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      return found.slice(skip, take === undefined ? undefined : skip + take).map((r) => ({ ...r }))
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

  return { prisma: { placement } as unknown as PrismaClient, rows, calls, hooks }
}
