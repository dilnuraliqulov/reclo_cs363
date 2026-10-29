import {
  createPlacementRequestSchema,
  LISTING_LIMITS,
  updatePlacementRequestSchema,
  VALIDATION_CODES,
  vendorPlacementListQuerySchema,
  type ApiError,
  type ErrorCode,
  type VendorPlacementListResponse,
  type VendorPlacementResponse,
} from '@reclo/shared'
import { Router, type RequestHandler, type Response } from 'express'
import { rateLimit } from 'express-rate-limit'
import multer from 'multer'
import { z } from 'zod'
import { requireRole } from '../auth/middleware'
import { PHOTO_FILE_PATTERN, photoPath, sniffImageType, type PhotoStorage } from './photo-storage'
import type { MutationResult, VendorPlacementStore } from './vendor-store'

export interface VendorPlacementRouterOptions {
  store: VendorPlacementStore
  /** Without it the photo routes are not mounted. */
  photos?: PhotoStorage
  requireAuth: RequestHandler
  /** Max mutating requests per IP per 15 minutes. */
  rateLimitMax: number
}

/** One ApiError per failure, so every response carries a `code` (docs/i18n-design.md). */
function send(res: Response, status: number, error: string, code: ErrorCode): void {
  res.status(status).json({ error, code } satisfies ApiError)
}

const notFound = (res: Response) => send(res, 404, 'Placement not found', 'PLACEMENT_NOT_FOUND')

function sendValidationError(res: Response, error: z.ZodError): void {
  const { fieldErrors, formErrors } = z.flattenError(error)
  res.status(400).json({
    error: 'Invalid input',
    code: 'INVALID_INPUT',
    // Already codes, not sentences: these schemas are parsed by the web form too. Errors that
    // belong to no single field (an empty PATCH) travel under `_form`.
    fieldErrors: formErrors.length > 0 ? { ...fieldErrors, _form: formErrors } : fieldErrors,
  } satisfies ApiError)
}

const ARCHIVED_MESSAGE = 'Archived listings cannot be changed; restore the listing first'

/** The English `error` for a 409. It names the status the listing is in. */
const CONFLICT_MESSAGES = {
  edit: (status: string) =>
    status === 'ARCHIVED'
      ? ARCHIVED_MESSAGE
      : `The listing changed while saving (it is ${status}); try again`,
  archive: () => 'The listing is already archived',
  restore: (status: string) => `Only an archived listing can be restored (it is ${status})`,
  pause: (status: string) => `Only an active listing can be paused (it is ${status})`,
  resume: (status: string) => `Only an inactive listing can be resumed (it is ${status})`,
} as const

function sendMutation(
  res: Response,
  result: MutationResult,
  conflict: (typeof CONFLICT_MESSAGES)[keyof typeof CONFLICT_MESSAGES],
  successStatus = 200,
): void {
  switch (result.kind) {
    case 'ok':
      res
        .status(successStatus)
        .json({ placement: result.placement } satisfies VendorPlacementResponse)
      return
    case 'not_found':
      notFound(res)
      return
    case 'led_not_allowed':
      res.status(400).json({
        error: 'Invalid input',
        code: 'INVALID_INPUT',
        fieldErrors: { type: [VALIDATION_CODES.ledTypeOnly] },
      } satisfies ApiError)
      return
    case 'conflict':
      send(res, 409, conflict(result.status), 'LISTING_STATE_INVALID')
      return
  }
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: LISTING_LIMITS.maxPhotoBytes, files: 1 },
}).single('photo')

async function removeQuietly(photos: PhotoStorage, stored: string): Promise<void> {
  try {
    await photos.remove(stored)
  } catch (error) {
    // The listing no longer points at the file, so a leftover costs disk, not correctness.
    console.error('Failed to delete a listing photo', stored, error)
  }
}

