import type { PublicUser } from '@reclo/shared'
import { createContext, useContext } from 'react'

export interface AuthState {
  /** The signed-in user, or null when signed out (or while loading). */
  user: PublicUser | null
  /** True until the first GET /api/auth/me has answered. */
  isLoading: boolean
  /** Call after a successful register or login. */
  setUser: (user: PublicUser) => void
  signOut: () => Promise<void>
}

/** The signed-in user query. Invalidate it to re-check the session, e.g. after a 401 or 403. */
export const ME_KEY = ['auth', 'me'] as const

export const AuthContext = createContext<AuthState | null>(null)

export function useAuth(): AuthState {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>')
  return context
}
