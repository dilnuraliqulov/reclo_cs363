import type { ApiError, PublicUser, Role } from '@reclo/shared'
import type { NextFunction, Request, RequestHandler, Response } from 'express'
import { SESSION_COOKIE, hashSessionToken } from './session'
import type { AuthStore } from './store'

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- the supported way to extend Express's Request
  namespace Express {
    interface Request {
      /** Set by `requireAuth`. */
      user?: PublicUser
    }
  }
}

export function sessionToken(req: Request): string | undefined {
  const token: unknown = req.cookies?.[SESSION_COOKIE]
  return typeof token === 'string' && token.length > 0 ? token : undefined
}

/** Responds 401 unless the request carries a valid, unexpired session cookie. */
export function createRequireAuth(
  store: AuthStore,
  now: () => Date = () => new Date(),
): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const token = sessionToken(req)
      if (token) {
        const tokenHash = hashSessionToken(token)
        const session = await store.findSessionByTokenHash(tokenHash)
        if (session && session.expiresAt > now()) {
          req.user = session.user
          next()
          return
        }
        if (session) await store.deleteSessionByTokenHash(tokenHash)
      }
      res
        .status(401)
        .json({ error: 'Not authenticated', code: 'NOT_AUTHENTICATED' } satisfies ApiError)
    } catch (error) {
      next(error)
    }
  }
}

/** Use after `requireAuth`. Responds 403 when the role of the signed-in user is not in `roles`. */
export function requireRole(...roles: Role[]): RequestHandler {
  return (req, res, next) => {
    if (!req.user) {
      res
        .status(401)
        .json({ error: 'Not authenticated', code: 'NOT_AUTHENTICATED' } satisfies ApiError)
      return
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Forbidden', code: 'FORBIDDEN' } satisfies ApiError)
      return
    }
    next()
  }
}