export function createVendorPlacementRouter({
  store,
  photos,
  requireAuth,
  rateLimitMax,
}: VendorPlacementRouterOptions): Router {
  const router = Router()

  // One `use`, so a route added later cannot forget the auth and role checks.
  router.use(requireAuth, requireRole('VENDOR'))
  router.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: rateLimitMax,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      skip: (req) => req.method === 'GET',
      message: {
        error: 'Too many attempts, try again later',
        code: 'RATE_LIMITED',
      } satisfies ApiError,
    }),
  )

  // Every `:id` route shares this check. It runs for the `:id` routes only, not for `/`.
  router.param('id', (_req, res, next, id: string) => {
    if (!z.string().uuid().safeParse(id).success) {
      send(res, 400, 'Invalid placement id', 'INVALID_PLACEMENT_ID')
      return
    }
    next()
  })

  /** The signed-in vendor. `requireAuth` ran, so it is set. */
  const vendorId = (res: Response): string => {
    const id = res.req.user?.id
    if (!id) throw new Error('requireAuth did not set req.user')
    return id
  }

  router.post('/', async (req, res) => {
    const parsed = createPlacementRequestSchema.safeParse(req.body)
    if (!parsed.success) {
      sendValidationError(res, parsed.error)
      return
    }
    const placement = await store.create(vendorId(res), parsed.data)
    res.status(201).json({ placement } satisfies VendorPlacementResponse)
  })

  router.get('/', async (req, res) => {
    const parsed = vendorPlacementListQuerySchema.safeParse(req.query)
    if (!parsed.success) {
      sendValidationError(res, parsed.error)
      return
    }
    const result = await store.list(vendorId(res), parsed.data)
    res.json(result satisfies VendorPlacementListResponse)
  })

  router.get('/:id', async (req, res) => {
    const placement = await store.find(vendorId(res), req.params.id)
    if (!placement) {
      notFound(res)
      return
    }
    res.json({ placement } satisfies VendorPlacementResponse)
  })

  router.patch('/:id', async (req, res) => {
    const parsed = updatePlacementRequestSchema.safeParse(req.body)
    if (!parsed.success) {
      sendValidationError(res, parsed.error)
      return
    }
    const result = await store.update(vendorId(res), req.params.id, parsed.data)
    sendMutation(res, result, CONFLICT_MESSAGES.edit)
  })

  router.post('/:id/archive', async (req, res) => {
    sendMutation(res, await store.archive(vendorId(res), req.params.id), CONFLICT_MESSAGES.archive)
  })

  router.post('/:id/restore', async (req, res) => {
    sendMutation(res, await store.restore(vendorId(res), req.params.id), CONFLICT_MESSAGES.restore)
  })

  router.post('/:id/pause', async (req, res) => {
    sendMutation(res, await store.pause(vendorId(res), req.params.id), CONFLICT_MESSAGES.pause)
  })

  router.post('/:id/resume', async (req, res) => {
    sendMutation(res, await store.resume(vendorId(res), req.params.id), CONFLICT_MESSAGES.resume)
  })

  if (photos) {
    router.post('/:id/photos', async (req, res) => {
      const owner = vendorId(res)
      const { id } = req.params

      // Ownership and the cheap state checks come first, so a request that cannot succeed does not
      // make the server read up to 5 MB of body.
      const current = await store.find(owner, id)
      if (!current) {
        notFound(res)
        return
      }
      if (current.status === 'ARCHIVED') {
        send(res, 409, ARCHIVED_MESSAGE, 'LISTING_STATE_INVALID')
        return
      }
      if (current.photos.length >= LISTING_LIMITS.maxPhotos) {
        send(
          res,
          409,
          `A listing can have at most ${LISTING_LIMITS.maxPhotos} photos`,
          'PHOTO_LIMIT',
        )
        return
      }

      const file = await new Promise<Express.Multer.File | undefined | 'too_large' | 'bad_upload'>(
        (resolve) => {
          upload(req, res, (error: unknown) => {
            if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
              resolve('too_large')
            } else if (
              error instanceof multer.MulterError &&
              error.code === 'LIMIT_UNEXPECTED_FILE'
            ) {
              // A file under another field name: as far as this route goes, no photo was sent.
              resolve(undefined)
            } else if (error) {
              resolve('bad_upload')
            } else {
              resolve(req.file)
            }
          })
        },
      )
      if (file === 'too_large') {
        send(res, 413, 'The photo is larger than 5 MB', 'PHOTO_TOO_LARGE')
        return
      }
      if (file === 'bad_upload') {
        send(res, 400, 'Invalid input', 'INVALID_INPUT')
        return
      }
      if (!file) {
        send(res, 400, 'Send the photo in the "photo" field', 'PHOTO_REQUIRED')
        return
      }

      const extension = sniffImageType(file.buffer)
      if (!extension) {
        send(res, 415, 'Photos must be JPEG, PNG or WebP', 'PHOTO_TYPE_INVALID')
        return
      }

      const stored = await photos.save(id, file.buffer, extension)
      const result = await store.addPhoto(owner, id, stored)
      if (result.kind === 'ok') {
        res.status(201).json({ placement: result.placement } satisfies VendorPlacementResponse)
        return
      }

      // Lost a race (archived, or the last slot taken meanwhile): the file has no owner.
      await removeQuietly(photos, stored)
      if (result.kind === 'photo_limit') {
        send(
          res,
          409,
          `A listing can have at most ${LISTING_LIMITS.maxPhotos} photos`,
          'PHOTO_LIMIT',
        )
      } else {
        sendMutation(res, result, CONFLICT_MESSAGES.edit)
      }
    })

    router.delete('/:id/photos/:file', async (req, res) => {
      const { id, file } = req.params
      if (!PHOTO_FILE_PATTERN.test(file)) {
        send(res, 404, 'Photo not found', 'PHOTO_NOT_FOUND')
        return
      }

      const stored = photoPath(id, file)
      const result = await store.removePhoto(vendorId(res), id, stored)
      if (result.kind === 'photo_missing') {
        send(res, 404, 'Photo not found', 'PHOTO_NOT_FOUND')
        return
      }
      if (result.kind === 'ok') await removeQuietly(photos, stored)
      sendMutation(res, result, CONFLICT_MESSAGES.edit)
    })
  }

  return router
}
