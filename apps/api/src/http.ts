import { VALIDATION_CODES, type ApiError, type ErrorCode } from '@reclo/shared'
import type { ErrorRequestHandler, Request, RequestHandler, Response } from 'express'
import { z } from 'zod'

/**
 * Largest JSON body any route accepts. The biggest legitimate one is a 2000-character message or
 * description (about 4 KB even in Cyrillic) plus a handful of short fields.
 */
export const JSON_BODY_LIMIT = '16kb'

/** One ApiError per failure, so every response carries a `code` (docs/i18n-design.md). */
export function sendError(res: Response, status: number, error: string, code: ErrorCode): void {
  res.status(status).json({ error, code } satisfies ApiError)
}

/**
 * The 400 for a body or query that failed its schema. `fieldErrors` holds codes, not sentences:
 * the schemas are parsed by the web form too. Errors that belong to no single field (an empty
 * PATCH, a body that is not an object) travel under `_form`.
 */
export function sendValidationError(
  res: Response,
  error: z.ZodError,
  code: 'INVALID_INPUT' | 'INVALID_QUERY' = 'INVALID_INPUT',
): void {
  const { fieldErrors, formErrors } = z.flattenError(error)
  res.status(400).json({
    error: code === 'INVALID_QUERY' ? 'Invalid query' : 'Invalid input',
    code,
    fieldErrors: formErrors.length > 0 ? { ...fieldErrors, _form: formErrors } : fieldErrors,
  } satisfies ApiError)
}

/** A request that carries a body: Content-Length above zero, or chunked. */
function hasBody(req: Request): boolean {
  const length = req.headers['content-length']
  return (length !== undefined && length !== '0') || req.headers['transfer-encoding'] !== undefined
}

const PHOTO_UPLOAD_PATH = /^\/api\/vendor\/placements\/[^/]+\/photos\/?$/

/**
 * Mounted before the body parser. A body that is not JSON would otherwise be skipped by the parser
 * and reach a route as `undefined`; answer it as the 415 it is. Multipart is accepted only where
 * the photo upload reads it.
 */
export const requireJsonBody: RequestHandler = (req, res, next) => {
  const writes = req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS'
  if (!writes || !hasBody(req) || req.is('json')) {
    next()
    return
  }
  if (req.is('multipart/form-data') && PHOTO_UPLOAD_PATH.test(req.path)) {
    next()
    return
  }
  sendError(res, 415, 'Send the body as application/json', 'UNSUPPORTED_MEDIA_TYPE')
}

/**
 * Postgres text cannot hold U+0000, so one in a string would surface as a 500 from the store.
 * Rejecting it at the door covers every text field, current and future.
 */
export const rejectNulBytes: RequestHandler = (req, res, next) => {
  if (req.body !== undefined && JSON.stringify(req.body).includes('\\u0000')) {
    res.status(400).json({
      error: 'Invalid input',
      code: 'INVALID_INPUT',
      fieldErrors: { _form: [VALIDATION_CODES.invalid] },
    } satisfies ApiError)
    return
  }
  next()
}

/** Unknown routes answer in the standard shape rather than Express's HTML page. */
export const notFoundHandler: RequestHandler = (_req, res) => {
  sendError(res, 404, 'Not found', 'NOT_FOUND')
}

// Express identifies error handlers by their four parameters, so `next` must stay.
export const errorHandler: ErrorRequestHandler = (error, _req, res, next) => {
  if (res.headersSent) {
    next(error)
    return
  }
  // body-parser errors carry an HTTP status and are the client's fault.
  const status: unknown = error?.status ?? error?.statusCode
  if (error?.type === 'entity.parse.failed') {
    sendError(res, 400, 'Malformed JSON', 'MALFORMED_JSON')
  } else if (status === 413) {
    sendError(res, 413, 'Request body is too large', 'PAYLOAD_TOO_LARGE')
  } else if (status === 415) {
    sendError(res, 415, 'Unsupported content type', 'UNSUPPORTED_MEDIA_TYPE')
  } else if (typeof status === 'number' && status >= 400 && status < 500) {
    sendError(res, 400, 'Invalid input', 'INVALID_INPUT')
  } else {
    console.error('Unhandled error', error)
    sendError(res, 500, 'Something went wrong', 'INTERNAL')
  }
}
