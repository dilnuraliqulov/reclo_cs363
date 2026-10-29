import {
  VALIDATION_CODES,
  createVendorResponseSchema,
  vendorListResponseSchema,
} from '@reclo/shared'
import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../app'
import { SESSION_COOKIE } from '../auth/session'
import { createMemoryAuthStore } from '../test-helpers'

const admin = { email: 'admin@example.com', password: 'admin-password' }
const vendor = {
  email: 'sales@reklama.uz',
  companyName: 'Reklama Plus',
  password: 'vendor-password',
}

function sessionCookie(response: request.Response): string {
  const header = response.headers['set-cookie'] as unknown as string[] | undefined
  const cookie = header?.find((value) => value.startsWith(`${SESSION_COOKIE}=`))
  if (!cookie) throw new Error('no session cookie in response')
  return cookie.split(';')[0]!
}

/** An app with one signed-in user of the given role; returns that user's cookie. */
async function setup(role: 'ADMIN' | 'VENDOR' | 'CLIENT' = 'ADMIN') {
  const memory = createMemoryAuthStore()
  const app = createApp({ checkDatabase: async () => {}, authStore: memory.store })
  const registered = await request(app).post('/api/auth/register').send(admin)
  memory.setRole(admin.email, role)
  return { app, cookie: sessionCookie(registered), ...memory }
}

describe('POST /api/admin/vendors', () => {
  it('creates a VENDOR attributed to the admin and returns it without secrets', async () => {
    const { app, cookie, users } = await setup()

    const response = await request(app)
      .post('/api/admin/vendors')
      .set('Cookie', cookie)
      .send(vendor)

    expect(response.status).toBe(201)
    const { vendor: created } = createVendorResponseSchema.parse(response.body)
    expect(created).toMatchObject({ email: vendor.email, companyName: vendor.companyName })
    expect(JSON.stringify(response.body)).not.toContain('assword')

    const row = users.find((user) => user.email === vendor.email)!
    expect(row.role).toBe('VENDOR')
    expect(row.createdById).toBe(users.find((user) => user.email === admin.email)!.id)
    expect(row.passwordHash).toMatch(/^\$argon2id\$/)
  })

  it('does not start a session for the vendor or replace the admin session', async () => {
    const { app, cookie } = await setup()

    const response = await request(app)
      .post('/api/admin/vendors')
      .set('Cookie', cookie)
      .send(vendor)

    expect(response.headers['set-cookie']).toBeUndefined()
    const me = await request(app).get('/api/auth/me').set('Cookie', cookie)
    expect(me.body.user.email).toBe(admin.email)
  })

  it('lets the new vendor sign in with the password the admin chose', async () => {
    const { app, cookie } = await setup()
    await request(app).post('/api/admin/vendors').set('Cookie', cookie).send(vendor)

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: vendor.email, password: vendor.password })

    expect(login.status).toBe(200)
    expect(login.body.user).toMatchObject({ email: vendor.email, role: 'VENDOR' })
  })

  it('ignores a role in the body', async () => {
    const { app, cookie, users } = await setup()

    await request(app)
      .post('/api/admin/vendors')
      .set('Cookie', cookie)
      .send({ ...vendor, role: 'ADMIN' })

    expect(users.find((user) => user.email === vendor.email)!.role).toBe('VENDOR')
  })

  it('normalizes the email and trims the company name', async () => {
    const { app, cookie } = await setup()

    const response = await request(app)
      .post('/api/admin/vendors')
      .set('Cookie', cookie)
      .send({ ...vendor, email: '  Sales@Reklama.UZ ', companyName: '  Reklama Plus ' })

    expect(response.body.vendor).toMatchObject({
      email: 'sales@reklama.uz',
      companyName: 'Reklama Plus',
    })
  })

  it('returns 409 with a field error for an email that is already registered', async () => {
    const { app, cookie, users } = await setup()

    const response = await request(app)
      .post('/api/admin/vendors')
      .set('Cookie', cookie)
      .send({ ...vendor, email: admin.email })

    expect(response.status).toBe(409)
    expect(response.body).toMatchObject({
      code: 'EMAIL_TAKEN',
      fieldErrors: { email: [VALIDATION_CODES.emailTaken] },
    })
    // The existing account is untouched, not promoted.
    expect(users.find((user) => user.email === admin.email)!.role).toBe('ADMIN')
  })

  it('returns 400 with a code per invalid field', async () => {
    const { app, cookie } = await setup()

    const response = await request(app)
      .post('/api/admin/vendors')
      .set('Cookie', cookie)
      .send({ email: 'not-an-email', companyName: '   ', password: 'short' })

    expect(response.status).toBe(400)
    expect(response.body).toMatchObject({
      code: 'INVALID_INPUT',
      fieldErrors: {
        email: [VALIDATION_CODES.emailInvalid],
        companyName: [VALIDATION_CODES.companyNameRequired],
        password: [VALIDATION_CODES.passwordTooShort],
      },
    })
  })

  it.each(['CLIENT', 'VENDOR'] as const)('returns 403 for a %s', async (role) => {
    const { app, cookie, users } = await setup(role)

    const response = await request(app)
      .post('/api/admin/vendors')
      .set('Cookie', cookie)
      .send(vendor)

    expect(response.status).toBe(403)
    expect(response.body.code).toBe('FORBIDDEN')
    expect(users.some((user) => user.email === vendor.email)).toBe(false)
  })

  it('returns 401 when signed out', async () => {
    const { app } = await setup()

    const response = await request(app).post('/api/admin/vendors').send(vendor)

    expect(response.status).toBe(401)
    expect(response.body.code).toBe('NOT_AUTHENTICATED')
  })

  it('answers 500 without leaking details when the store fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { app, cookie, store } = await setup()
    store.createVendor = async () => {
      throw new Error('db exploded: secret detail')
    }

    const response = await request(app)
      .post('/api/admin/vendors')
      .set('Cookie', cookie)
      .send(vendor)

    expect(response.status).toBe(500)
    expect(JSON.stringify(response.body)).not.toContain('secret detail')
  })
})

describe('GET /api/admin/vendors', () => {
  it('lists vendors newest first and leaves out clients and admins', async () => {
    const { app, cookie } = await setup()
    await request(app)
      .post('/api/auth/register')
      .send({ email: 'c@example.com', password: 'x'.repeat(8) })
    await request(app).post('/api/admin/vendors').set('Cookie', cookie).send(vendor)
    await request(app)
      .post('/api/admin/vendors')
      .set('Cookie', cookie)
      .send({ ...vendor, email: 'info@led.uz', companyName: 'LED Media' })

    const response = await request(app).get('/api/admin/vendors').set('Cookie', cookie)

    expect(response.status).toBe(200)
    const { vendors } = vendorListResponseSchema.parse(response.body)
    expect(vendors.map((row) => row.companyName)).toEqual(['LED Media', 'Reklama Plus'])
  })

  it('returns an empty list when there are no vendors', async () => {
    const { app, cookie } = await setup()

    const response = await request(app).get('/api/admin/vendors').set('Cookie', cookie)

    expect(response.body).toEqual({ vendors: [] })
  })

  it.each(['CLIENT', 'VENDOR'] as const)('returns 403 for a %s', async (role) => {
    const { app, cookie } = await setup(role)

    expect((await request(app).get('/api/admin/vendors').set('Cookie', cookie)).status).toBe(403)
  })

  it('returns 401 when signed out', async () => {
    const { app } = await setup()

    expect((await request(app).get('/api/admin/vendors')).status).toBe(401)
  })
})
