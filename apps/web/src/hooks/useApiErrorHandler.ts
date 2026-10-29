import { useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { ApiRequestError } from '@/lib/api'
import { useMessages } from '@/lib/messages'

/**
 * What a failed request does to the screen: an expired session goes to sign-in and comes back to
 * this page (`?next=`), anything else is a toast with the localized message.
 */
export function useApiErrorHandler(): (error: unknown) => void {
  const { apiErrorText } = useMessages()
  const navigate = useNavigate()
  const location = useLocation()

  return useCallback(
    (error: unknown) => {
      if (error instanceof ApiRequestError && error.status === 401) {
        const next = `${location.pathname}${location.search}`
        void navigate(`/sign-in?next=${encodeURIComponent(next)}`)
        return
      }
      toast.error(apiErrorText(error))
    },
    [apiErrorText, location.pathname, location.search, navigate],
  )
}
