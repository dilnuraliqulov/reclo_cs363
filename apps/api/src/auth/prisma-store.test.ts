import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Prisma, type PrismaClient } from '../generated/prisma/client'
import { createPrismaAuthStore } from './prisma-store'
import { EmailTakenError } from './store'

const ADMIN_ID = '3d0f6f2a-7c8b-4f3d-9a1e-0b2c4d6e8f01'
const createdAt = new Date('2026-10-28T10:00:00.000Z')

const vendorRow = {
  id: '8f1e2bb6-6ad8-4a2e-9f6e-1c2f6f2a31a0',
  email: 'sales@reklama.uz',
  companyName: 'Reklama Plus',
  createdAt,
}

const create = vi.fn()
const findMany = vi.fn()

function createStore() {
  const prisma = { user: { create, findMany } } as unknown as PrismaClient
  return createPrismaAuthStore(prisma)
}

const input = {
  email: 'sales@reklama.uz',
  passwordHash: '$argon2id$hash',
  companyName: 'Reklama Plus',
  createdById: ADMIN_ID,
}

describe('createPrismaAuthStore.createVendor', () => {
  beforeEach(() => {
    create.mockReset()
    create.mockResolvedValue(vendorRow)
  })

  it('writes a VENDOR attributed to the admin, whatever else is going on', async () => {
    await createStore().createVendor(input)

    expect(create.mock.lastCall?.[0].data).toEqual({ ...input, role: 'VENDOR' })
  })

  it('never selects the password hash back out', async () => {
    await createStore().createVendor(input)

    expect(create.mock.lastCall?.[0].select).not.toHaveProperty('passwordHash')
  })

  it('returns the summary with an ISO timestamp', async () => {
    await expect(createStore().createVendor(input)).resolves.toEqual({
      ...vendorRow,
      createdAt: createdAt.toISOString(),
    })
  })

  it('turns a unique violation into EmailTakenError', async () => {
    create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    )

    await expect(createStore().createVendor(input)).rejects.toBeInstanceOf(EmailTakenError)
  })

  it('lets any other failure through unchanged', async () => {
    const failure = new Error('connection lost')
    create.mockRejectedValue(failure)

    await expect(createStore().createVendor(input)).rejects.toBe(failure)
  })
})

describe('createPrismaAuthStore.listVendors', () => {
  beforeEach(() => {
    findMany.mockReset()
    findMany.mockResolvedValue([vendorRow])
  })

  it('reads vendors only, newest first with an id tie-break, up to the limit', async () => {
    await createStore().listVendors(200)

    expect(findMany.mock.lastCall?.[0]).toMatchObject({
      where: { role: 'VENDOR' },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 200,
    })
    expect(findMany.mock.lastCall?.[0].select).not.toHaveProperty('passwordHash')
  })

  it('renders a vendor created before company names existed rather than failing', async () => {
    findMany.mockResolvedValue([{ ...vendorRow, companyName: null }])

    const [vendor] = await createStore().listVendors(200)

    expect(vendor!.companyName).toBe('')
  })
})
