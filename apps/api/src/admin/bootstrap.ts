import { emailSchema, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@reclo/shared'
import argon2 from 'argon2'
import { z } from 'zod'

const bootstrapInputSchema = z.object({
  ADMIN_EMAIL: emailSchema,
  ADMIN_PASSWORD: z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH),
})

export interface BootstrapDeps {
  emailExists: (email: string) => Promise<boolean>
  insertAdmin: (input: { email: string; passwordHash: string }) => Promise<void>
}

export type BootstrapResult =
  | { ok: true; email: string }
  | { ok: false; reason: 'invalid-input'; details: string }
  | { ok: false; reason: 'email-exists'; email: string }

/**
 * Creates the first ADMIN from environment variables. It never touches an existing row: re-running
 * it must not reset a live admin's password or promote a client (docs/vendor-accounts-design.md).
 */
export async function bootstrapAdmin(
  env: Record<string, string | undefined>,
  deps: BootstrapDeps,
): Promise<BootstrapResult> {
  const parsed = bootstrapInputSchema.safeParse(env)
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ')
    return { ok: false, reason: 'invalid-input', details }
  }
  const { ADMIN_EMAIL: email, ADMIN_PASSWORD: password } = parsed.data
  if (await deps.emailExists(email)) return { ok: false, reason: 'email-exists', email }
  await deps.insertAdmin({ email, passwordHash: await argon2.hash(password) })
  return { ok: true, email }
}
