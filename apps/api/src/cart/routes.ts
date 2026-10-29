import { mergeCartRequestSchema, type ApiError, type CartResponse } from '@reclo/shared'
import { Router, type RequestHandler, type Response } from 'express'
import { rateLimit } from 'express-rate-limit'
import { z } from 'zod'
import { requireRole } from '../auth/middleware'
import { sendError, sendValidationError } from '../http'
import type { CartStore } from './store'

export interface CartRouterOptions {
  store: CartStore
  requireAuth: RequestHandler
  /** Max cart writes per IP per 15 minutes. */
  rateLimitMax: number
}

const placementIdSchema = z.string().uuid()

/** The placement id from the path, or a 400 already sent. */
function placementIdFrom(id: unknown, res: Response): string | undefined {
  const parsed = placementIdSchema.safeParse(id)
  if (!parsed.success) {
    sendError(res, 400, 'Invalid placement id', 'INVALID_PLACEMENT_ID')
    return undefined
  }
  return parsed.data
}

/**
 * A signed-in client's media plan (KAN-31, `docs/media-plan-cart-design.md`). The user id always
 * comes from the session: one client's cart must not be reachable by guessing another's id.
 */
export function createCartRouter({ store, requireAuth, rateLimitMax }: CartRouterOptions): Router {
  const router = Router()

  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: rateLimitMax,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: {
      error: 'Too many attempts, try again later',
      code: 'RATE_LIMITED',
    } satisfies ApiError,
  })

  router.use(requireAuth, requireRole('CLIENT'))

  router.get('/', async (req, res, next) => {
    try {
      res.json({ items: await store.list(req.user!.id) } satisfies CartResponse)
    } catch (error) {
      next(error)
    }
  })

  router.put('/items/:placementId', limiter, async (req, res, next) => {
    try {
      const placementId = placementIdFrom(req.params.placementId, res)
      if (!placementId) return

      const result = await store.add(req.user!.id, placementId)
      if (result.outcome === 'not_found') {
        // Missing and not ACTIVE answer alike, as on the public detail route.
        sendError(res, 404, 'Placement not found', 'PLACEMENT_NOT_FOUND')
        return
      }
      if (result.outcome === 'full') {
        sendError(res, 409, 'The media plan is full', 'CART_FULL')
        return
      }
      res.json({ items: result.items } satisfies CartResponse)
    } catch (error) {
      next(error)
    }
  })

  router.delete('/items/:placementId', limiter, async (req, res, next) => {
    try {
      const placementId = placementIdFrom(req.params.placementId, res)
      if (!placementId) return
      res.json({ items: await store.remove(req.user!.id, placementId) } satisfies CartResponse)
    } catch (error) {
      next(error)
    }
  })

  router.delete('/', limiter, async (req, res, next) => {
    try {
      await store.clear(req.user!.id)
      res.json({ items: [] } satisfies CartResponse)
    } catch (error) {
      next(error)
    }
  })

  router.post('/merge', limiter, async (req, res, next) => {
    try {
      const parsed = mergeCartRequestSchema.safeParse(req.body)
      if (!parsed.success) {
        sendValidationError(res, parsed.error)
        return
      }
      const items = await store.merge(req.user!.id, parsed.data.placementIds)
      res.json({ items } satisfies CartResponse)
    } catch (error) {
      next(error)
    }
  })

  return router
}
