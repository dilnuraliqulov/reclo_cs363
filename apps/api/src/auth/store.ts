import type { PublicUser } from '@reclo/shared'

export interface StoredUser extends PublicUser {
  passwordHash: string
}

export interface StoredSession {
  id: string
  expiresAt: Date
  user: PublicUser
}

/** Thrown by `createClient` when the email is already registered. */
export class EmailTakenError extends Error {
  constructor() {
    super('Email is already registered')
  }
}

/** Persistence needed by the auth routes. Injected into `createApp` so tests need no database. */
export interface AuthStore {
  findUserByEmail: (email: string) => Promise<StoredUser | null>
  /** Creates a CLIENT. Throws `EmailTakenError` on a duplicate email. */
  createClient: (input: { email: string; passwordHash: string }) => Promise<PublicUser>
  createSession: (input: { userId: string; tokenHash: string; expiresAt: Date }) => Promise<void>
  findSessionByTokenHash: (tokenHash: string) => Promise<StoredSession | null>
  deleteSessionByTokenHash: (tokenHash: string) => Promise<void>
}
