import { Router } from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../app'
import { createMemoryAuthStore } from '../test-helpers'
import { createRequireAuth, requireRole } from './middleware'
import { SESSION_COOKIE, SESSION_TTL_MS, hashSessionToken } from './session'

const credentials = { email: 'user@example.com', password: 'correct-horse' }

function setup(options: { now?: () => Date; authRateLimitMax?: number } = {}) {
  const memory = createMemoryAuthStore()
  const app = createApp({
    checkDatabase: async () => {},
    authStore: memory.store,
    ...options,
  })
  return { app, ...memory }
}

/** Value of the session cookie set by a response, e.g. "reclo_session=abc". */
function sessionCookie(response: request.Response): string {
  const header = response.headers['set-cookie'] as unknown as string[] | undefined
  const cookie = header?.find((value) => value.startsWith(`${SESSION_COOKIE}=`))
  if (!cookie) throw new Error('no session cookie in response')
  return cookie.split(';')[0]!
}

describe('POST /api/auth/register', () => {
  it('creates a CLIENT, returns it without secrets and signs the user in', async () => {
    const { app, users, sessions } = setup()

    const response = await request(app).post('/api/auth/register').send(credentials)

    expect(response.status).toBe(201)
    expect(response.body).toEqual({
      user: { id: expect.any(String), email: 'user@example.com', role: 'CLIENT' },
    })
    expect(JSON.stringify(response.body)).not.toContain('assword')
    expect(users).toHaveLength(1)
    expect(users[0]!.passwordHash).toMatch(/^\$argon2id\$/)
    expect(users[0]!.passwordHash).not.toContain(credentials.password)

    const cookie = response.headers['set-cookie']![0]!
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Lax')
    expect(cookie).toContain('Path=/')
    // Only the SHA-256 hash of the token is stored, never the token itself.
    const token = sessionCookie(response).split('=')[1]!
    expect([...sessions.keys()]).toEqual([hashSessionToken(token)])
    expect(sessions.has(token)).toBe(false)
  })

  it('normalizes the email (trim + lowercase)', async () => {
    const { app } = setup()

    const response = await request(app)
      .post('/api/auth/register')
      .send({ email: '  User@Example.COM ', password: credentials.password })

    expect(response.status).toBe(201)
    expect(response.body.user.email).toBe('user@example.com')
  })

  it('rejects a duplicate email, even with different casing', async () => {
    const { app } = setup()
    await request(app).post('/api/auth/register').send(credentials)

    const response = await request(app)
      .post('/api/auth/register')
      .send({ email: 'USER@example.com', password: 'another-password' })

    expect(response.status).toBe(409)
    expect(response.body.error).toBe('Email is already registered')
    expect(response.headers['set-cookie']).toBeUndefined()
  })

  it('rejects a password shorter than 8 characters', async () => {
    const { app, users } = setup()

    const response = await request(app)
      .post('/api/auth/register')
      .send({ email: 'user@example.com', password: 'short' })

    expect(response.status).toBe(400)
    expect(response.body.fieldErrors.password[0]).toMatch(/at least 8/)
    expect(users).toHaveLength(0)
  })

  it('rejects an invalid email', async () => {
    const { app } = setup()

    const response = await request(app)
      .post('/api/auth/register')
      .send({ email: 'not-an-email', password: credentials.password })

    expect(response.status).toBe(400)
    expect(response.body.fieldErrors.email).toHaveLength(1)
  })

  it.each(['ADMIN', 'VENDOR'])('ignores role=%s in the request body', async (role) => {
    const { app, users } = setup()

    const response = await request(app)
      .post('/api/auth/register')
      .send({ ...credentials, role })

    expect(response.status).toBe(201)
    expect(response.body.user.role).toBe('CLIENT')
    expect(users[0]!.role).toBe('CLIENT')
  })

  it('answers malformed JSON with 400', async () => {
    const { app } = setup()

    const response = await request(app)
      .post('/api/auth/register')
      .set('Content-Type', 'application/json')
      .send('{"email":')

    expect(response.status).toBe(400)
  })
})

describe('POST /api/auth/login', () => {
  let ctx: ReturnType<typeof setup>

  beforeEach(async () => {
    ctx = setup()
    await request(ctx.app).post('/api/auth/register').send(credentials)
  })

  it('signs in with the right password and sets a session cookie', async () => {
    const response = await request(ctx.app)
      .post('/api/auth/login')
      .send({ email: 'USER@example.com ', password: credentials.password })

    expect(response.status).toBe(200)
    expect(response.body.user).toMatchObject({ email: 'user@example.com', role: 'CLIENT' })
    expect(response.headers['set-cookie']![0]).toContain('HttpOnly')
    expect(ctx.sessions.size).toBe(2) // one from register, one from login
  })

  it('gives the same 401 response for a wrong password and an unknown email', async () => {
    const wrongPassword = await request(ctx.app)
      .post('/api/auth/login')
      .send({ email: credentials.email, password: 'wrong-password' })
    const unknownEmail = await request(ctx.app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'wrong-password' })

    expect(wrongPassword.status).toBe(401)
    expect(unknownEmail.status).toBe(401)
    expect(wrongPassword.body).toEqual({ error: 'Invalid email or password' })
    expect(unknownEmail.body).toEqual(wrongPassword.body)
    expect(wrongPassword.headers['set-cookie']).toBeUndefined()
    expect(unknownEmail.headers['set-cookie']).toBeUndefined()
  })

  it('rejects a missing password with 400', async () => {
    const response = await request(ctx.app)
      .post('/api/auth/login')
      .send({ email: credentials.email })

    expect(response.status).toBe(400)
  })
})

