import type { Role } from '@reclo/shared'
import { Navigate, Outlet, useLocation } from 'react-router'
import { useAuth } from './useAuth'

/**
 * Layout route for screens only one role may use. Signed-out visitors go to sign-in and come back
 * here; a signed-in user of another role is sent home rather than shown a dead end. The server
 * checks the role on every call as well, so this guard is for the reader, not for security.
 */
export function RequireRole({ role }: { role: Role }) {
  const { user, isLoading } = useAuth()
  const location = useLocation()
  if (isLoading) return null
  if (!user) {
    const next = `${location.pathname}${location.search}`
    return <Navigate to={`/sign-in?next=${encodeURIComponent(next)}`} replace />
  }
  if (user.role !== role) return <Navigate to="/" replace />
  return <Outlet />
}
