import {
  createInquiryRequestSchema,
  DUPLICATE_WINDOW_DAYS,
  type ApiError,
  type InquiryConflict,
  type InquiryResponse,
} from '@reclo/shared'
import { Router, type RequestHandler } from 'express'
import { rateLimit } from 'express-rate-limit'
import { z } from 'zod'
import { requireRole } from '../auth/middleware'
import { OpenInquiryExistsError, type InquiryStore } from './store'

export interface InquiryRouterOptions {
  store: InquiryStore
  requireAuth: RequestHandler
  now: () => Date
  /** Max inquiry submissions per IP per 15 minutes. */
  rateLimitMax: number
}

const DUPLICATE_ERROR = 'You already have an open inquiry for this placement'

// A client has no business learning that an archived or pending-review placement exists, so a
// missing placement and one that is not ACTIVE answer the same way.
const PLACEMENT_NOT_FOUND = 'Placement not found'

const DUPLICATE_WINDOW_MS = DUPLICATE_WINDOW_DAYS * 24 * 60 * 60 * 1000

function validationError(error: z.ZodError): ApiError {
  return { error: 'Invalid input', fieldErrors: z.flattenError(error).fieldErrors }
}

export function createInquiryRouter({
  store,
  requireAuth,
  now,
  rateLimitMax,
}: InquiryRouterOptions): Router {
  const router = Router()

  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: rateLimitMax,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many attempts, try again later' } satisfies ApiError,
  })

  router.post('/', limiter, requireAuth, requireRole('CLIENT'), async (req, res, next) => {
    try {
      const parsed = createInquiryRequestSchema.safeParse(req.body)
      if (!parsed.success) {
        res.status(400).json(validationError(parsed.error))
        return
      }
      const { placementId, message, contactName, contactPhone, contactEmail } = parsed.data
      const clientId = req.user!.id

      const placement = await store.findActivePlacement(placementId)
      if (!placement) {
        res.status(404).json({ error: PLACEMENT_NOT_FOUND } satisfies ApiError)
        return
      }

      // Advisory: two concurrent submits can both pass it, so the partial unique index holds the
      // real rule and a unique violation on insert answers the same way.
      const open = await store.findOpenInquiry({
        clientId,
        placementId,
        since: new Date(now().getTime() - DUPLICATE_WINDOW_MS),
      })
      if (open) {
        res.status(409).json({
          error: DUPLICATE_ERROR,
          existingInquiryCreatedAt: open.createdAt.toISOString(),
        } satisfies InquiryConflict)
        return
      }

      try {
        const inquiry = await store.createInquiry({
          placementId,
          clientId,
          vendorId: placement.vendorId,
          message,
          contactName,
          contactPhone,
          contactEmail,
          desiredStartDate: parsed.data.desiredStartDate
            ? new Date(`${parsed.data.desiredStartDate}T00:00:00.000Z`)
            : null,
          durationMonths: parsed.data.durationMonths ?? null,
        })
        res.status(201).json({ inquiry } satisfies InquiryResponse)
      } catch (error) {
        if (error instanceof OpenInquiryExistsError) {
          res.status(409).json({ error: DUPLICATE_ERROR } satisfies InquiryConflict)
          return
        }
        throw error
      }
    } catch (error) {
      next(error)
    }
  })

  return router
}
