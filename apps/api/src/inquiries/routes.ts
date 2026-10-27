import {
  createInquiryRequestSchema,
  DUPLICATE_WINDOW_DAYS,
  inquiryHistoryQuerySchema,
  type ApiError,
  type InquiryConflict,
  type InquiryHistoryResponse,
  type InquiryResponse,
} from '@reclo/shared'
import { Router, type RequestHandler } from 'express'
import { rateLimit } from 'express-rate-limit'
import { z } from 'zod'
import { requireRole } from '../auth/middleware'
import { decodeCursor, encodeCursor, type InquiryCursor } from './cursor'
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

// A cursor the client did not get from a previous page. Answered as a 400 rather than a silent
// reset to page one, which would look like the list restarting at random.
const INVALID_CURSOR = 'Invalid cursor'

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

  router.get('/', requireAuth, requireRole('CLIENT'), async (req, res, next) => {
    try {
      const parsed = inquiryHistoryQuerySchema.safeParse(req.query)
      if (!parsed.success) {
        res.status(400).json(validationError(parsed.error))
        return
      }
      const { status, limit } = parsed.data

      let cursor: InquiryCursor | undefined
      if (parsed.data.cursor !== undefined) {
        const decoded = decodeCursor(parsed.data.cursor)
        if (!decoded) {
          res.status(400).json({
            error: 'Invalid input',
            fieldErrors: { cursor: [INVALID_CURSOR] },
          } satisfies ApiError)
          return
        }
        cursor = decoded
      }

      // One row past the page, so a full page is distinguishable from the last one without a
      // second count query.
      const rows = await store.listClientInquiries({
        // From the session, never from the query: one client's history must not be reachable by
        // guessing another's id.
        clientId: req.user!.id,
        status,
        cursor,
        limit: limit + 1,
      })

      const hasMore = rows.length > limit
      const inquiries = hasMore ? rows.slice(0, limit) : rows
      // The cursor comes from the last row returned, so the next page resumes exactly after it.
      const last = inquiries.at(-1)
      const nextCursor =
        hasMore && last ? encodeCursor({ createdAt: new Date(last.createdAt), id: last.id }) : null

      res.json({ inquiries, nextCursor } satisfies InquiryHistoryResponse)
    } catch (error) {
      next(error)
    }
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

      // The window lives here rather than in the partial unique index, whose predicate must be
      // IMMUTABLE and so cannot mention `now()`. The index stays the race guard: two concurrent
      // submits can both pass this check, and the unique violation below answers the same way.
      const open = await store.findOpenInquiry({ clientId, placementId })
      if (open) {
        const cutoff = new Date(now().getTime() - DUPLICATE_WINDOW_MS)
        if (open.createdAt >= cutoff) {
          res.status(409).json({
            error: DUPLICATE_ERROR,
            existingInquiryCreatedAt: open.createdAt.toISOString(),
          } satisfies InquiryConflict)
          return
        }
        // Past the window: a vendor who never replied must not lock the client out of this
        // placement for good. Closing the stale row is also what frees the index to accept the
        // new one. If it is no longer open, a vendor or a racing request got there first, and the
        // insert below decides the outcome.
        await store.closeStaleInquiry(open.id)
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
