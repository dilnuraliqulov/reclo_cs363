import type { ApiError, HealthResponse } from '@reclo/shared'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import express, { type ErrorRequestHandler, type Express } from 'express'
import { createRequireAuth } from './auth/middleware'
import { createAuthRouter } from './auth/routes'
import type { AuthStore } from './auth/store'
import { createInquiryRouter } from './inquiries/routes'
import type { InquiryStore } from './inquiries/store'
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
  /** Where listing photos go. Without it the photo upload and delete routes are not mounted. */
  photoStorage?: PhotoStorage
  /** Directory served at `/uploads`. Omit to serve nothing (tests). */
  uploadsDir?: string
  /** Inquiries persistence. */
  inquiryStore?: InquiryStore
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
  /** Set the Secure flag on the session cookie (production). */
  secureCookies?: boolean
}

export function createApp({
  checkDatabase,
  authStore,
  placementStore,
  inquiryStore,
  vendorPlacementStore,
  photoStorage,
  uploadsDir,
  corsOrigin,
  now = () => new Date(),
  authRateLimitMax = 20,
  inquiryRateLimitMax = 20,
  vendorRateLimitMax = 120,
  secureCookies = false,
}: AppDependencies): Express {
  const app = express()

  if (corsOrigin) {
    app.use(cors({ origin: corsOrigin, credentials: true }))
  }
  app.use(express.json())
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

  // Express identifies error handlers by their four parameters, so `next` must stay.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error?.type === 'entity.parse.failed') {
      res.status(400).json({ error: 'Malformed JSON', code: 'MALFORMED_JSON' } satisfies ApiError)
      return
    }
    console.error('Unhandled error', error)
    res.status(500).json({ error: 'Something went wrong', code: 'INTERNAL' } satisfies ApiError)
  }
  app.use(errorHandler)

  return app
}
