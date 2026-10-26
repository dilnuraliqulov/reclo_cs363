import { createApp } from './app'
import { createPrismaAuthStore } from './auth/prisma-store'
import { checkDatabase, prisma } from './db'
import { env } from './env'
import { createPrismaInquiryStore } from './inquiries/prisma-store'
import { PrismaPlacementStore } from './placements/prisma-store'

const app = createApp({
  checkDatabase,
  authStore: createPrismaAuthStore(prisma),
  placementStore: new PrismaPlacementStore(prisma),
  inquiryStore: createPrismaInquiryStore(prisma),
  corsOrigin: env.CORS_ORIGIN,
  secureCookies: process.env['NODE_ENV'] === 'production',
})

app.listen(env.PORT, () => {
  console.log(`API listening on http://localhost:${env.PORT}`)
})
