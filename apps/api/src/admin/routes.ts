import {
  createVendorRequestSchema,
  VALIDATION_CODES,
  type ApiError,
  type CreateVendorResponse,
  type VendorListResponse,
} from '@reclo/shared'
import argon2 from 'argon2'
import { Router, type RequestHandler } from 'express'
import { requireRole } from '../auth/middleware'
import { validationError } from '../auth/routes'
import { EmailTakenError, type AuthStore } from '../auth/store'

export interface AdminRouterOptions {
  store: AuthStore
  requireAuth: RequestHandler
}

/**
 * The vendor list is a guard, not a page: an OOH marketplace in one country has tens of vendors.
 * Paginate the way inquiry history does if that stops being true (docs/vendor-accounts-design.md).
 */
export const VENDOR_LIST_LIMIT = 200

export function createAdminRouter({ store, requireAuth }: AdminRouterOptions): Router {
  const router = Router()

  // On the whole router, so a route added here later cannot forget them.
  router.use(requireAuth, requireRole('ADMIN'))

  router.post('/vendors', async (req, res, next) => {
    try {
      const parsed = createVendorRequestSchema.safeParse(req.body)
      if (!parsed.success) {
        res.status(400).json(validationError(parsed.error))
        return
      }
      const { email, companyName, password } = parsed.data
      const passwordHash = await argon2.hash(password)
      try {
        // The role is fixed here, never read from the body. No session is started: the admin stays
        // signed in as themselves, and the vendor signs in later with the password they were given.
        const vendor = await store.createVendor({
          email,
          passwordHash,
          companyName,
          createdById: req.user!.id,
        })
        res.status(201).json({ vendor } satisfies CreateVendorResponse)
      } catch (error) {
        if (error instanceof EmailTakenError) {
          // A client with this email is not promoted: changing a role is a separate decision.
          res.status(409).json({
            error: error.message,
            code: 'EMAIL_TAKEN',
            fieldErrors: { email: [VALIDATION_CODES.emailTaken] },
          } satisfies ApiError)
          return
        }
        throw error
      }
    } catch (error) {
      next(error)
    }
  })

  router.get('/vendors', async (_req, res, next) => {
    try {
      const vendors = await store.listVendors(VENDOR_LIST_LIMIT)
      res.json({ vendors } satisfies VendorListResponse)
    } catch (error) {
      next(error)
    }
  })

  return router
}
