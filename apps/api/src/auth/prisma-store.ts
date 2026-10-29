import type { VendorSummary } from '@reclo/shared'
import { Prisma, type PrismaClient } from '../generated/prisma/client'
import { EmailTakenError, type AuthStore } from './store'

export function createPrismaAuthStore(prisma: PrismaClient): AuthStore {
  return {
    findUserByEmail: (email) =>
      prisma.user.findUnique({
        where: { email },
        select: { id: true, email: true, role: true, passwordHash: true },
      }),

    async createClient({ email, passwordHash }) {
      try {
        return await prisma.user.create({
          data: { email, passwordHash, role: 'CLIENT' },
          select: { id: true, email: true, role: true },
        })
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new EmailTakenError()
        }
        throw error
      }
    },

    async createSession({ userId, tokenHash, expiresAt }) {
      await prisma.session.create({ data: { userId, tokenHash, expiresAt } })
    },

    findSessionByTokenHash: (tokenHash) =>
      prisma.session.findUnique({
        where: { tokenHash },
        select: {
          id: true,
          expiresAt: true,
          user: { select: { id: true, email: true, role: true } },
        },
      }),

    async deleteSessionByTokenHash(tokenHash) {
      await prisma.session.deleteMany({ where: { tokenHash } })
    },

    async createVendor({ email, passwordHash, companyName, createdById }) {
      try {
        const vendor = await prisma.user.create({
          data: { email, passwordHash, companyName, createdById, role: 'VENDOR' },
          select: vendorSelect,
        })
        return toVendorSummary(vendor)
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new EmailTakenError()
        }
        throw error
      }
    },

    async listVendors(limit) {
      const vendors = await prisma.user.findMany({
        where: { role: 'VENDOR' },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit,
        select: vendorSelect,
      })
      return vendors.map(toVendorSummary)
    },
  }
}

const vendorSelect = { id: true, email: true, companyName: true, createdAt: true } as const

function toVendorSummary(vendor: {
  id: string
  email: string
  companyName: string | null
  createdAt: Date
}): VendorSummary {
  // Every VENDOR row this API writes has a company name. One created by hand before KAN-55 may
  // not, and the list should still render it rather than fail the response.
  return {
    ...vendor,
    companyName: vendor.companyName ?? '',
    createdAt: vendor.createdAt.toISOString(),
  }
}