describe('GET /api/auth/me', () => {
  it('returns the user for a valid session cookie', async () => {
    const { app } = setup()
    const registered = await request(app).post('/api/auth/register').send(credentials)

    const response = await request(app).get('/api/auth/me').set('Cookie', sessionCookie(registered))

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ user: registered.body.user })
  })

  it('returns 401 without a cookie', async () => {
    const { app } = setup()

    const response = await request(app).get('/api/auth/me')

    expect(response.status).toBe(401)
    expect(response.body).toEqual({ error: 'Not authenticated' })
  })

  it('returns 401 for an unknown token', async () => {
    const { app } = setup()

    const response = await request(app)
      .get('/api/auth/me')
      .set('Cookie', `${SESSION_COOKIE}=made-up-token`)

    expect(response.status).toBe(401)
  })

  it('rejects an expired session and deletes it', async () => {
    let currentTime = new Date('2026-01-01T00:00:00Z')
    const { app, sessions } = setup({ now: () => currentTime })
    const registered = await request(app).post('/api/auth/register').send(credentials)
    const cookie = sessionCookie(registered)

    currentTime = new Date(currentTime.getTime() + SESSION_TTL_MS - 1000)
    expect((await request(app).get('/api/auth/me').set('Cookie', cookie)).status).toBe(200)

    currentTime = new Date(currentTime.getTime() + 2000)
    const expired = await request(app).get('/api/auth/me').set('Cookie', cookie)

    expect(expired.status).toBe(401)
    expect(sessions.size).toBe(0)
  })
})

describe('POST /api/auth/logout', () => {
  it('invalidates the session and clears the cookie', async () => {
    const { app, sessions } = setup()
    const registered = await request(app).post('/api/auth/register').send(credentials)
    const cookie = sessionCookie(registered)

    const logout = await request(app).post('/api/auth/logout').set('Cookie', cookie)

    expect(logout.status).toBe(204)
    expect(logout.headers['set-cookie']![0]).toMatch(/reclo_session=;/)
    expect(sessions.size).toBe(0)
    // The old cookie no longer works even if the client keeps sending it.
    const me = await request(app).get('/api/auth/me').set('Cookie', cookie)
    expect(me.status).toBe(401)
  })

  it('succeeds when not signed in', async () => {
    const { app } = setup()

    const response = await request(app).post('/api/auth/logout')

    expect(response.status).toBe(204)
  })
})

describe('rate limiting', () => {
  it('answers 429 once the limit for login/register is exceeded', async () => {
    const { app } = setup({ authRateLimitMax: 2 })
    const attempt = () =>
      request(app).post('/api/auth/login').send({ email: 'a@example.com', password: 'x' })

    expect((await attempt()).status).toBe(401)
    expect((await attempt()).status).toBe(401)
    const limited = await attempt()

    expect(limited.status).toBe(429)
    expect(limited.body.error).toMatch(/too many/i)
  })
})

describe('requireRole', () => {
  function appWithAdminRoute() {
    const ctx = setup()
    const router = Router()
    const requireAuth = createRequireAuth(ctx.store)
    router.get('/admin-only', requireAuth, requireRole('ADMIN'), (_req, res) => {
      res.json({ ok: true })
    })
    // Mounted on the same express app: createApp exposes no extension point, so build a sibling.
    return { ...ctx, router, requireAuth }
  }

  it('returns 401 without a session, 403 for a CLIENT and 200 for an ADMIN', async () => {
    const { app, setRole, router } = appWithAdminRoute()
    app.use('/test', router)
    const registered = await request(app).post('/api/auth/register').send(credentials)
    const cookie = sessionCookie(registered)

    expect((await request(app).get('/test/admin-only')).status).toBe(401)

    const forbidden = await request(app).get('/test/admin-only').set('Cookie', cookie)
    expect(forbidden.status).toBe(403)
    expect(forbidden.body).toEqual({ error: 'Forbidden' })

    setRole(credentials.email, 'ADMIN')
    const allowed = await request(app).get('/test/admin-only').set('Cookie', cookie)
    expect(allowed.status).toBe(200)
  })
})

describe('unexpected errors', () => {
  it('answers 500 without leaking details when the store fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { app, store } = setup()
    store.findUserByEmail = async () => {
      throw new Error('db exploded: secret detail')
    }

    const response = await request(app).post('/api/auth/login').send(credentials)

    expect(response.status).toBe(500)
    expect(JSON.stringify(response.body)).not.toContain('secret detail')
  })
})
