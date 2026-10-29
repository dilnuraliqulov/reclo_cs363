import {
  ADMIN_INQUIRY_PAGE_SIZE,
  adminInquiryQuerySchema,
  type AdminInquiryDetailResponse,
  type AdminInquiryListResponse,
} from '@reclo/shared'
import { Router, type RequestHandler } from 'express'
import { z } from 'zod'
import { requireRole } from '../auth/middleware'
import { sendError, sendValidationError } from '../http'
import type { AdminInquiryStore } from './inquiry-store'

export interface AdminInquiryRouterOptions {
  store: AdminInquiryStore
  requireAuth: RequestHandler
}

const DAY_MS = 24 * 60 * 60 * 1000

/** UTC midnight of a `YYYY-MM-DD` calendar date. */
const startOfDay = (date: string) => new Date(`${date}T00:00:00.000Z`)

/** Read-only admin view of every inquiry, for settling disputes (KAN-15). */
export function createAdminInquiryRouter({
  store,
  requireAuth,
}: AdminInquiryRouterOptions): Router {
  const router = Router()

  // On the whole router, so a route added here later cannot forget them.
  router.use(requireAuth, requireRole('ADMIN'))

  router.get('/', async (req, res, next) => {
    try {
      const parsed = adminInquiryQuerySchema.safeParse(req.query)
      if (!parsed.success) {
        sendValidationError(res, parsed.error, 'INVALID_QUERY')
        return
      }
      const { clientQuery, status, from, to, page } = parsed.data
      const { inquiries, total } = await store.listInquiries({
        clientQuery,
        status,
        createdFrom: from ? startOfDay(from) : undefined,
        // `to` is inclusive: everything before the next day's midnight.
        createdBefore: to ? new Date(startOfDay(to).getTime() + DAY_MS) : undefined,
        skip: (page - 1) * ADMIN_INQUIRY_PAGE_SIZE,
        take: ADMIN_INQUIRY_PAGE_SIZE,
      })
      res.json({
        inquiries,
        page,
        pageSize: ADMIN_INQUIRY_PAGE_SIZE,
        total,
      } satisfies AdminInquiryListResponse)
    } catch (error) {
      next(error)
    }
  })

  router.get('/:id', async (req, res, next) => {
    try {
      const { id } = req.params
      // A malformed id cannot exist, and passing it on would make Postgres reject the uuid cast.
      const inquiry = z.string().uuid().safeParse(id).success ? await store.findInquiry(id) : null
      if (!inquiry) {
        sendError(res, 404, 'Inquiry not found', 'INQUIRY_NOT_FOUND')
        return
      }
      res.json({ inquiry } satisfies AdminInquiryDetailResponse)
    } catch (error) {
      next(error)
    }
  })

  return router
}
