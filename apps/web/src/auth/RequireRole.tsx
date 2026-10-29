import type { Role } from '@reclo/shared'
import { Navigate, Outlet, useLocation } from 'react-router'
import { useAuth } from './useAuth'

/**
 * Layout route for screens one role may use. Signed-out visitors go to sign-in and come back, as
 * with `RequireAuth`; a signed-in user with another role is sent home. The API enforces the role
 * on every request — this only avoids rendering a page whose requests would all fail.
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
