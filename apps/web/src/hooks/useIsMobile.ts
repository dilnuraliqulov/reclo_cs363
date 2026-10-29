import { useSyncExternalStore } from 'react'

const QUERY = '(max-width: 767px)'

function subscribe(onChange: () => void) {
  const list = window.matchMedia(QUERY)
  list.addEventListener('change', onChange)
  return () => list.removeEventListener('change', onChange)
}

/** Below Tailwind's `md`, where My listings swaps the table for a stack of cards. */
export function useIsMobile(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  )
}
