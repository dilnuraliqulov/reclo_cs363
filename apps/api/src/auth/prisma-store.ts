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
  }
}
