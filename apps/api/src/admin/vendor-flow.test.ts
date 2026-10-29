import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createApp } from '../app'
import { SESSION_COOKIE } from '../auth/session'
import { createMemoryAuthStore } from '../test-helpers'

// The whole KAN-13 rule end to end, through the public routes only: the one way to get a VENDOR is
// an admin creating it, and the account that results is an ordinary vendor with no admin reach.

function sessionCookie(response: request.Response): string {
  const header = response.headers['set-cookie'] as unknown as string[] | undefined
  const cookie = header?.find((value) => value.startsWith(`${SESSION_COOKIE}=`))
  if (!cookie) throw new Error('no session cookie in response')
  return cookie.split(';')[0]!
}

function setup() {
  const memory = createMemoryAuthStore()
  const app = createApp({ checkDatabase: async () => {}, authStore: memory.store })
  return { app, ...memory }
}

const vendor = { email: 'sales@reklama.uz', companyName: 'Reklama Plus', password: 'vendor-pass' }

// Each test hashes or verifies argon2id up to five times; under a parallel test run that can pass
// the 5 s default on a slow machine without anything being wrong.
describe('vendor accounts end to end', { timeout: 30_000 }, () => {
  it('public sign-up cannot produce a vendor, even when asked to', async () => {
    const { app } = setup()

    const response = await request(app)
      .post('/api/auth/register')
      .send({ email: 'sneaky@example.com', password: 'long-enough', role: 'VENDOR' })

    expect(response.body.user.role).toBe('CLIENT')
  })

  it('an admin creates a vendor, who signs in as a vendor and cannot reach admin routes', async () => {
    const { app, setRole } = setup()
    const adminSession = await request(app)
      .post('/api/auth/register')
      .send({ email: 'admin@example.com', password: 'admin-pass' })
    setRole('admin@example.com', 'ADMIN')
    const adminCookie = sessionCookie(adminSession)

    const created = await request(app)
      .post('/api/admin/vendors')
      .set('Cookie', adminCookie)
      .send(vendor)
    expect(created.status).toBe(201)

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: vendor.email, password: vendor.password })
    expect(login.body.user.role).toBe('VENDOR')
    const vendorCookie = sessionCookie(login)

    const me = await request(app).get('/api/auth/me').set('Cookie', vendorCookie)
    expect(me.body.user).toMatchObject({ email: vendor.email, role: 'VENDOR' })

    // A vendor cannot mint further vendors or see the list.
    const mint = await request(app)
      .post('/api/admin/vendors')
      .set('Cookie', vendorCookie)
      .send({ ...vendor, email: 'friend@reklama.uz' })
    expect(mint.status).toBe(403)
    expect((await request(app).get('/api/admin/vendors').set('Cookie', vendorCookie)).status).toBe(
      403,
    )
  })

  it('a vendor email cannot then be claimed through public sign-up', async () => {
    const { app, setRole } = setup()
    const adminSession = await request(app)
      .post('/api/auth/register')
      .send({ email: 'admin@example.com', password: 'admin-pass' })
    setRole('admin@example.com', 'ADMIN')
    await request(app)
      .post('/api/admin/vendors')
      .set('Cookie', sessionCookie(adminSession))
      .send(vendor)

    const response = await request(app)
      .post('/api/auth/register')
      .send({ email: vendor.email, password: 'another-pass' })

    expect(response.status).toBe(409)
  })

  it('the wrong password for a vendor gets the same answer as an unknown email', async () => {
    const { app, setRole } = setup()
    const adminSession = await request(app)
      .post('/api/auth/register')
      .send({ email: 'admin@example.com', password: 'admin-pass' })
    setRole('admin@example.com', 'ADMIN')
    await request(app)
      .post('/api/admin/vendors')
      .set('Cookie', sessionCookie(adminSession))
      .send(vendor)

    const wrong = await request(app)
      .post('/api/auth/login')
      .send({ email: vendor.email, password: 'not-it-at-all' })
    const unknown = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'not-it-at-all' })

    expect(wrong.status).toBe(401)
    expect(wrong.body).toEqual(unknown.body)
  })
})
