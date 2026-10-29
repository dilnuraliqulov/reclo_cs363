import { registerRequestSchema } from '@reclo/shared'
import argon2 from 'argon2'
import type { PrismaClient } from '../generated/prisma/client'

export type EnsureAdminResult = 'created' | 'promoted' | 'unchanged'

/**
 * Makes sure one ADMIN account exists (docs/moderation-design.md: no admin can be created through
 * the app). Safe to run again: an existing account keeps its password and only has its role set
 * to ADMIN, so a re-run never resets a password that was changed since.
 *
 * Email and password come from the caller, which reads them from the environment: nothing is
 * hard-coded here.
 */
export async function ensureAdmin(
  prisma: Pick<PrismaClient, 'user'>,
  input: { email: string | undefined; password: string | undefined },
): Promise<EnsureAdminResult> {
  const parsed = registerRequestSchema.safeParse(input)
  if (!parsed.success) {
    throw new Error(
      'ADMIN_EMAIL must be a valid email and ADMIN_PASSWORD must be 8 to 128 characters',
    )
  }
  const { email, password } = parsed.data

  const existing = await prisma.user.findUnique({ where: { email }, select: { role: true } })
  if (existing) {
    if (existing.role === 'ADMIN') return 'unchanged'
    await prisma.user.update({ where: { email }, data: { role: 'ADMIN' } })
    return 'promoted'
  }
  await prisma.user.create({
    data: { email, passwordHash: await argon2.hash(password), role: 'ADMIN' },
  })
  return 'created'
}
