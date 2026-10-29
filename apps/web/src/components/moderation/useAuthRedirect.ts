import { useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { ApiRequestError } from '@/lib/api'

/**
 * What to do when the session or the role no longer fits the admin screens: a lost session goes to
 * sign-in and comes back here, a role that changed goes home. Returns true when it redirected, so
 * the caller does not also show a toast for it.
 */
export function useAuthRedirect(): (error: unknown) => boolean {
  const navigate = useNavigate()
  const location = useLocation()

  return useCallback(
    (error) => {
      if (!(error instanceof ApiRequestError)) return false
      if (error.status === 401) {
        const next = `${location.pathname}${location.search}`
        navigate(`/sign-in?next=${encodeURIComponent(next)}`, { replace: true })
        return true
      }
      if (error.status === 403) {
        navigate('/', { replace: true })
        return true
      }
      return false
    },
    [navigate, location.pathname, location.search],
  )
}
