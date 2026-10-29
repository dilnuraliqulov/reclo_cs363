import { describe, expect, it, vi } from 'vitest'
import { bootstrapAdmin, type BootstrapDeps } from './bootstrap'

function deps(existing: string[] = []) {
  const inserted: { email: string; passwordHash: string }[] = []
  const insertAdmin = vi.fn<BootstrapDeps['insertAdmin']>(async (input) => {
    inserted.push(input)
  })
  return {
    inserted,
    insertAdmin,
    deps: { emailExists: async (email: string) => existing.includes(email), insertAdmin },
  }
}

describe('bootstrapAdmin', () => {
  it('creates an admin with a normalized email and a hashed password', async () => {
    const ctx = deps()

    const result = await bootstrapAdmin(
      { ADMIN_EMAIL: ' Admin@Example.com ', ADMIN_PASSWORD: 'long-enough' },
      ctx.deps,
    )

    expect(result).toEqual({ ok: true, email: 'admin@example.com' })
    expect(ctx.inserted).toHaveLength(1)
    expect(ctx.inserted[0]!.passwordHash).toMatch(/^\$argon2id\$/)
  })

  it('refuses an email that is already registered and writes nothing', async () => {
    const ctx = deps(['admin@example.com'])

    const result = await bootstrapAdmin(
      { ADMIN_EMAIL: 'admin@example.com', ADMIN_PASSWORD: 'long-enough' },
      ctx.deps,
    )

    expect(result).toEqual({ ok: false, reason: 'email-exists', email: 'admin@example.com' })
    expect(ctx.insertAdmin).not.toHaveBeenCalled()
  })

  it.each([
    [{}],
    [{ ADMIN_EMAIL: 'admin@example.com' }],
    [{ ADMIN_EMAIL: 'not-an-email', ADMIN_PASSWORD: 'long-enough' }],
    [{ ADMIN_EMAIL: 'admin@example.com', ADMIN_PASSWORD: 'short' }],
  ])('rejects missing or invalid input %j', async (env) => {
    const ctx = deps()

    const result = await bootstrapAdmin(env, ctx.deps)

    expect(result).toMatchObject({ ok: false, reason: 'invalid-input' })
    expect(ctx.insertAdmin).not.toHaveBeenCalled()
  })
})
