import {
  loginRequestSchema,
  registerRequestSchema,
  VALIDATION_CODES,
  type ApiError,
  type AuthResponse,
  type PublicUser,
} from '@reclo/shared'
import argon2 from 'argon2'
import { Router, type CookieOptions, type RequestHandler, type Response } from 'express'
import { rateLimit } from 'express-rate-limit'
import { z } from 'zod'
import { sessionToken } from './middleware'
import { SESSION_COOKIE, SESSION_TTL_MS, generateSessionToken, hashSessionToken } from './session'
import { EmailTakenError, type AuthStore } from './store'

export interface AuthRouterOptions {
  store: AuthStore
  requireAuth: RequestHandler
  now: () => Date
  /** Max register + login requests per IP per 15 minutes. */
  rateLimitMax: number
  secureCookies: boolean
}

const INVALID_CREDENTIALS = 'Invalid email or password'

// Verified against when the email is unknown, so both login failures cost about the same time.
const dummyHash = argon2.hash('reclo-timing-equalizer')

export function validationError(error: z.ZodError): ApiError {
  return {
    error: 'Invalid input',
    code: 'INVALID_INPUT',
    // Already codes, not sentences: these schemas are parsed by the web form too.
    fieldErrors: z.flattenError(error).fieldErrors,
  }
}

export function createAuthRouter({
  store,
  requireAuth,
  now,
  rateLimitMax,
  secureCookies,
}: AuthRouterOptions): Router {
  const router = Router()

  const cookieOptions: CookieOptions = {
    httpOnly: true,
    sameSite: 'lax',
    secure: secureCookies,
    path: '/',
  }

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

  async function startSession(res: Response, user: PublicUser): Promise<void> {
    const token = generateSessionToken()
    const expiresAt = new Date(now().getTime() + SESSION_TTL_MS)
    await store.createSession({ userId: user.id, tokenHash: hashSessionToken(token), expiresAt })
    res.cookie(SESSION_COOKIE, token, { ...cookieOptions, expires: expiresAt })
  }

  router.post('/register', limiter, async (req, res, next) => {
    try {
      const parsed = registerRequestSchema.safeParse(req.body)
      if (!parsed.success) {
        res.status(400).json(validationError(parsed.error))
        return
      }
      const { email, password } = parsed.data
      const passwordHash = await argon2.hash(password)
      let user: PublicUser
      try {
        user = await store.createClient({ email, passwordHash })
      } catch (error) {
        if (error instanceof EmailTakenError) {
          res.status(409).json({
            error: error.message,
            code: 'EMAIL_TAKEN',
            fieldErrors: { email: [VALIDATION_CODES.emailTaken] },
          } satisfies ApiError)
          return
        }
        throw error
      }
      await startSession(res, user)
      res.status(201).json({ user } satisfies AuthResponse)
    } catch (error) {
      next(error)
    }
  })

  router.post('/login', limiter, async (req, res, next) => {
    try {
      const parsed = loginRequestSchema.safeParse(req.body)
      if (!parsed.success) {
        res.status(400).json(validationError(parsed.error))
        return
      }
      const { email, password } = parsed.data
      const found = await store.findUserByEmail(email)
      const passwordOk = await argon2.verify(found?.passwordHash ?? (await dummyHash), password)
      if (!found || !passwordOk) {
        res
          .status(401)
          .json({ error: INVALID_CREDENTIALS, code: 'INVALID_CREDENTIALS' } satisfies ApiError)
        return
      }
      const user: PublicUser = { id: found.id, email: found.email, role: found.role }
      await startSession(res, user)
      res.json({ user } satisfies AuthResponse)
    } catch (error) {
      next(error)
    }
  })

  router.post('/logout', async (req, res, next) => {
    try {
      const token = sessionToken(req)
      if (token) await store.deleteSessionByTokenHash(hashSessionToken(token))
      res.clearCookie(SESSION_COOKIE, cookieOptions)
      res.status(204).end()
    } catch (error) {
      next(error)
    }
  })

  router.get('/me', requireAuth, (req, res) => {
    res.json({ user: req.user! } satisfies AuthResponse)
  })

  return router
}
