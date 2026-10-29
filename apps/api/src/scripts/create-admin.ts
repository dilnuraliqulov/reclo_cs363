// Usage: ADMIN_EMAIL=... ADMIN_PASSWORD=... pnpm --filter @reclo/api admin:create
import { bootstrapAdmin } from '../admin/bootstrap'
import { prisma } from '../db'

try {
  const result = await bootstrapAdmin(process.env, {
    emailExists: async (email) => (await prisma.user.count({ where: { email } })) > 0,
    insertAdmin: async ({ email, passwordHash }) => {
      await prisma.user.create({ data: { email, passwordHash, role: 'ADMIN' } })
    },
  })
  if (result.ok) {
    console.log(`Created admin ${result.email}`)
  } else if (result.reason === 'email-exists') {
    console.error(`${result.email} is already registered; nothing was changed.`)
    process.exitCode = 1
  } else {
    console.error(`Set ADMIN_EMAIL and ADMIN_PASSWORD. ${result.details}`)
    process.exitCode = 1
  }
} finally {
  await prisma.$disconnect()
}
