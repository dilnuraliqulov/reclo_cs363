import { z } from 'zod'

export const roleSchema = z.enum(['CLIENT', 'VENDOR', 'ADMIN'])
export type Role = z.infer<typeof roleSchema>

export const PASSWORD_MIN_LENGTH = 8
export const PASSWORD_MAX_LENGTH = 128

/** Trimmed and lowercased, so "  Foo@Bar.com " and "foo@bar.com" are the same account. */
export const emailSchema = z.string().trim().toLowerCase().pipe(z.email('Enter a valid email'))

/** Public sign-up. There is deliberately no `role` here: new accounts are always CLIENT. */
export const registerRequestSchema = z.object({
  email: emailSchema,
  password: z
    .string()
    .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
    .max(PASSWORD_MAX_LENGTH, `Password must be at most ${PASSWORD_MAX_LENGTH} characters`),
})
export type RegisterRequest = z.infer<typeof registerRequestSchema>

export const loginRequestSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password').max(PASSWORD_MAX_LENGTH),
})
export type LoginRequest = z.infer<typeof loginRequestSchema>

export const publicUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  role: roleSchema,
})
export type PublicUser = z.infer<typeof publicUserSchema>

export const authResponseSchema = z.object({ user: publicUserSchema })
export type AuthResponse = z.infer<typeof authResponseSchema>
