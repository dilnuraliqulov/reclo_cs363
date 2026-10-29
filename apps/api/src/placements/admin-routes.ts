import {
  adminPlacementListQuerySchema,
  approvePlacementRequestSchema,
  rejectPlacementRequestSchema,
  type AdminPlacementListResponse,
  type AdminPlacementResponse,
  type ApiError,
  type ErrorCode,
} from '@reclo/shared'
import { Router, type RequestHandler, type Response } from 'express'
import { rateLimit } from 'express-rate-limit'
import { z } from 'zod'
import { requireRole } from '../auth/middleware'
import type { AdminPlacementStore, DecisionRefusal, DecisionResult } from './admin-store'

export interface AdminPlacementRouterOptions {
  store: AdminPlacementStore
  requireAuth: RequestHandler
  /** Max approve + reject requests per IP per 15 minutes. */
  rateLimitMax: number
}

function send(res: Response, status: number, error: string, code: ErrorCode): void {
  res.status(status).json({ error, code } satisfies ApiError)
}

const notFound = (res: Response) => send(res, 404, 'Placement not found', 'PLACEMENT_NOT_FOUND')

function sendValidationError(
  res: Response,
  error: z.ZodError,
  code: 'INVALID_INPUT' | 'INVALID_QUERY',
): void {
  const { fieldErrors, formErrors } = z.flattenError(error)
  res.status(400).json({
    error: code === 'INVALID_QUERY' ? 'Invalid query' : 'Invalid input',
    code,
    fieldErrors: formErrors.length > 0 ? { ...fieldErrors, _form: formErrors } : fieldErrors,
  } satisfies ApiError)
}

const REFUSALS: Record<Exclude<DecisionRefusal, 'NOT_FOUND'>, [string, ErrorCode]> = {
  NOT_PENDING: ['The listing is no longer waiting for review', 'PLACEMENT_NOT_PENDING'],
  CHANGED: ['The listing changed since you opened it; review it again', 'PLACEMENT_CHANGED'],
  NO_PHOTOS: ['A listing without photos cannot be approved', 'PLACEMENT_NO_PHOTOS'],
}

function sendDecision(res: Response, result: DecisionResult): void {
  if (result.ok) {
    res.json({ placement: result.placement } satisfies AdminPlacementResponse)
  } else if (result.reason === 'NOT_FOUND') {
    notFound(res)
  } else {
    // Nothing about the other admin or the vendor goes out, only that the state moved on.
    const [message, code] = REFUSALS[result.reason]
    send(res, 409, message, code)
  }
}

export function createAdminPlacementRouter({
  store,
  requireAuth,
  rateLimitMax,
}: AdminPlacementRouterOptions): Router {
  const router = Router()

  // One `use`, so a route added later cannot forget the auth and role checks.
  router.use(requireAuth, requireRole('ADMIN'))

  // Approve and reject share one limiter; reads are not limited.
  const decisionLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: rateLimitMax,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: {
      error: 'Too many attempts, try again later',
      code: 'RATE_LIMITED',
    } satisfies ApiError,
  })

  router.param('id', (_req, res, next, id: string) => {
    if (!z.string().uuid().safeParse(id).success) {
      send(res, 400, 'Invalid placement id', 'INVALID_PLACEMENT_ID')
      return
    }
    next()
  })

  /** The signed-in admin. `requireAuth` ran, so it is set. */
  const adminId = (res: Response): string => {
    const id = res.req.user?.id
    if (!id) throw new Error('requireAuth did not set req.user')
    return id
  }

  router.get('/', async (req, res) => {
    const parsed = adminPlacementListQuerySchema.safeParse(req.query)
    if (!parsed.success) {
      sendValidationError(res, parsed.error, 'INVALID_QUERY')
      return
    }
    res.json((await store.list(parsed.data)) satisfies AdminPlacementListResponse)
  })

  router.get('/:id', async (req, res) => {
    const placement = await store.findById(req.params.id)
    if (!placement) {
      notFound(res)
      return
    }
    res.json({ placement } satisfies AdminPlacementResponse)
  })

  router.post<{ id: string }>('/:id/approve', decisionLimiter, async (req, res) => {
    const parsed = approvePlacementRequestSchema.safeParse(req.body)
    if (!parsed.success) {
      sendValidationError(res, parsed.error, 'INVALID_INPUT')
      return
    }
    const expected = new Date(parsed.data.expectedUpdatedAt)
    sendDecision(res, await store.approve(req.params.id, adminId(res), expected))
  })

  router.post<{ id: string }>('/:id/reject', decisionLimiter, async (req, res) => {
    const parsed = rejectPlacementRequestSchema.safeParse(req.body)
    if (!parsed.success) {
      sendValidationError(res, parsed.error, 'INVALID_INPUT')
      return
    }
    const { expectedUpdatedAt, reason } = parsed.data
    sendDecision(
      res,
      await store.reject(req.params.id, adminId(res), new Date(expectedUpdatedAt), reason),
    )
  })

  return router
}
