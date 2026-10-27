import { Navigate, Outlet, useLocation } from 'react-router'
import { useAuth } from './useAuth'

/**
 * Layout route: signed-out visitors are sent to sign-in and returned here afterwards, via the
 * `?next=` parameter `useNextPath` validates. The counterpart to `GuestOnly`.
 */
export function RequireAuth() {
  const { user, isLoading } = useAuth()
  const location = useLocation()
  if (isLoading) return null
  if (!user) {
    const next = `${location.pathname}${location.search}`
    return <Navigate to={`/sign-in?next=${encodeURIComponent(next)}`} replace />
  }
  return <Outlet />
}
