import argon2 from 'argon2'
import { describe, expect, it } from 'vitest'
import type { PrismaClient } from '../generated/prisma/client'
import { ensureAdmin } from './admin'

interface Row {
  email: string
  role: 'CLIENT' | 'VENDOR' | 'ADMIN'
  passwordHash: string
}

function fakeUsers(initial: Row[] = []) {
  const rows = [...initial]
  const prisma = {
    user: {
      async findUnique({ where }: { where: { email: string } }) {
        return rows.find((row) => row.email === where.email) ?? null
      },
      async create({ data }: { data: Row }) {
        rows.push({ ...data })
        return data
      },
      async update({ where, data }: { where: { email: string }; data: { role: Row['role'] } }) {
        const row = rows.find((candidate) => candidate.email === where.email)
        if (row) row.role = data.role
        return row
      },
    },
  } as unknown as Pick<PrismaClient, 'user'>
  return { prisma, rows }
}

const input = { email: ' Admin@Reclo.test ', password: 'a-long-enough-secret' }

describe('ensureAdmin', () => {
  it('creates an ADMIN with a hashed, normalised-email account', async () => {
    const { prisma, rows } = fakeUsers()

    expect(await ensureAdmin(prisma, input)).toBe('created')

    expect(rows).toHaveLength(1)
    expect(rows[0]!.email).toBe('admin@reclo.test')
    expect(rows[0]!.role).toBe('ADMIN')
    expect(rows[0]!.passwordHash).not.toContain(input.password)
    expect(await argon2.verify(rows[0]!.passwordHash, input.password)).toBe(true)
  })

  it('is idempotent: a second run changes nothing', async () => {
    const { prisma, rows } = fakeUsers()
    await ensureAdmin(prisma, input)
    const hash = rows[0]!.passwordHash

    expect(await ensureAdmin(prisma, input)).toBe('unchanged')

    expect(rows).toHaveLength(1)
    expect(rows[0]!.passwordHash).toBe(hash)
  })

  it('promotes an existing account without touching its password', async () => {
    const { prisma, rows } = fakeUsers([
      { email: 'admin@reclo.test', role: 'CLIENT', passwordHash: 'existing-hash' },
    ])

    expect(await ensureAdmin(prisma, input)).toBe('promoted')

    expect(rows[0]).toMatchObject({ role: 'ADMIN', passwordHash: 'existing-hash' })
  })

  it('refuses a missing or weak configuration instead of creating an account', async () => {
    const { prisma, rows } = fakeUsers()

    await expect(ensureAdmin(prisma, { email: undefined, password: undefined })).rejects.toThrow()
    await expect(ensureAdmin(prisma, { email: 'a@b.co', password: 'short' })).rejects.toThrow()
    await expect(
      ensureAdmin(prisma, { email: 'not-an-email', password: 'long-enough-1' }),
    ).rejects.toThrow()
    expect(rows).toHaveLength(0)
  })
})
