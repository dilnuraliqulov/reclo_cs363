import type { PublicUser } from '@reclo/shared'
import { EmailTakenError, type AuthStore, type StoredSession, type StoredUser } from './auth/store'

/** A user row as the memory store keeps it: what the database would hold, minus sessions. */
export interface MemoryUser extends StoredUser {
  companyName: string | null
  createdById: string | null
  createdAt: Date
}

/** In-memory AuthStore for route tests, so they run without a database. */
export function createMemoryAuthStore() {
  const users: MemoryUser[] = []
  const sessions = new Map<string, StoredSession & { userId: string }>()
  let nextId = 1

  // Each row is a second newer than the last, so "newest first" is deterministic in tests.
  function nextUser(fields: Pick<MemoryUser, 'email' | 'role' | 'passwordHash'>): MemoryUser {
    const id = nextId++
    return {
      id: `user-${id}`,
      companyName: null,
      createdById: null,
      createdAt: new Date(Date.UTC(2026, 9, 1) + id * 1000),
      ...fields,
    }
  }

  const store: AuthStore = {
    async findUserByEmail(email) {
      return users.find((user) => user.email === email) ?? null
    },
    async createClient({ email, passwordHash }) {
      if (users.some((user) => user.email === email)) throw new EmailTakenError()
      const user = nextUser({ email, role: 'CLIENT', passwordHash })
      users.push(user)
      return { id: user.id, email: user.email, role: user.role }
    },
    async createSession({ userId, tokenHash, expiresAt }) {
      const user = users.find((candidate) => candidate.id === userId)
      if (!user) throw new Error('unknown user')
      const publicUser = { id: user.id, email: user.email, role: user.role }
      sessions.set(tokenHash, { id: `session-${nextId++}`, userId, expiresAt, user: publicUser })
    },
    async findSessionByTokenHash(tokenHash) {
      return sessions.get(tokenHash) ?? null
    },
    async deleteSessionByTokenHash(tokenHash) {
      sessions.delete(tokenHash)
    },
    async createVendor({ email, passwordHash, companyName, createdById }) {
      if (users.some((user) => user.email === email)) throw new EmailTakenError()
      const user = {
        ...nextUser({ email, role: 'VENDOR', passwordHash }),
        companyName,
        createdById,
      }
      users.push(user)
      return {
        id: user.id,
        email: user.email,
        companyName,
        createdAt: user.createdAt.toISOString(),
      }
    },
    async listVendors(limit) {
      return users
        .filter((user) => user.role === 'VENDOR')
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, limit)
        .map((user) => ({
          id: user.id,
          email: user.email,
          companyName: user.companyName ?? '',
          createdAt: user.createdAt.toISOString(),
        }))
    },
  }

  return {
    store,
    users,
    sessions,
    /** Test shortcut: change a user's role directly (the API cannot do this). */
    setRole(email: string, role: PublicUser['role']) {
      const user = users.find((candidate) => candidate.email === email)
      if (!user) throw new Error(`no user ${email}`)
      user.role = role
      for (const session of sessions.values()) {
        if (session.userId === user.id) session.user = { ...session.user, role }
      }
    },
  }
}
