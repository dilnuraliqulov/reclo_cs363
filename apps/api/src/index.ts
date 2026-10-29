import { fileURLToPath } from 'node:url'
import { createApp } from './app'
import { createPrismaAuthStore } from './auth/prisma-store'
import { checkDatabase, prisma } from './db'
import { env } from './env'
import { createPrismaInquiryStore } from './inquiries/prisma-store'
import { DiskPhotoStorage } from './placements/photo-storage'
import { PrismaPlacementStore } from './placements/prisma-store'
import { PrismaVendorPlacementStore } from './placements/vendor-prisma-store'

// apps/api/uploads, whether run from src/ (tsx) or dist/ (tsup).
const uploadsDir = fileURLToPath(new URL('../uploads', import.meta.url))

const app = createApp({
  checkDatabase,
  authStore: createPrismaAuthStore(prisma),
  placementStore: new PrismaPlacementStore(prisma, env.API_PUBLIC_URL),
  vendorPlacementStore: new PrismaVendorPlacementStore(prisma, env.API_PUBLIC_URL),
  photoStorage: new DiskPhotoStorage(uploadsDir),
  uploadsDir,
  inquiryStore: createPrismaInquiryStore(prisma),
  corsOrigin: env.CORS_ORIGIN,
  secureCookies: process.env['NODE_ENV'] === 'production',
})

app.listen(env.PORT, () => {
  console.log(`API listening on http://localhost:${env.PORT}`)
})
