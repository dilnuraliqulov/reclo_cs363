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
import type { PlacementStore } from './placements/store'

export interface AppDependencies {
  /** Rejects when the database cannot be reached. */
  checkDatabase: () => Promise<void>
  /** Users and sessions. */
  authStore: AuthStore
  /** Placements persistence. */
  placementStore?: PlacementStore
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
  /** Set the Secure flag on the session cookie (production). */
  secureCookies?: boolean
}

export function createApp({
  checkDatabase,
  authStore,
  placementStore,
  inquiryStore,
  corsOrigin,
  now = () => new Date(),
  authRateLimitMax = 20,
  inquiryRateLimitMax = 20,
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
      res.status(400).json({ error: 'Malformed JSON' } satisfies ApiError)
      return
    }
    console.error('Unhandled error', error)
    res.status(500).json({ error: 'Something went wrong' } satisfies ApiError)
  }
  app.use(errorHandler)

  return app
}
