import type { HealthResponse } from '@reclo/shared'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import express, { type Express } from 'express'
import { createAdminInquiryRouter } from './admin/inquiry-routes'
import type { AdminInquiryStore } from './admin/inquiry-store'
import { createAdminRouter } from './admin/routes'
import { createRequireAuth } from './auth/middleware'
import { createAuthRouter } from './auth/routes'
import type { AuthStore } from './auth/store'
import { createCartRouter } from './cart/routes'
import type { CartStore } from './cart/store'
import {
  errorHandler,
  JSON_BODY_LIMIT,
  notFoundHandler,
  rejectNulBytes,
  requireJsonBody,
} from './http'
import { createInquiryRouter } from './inquiries/routes'
import type { InquiryStore } from './inquiries/store'
import { createAdminPlacementRouter } from './placements/admin-routes'
import type { AdminPlacementStore } from './placements/admin-store'
import { createPlacementRouter } from './placements/routes'
import type { PhotoStorage } from './placements/photo-storage'
import type { PlacementStore } from './placements/store'
import type { VendorPlacementStore } from './placements/vendor-store'
import { createVendorPlacementRouter } from './placements/vendor-routes'

export interface AppDependencies {
  /** Rejects when the database cannot be reached. */
  checkDatabase: () => Promise<void>
  /** Users and sessions. */
  authStore: AuthStore
  /** Placements persistence. */
  placementStore?: PlacementStore
  /** Vendor listing persistence. The `/api/vendor/placements` routes are mounted only when present. */
  vendorPlacementStore?: VendorPlacementStore
  /** Moderation persistence. The `/api/admin/placements` routes are mounted only when present. */
  adminPlacementStore?: AdminPlacementStore
  /** Where listing photos go. Without it the photo upload and delete routes are not mounted. */
  photoStorage?: PhotoStorage
  /** Directory served at `/uploads`. Omit to serve nothing (tests). */
  uploadsDir?: string
  /** Inquiries persistence. */
  inquiryStore?: InquiryStore
  /** Admin inquiry history. The `/api/admin/inquiries` routes are mounted only when present. */
  adminInquiryStore?: AdminInquiryStore
  /** A signed-in client's media plan. The `/api/cart` routes are mounted only when present. */
  cartStore?: CartStore
  /** Origin allowed by CORS (with credentials). Omit to disable CORS headers. */
  corsOrigin?: string
  /** Clock, injectable for session expiry tests. */
  now?: () => Date
  /** Max register + login requests per IP per 15 minutes. Defaults to 20. */
  authRateLimitMax?: number
  /** Max inquiry submissions per IP per 15 minutes. Defaults to 20. */
  inquiryRateLimitMax?: number
  /** Max mutating vendor listing requests per IP per 15 minutes. Defaults to 120. */
  vendorRateLimitMax?: number
  /** Max approve + reject + create-vendor requests per IP per 15 minutes. Defaults to 120. */
  adminRateLimitMax?: number
  /** Max cart writes per IP per 15 minutes. Defaults to 120. */
  cartRateLimitMax?: number
  /** Set the Secure flag on the session cookie (production). */
  secureCookies?: boolean
}

export function createApp({
  checkDatabase,
  authStore,
  placementStore,
  inquiryStore,
  adminInquiryStore,
  cartStore,
  vendorPlacementStore,
  adminPlacementStore,
  photoStorage,
  uploadsDir,
  corsOrigin,
  now = () => new Date(),
  authRateLimitMax = 20,
  inquiryRateLimitMax = 20,
  vendorRateLimitMax = 120,
  adminRateLimitMax = 120,
  cartRateLimitMax = 120,
  secureCookies = false,
}: AppDependencies): Express {
  const app = express()

  if (corsOrigin) {
    app.use(cors({ origin: corsOrigin, credentials: true }))
  }
  app.use(requireJsonBody)
  app.use(express.json({ limit: JSON_BODY_LIMIT }))
  app.use(rejectNulBytes)
  app.use(cookieParser())

  app.get('/health', async (_req, res) => {
    try {
      await checkDatabase()
      res.json({ status: 'ok' } satisfies HealthResponse)
    } catch (error) {
      console.error('Health check failed: database unreachable', error)
      res.status(503).json({ status: 'error' } satisfies HealthResponse)
    }
  })

  const requireAuth = createRequireAuth(authStore, now)
  app.use(
    '/api/auth',
    createAuthRouter({
      store: authStore,
      requireAuth,
      now,
      rateLimitMax: authRateLimitMax,
      secureCookies,
    }),
  )

  app.use(
    '/api/admin/vendors',
    createAdminRouter({ store: authStore, requireAuth, rateLimitMax: adminRateLimitMax }),
  )

  if (placementStore) {
    app.use('/api/placements', createPlacementRouter({ store: placementStore }))
  }

  if (vendorPlacementStore) {
    app.use(
      '/api/vendor/placements',
      createVendorPlacementRouter({
        store: vendorPlacementStore,
        photos: photoStorage,
        requireAuth,
        rateLimitMax: vendorRateLimitMax,
      }),
    )
  }

  if (adminPlacementStore) {
    app.use(
      '/api/admin/placements',
      createAdminPlacementRouter({
        store: adminPlacementStore,
        requireAuth,
        rateLimitMax: adminRateLimitMax,
      }),
    )
  }

  if (adminInquiryStore) {
    app.use(
      '/api/admin/inquiries',
      createAdminInquiryRouter({ store: adminInquiryStore, requireAuth }),
    )
  }

  if (uploadsDir) {
    // Photos are public, like the listings they belong to. `nosniff` keeps a browser from treating
    // a file as anything but the image type its extension says.
    app.use(
      '/uploads',
      express.static(uploadsDir, {
        index: false,
        setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff'),
      }),
    )
  }

  if (inquiryStore) {
    app.use(
      '/api/inquiries',
      createInquiryRouter({
        store: inquiryStore,
        requireAuth,
        now,
        rateLimitMax: inquiryRateLimitMax,
      }),
    )
  }

  if (cartStore) {
    app.use(
      '/api/cart',
      createCartRouter({ store: cartStore, requireAuth, rateLimitMax: cartRateLimitMax }),
    )
  }

  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}
