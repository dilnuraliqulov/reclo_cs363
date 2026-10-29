import { prisma } from '../db'
import { ensureAdmin } from './admin'

// Usage: ADMIN_EMAIL=... ADMIN_PASSWORD=... pnpm --filter @reclo/api run db:seed-admin
try {
  const result = await ensureAdmin(prisma, {
    email: process.env['ADMIN_EMAIL'],
    password: process.env['ADMIN_PASSWORD'],
  })
  console.log(`Admin account: ${result}`)
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
} finally {
  await prisma.$disconnect()
}
