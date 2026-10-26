import { useSearchParams } from 'react-router'

/**
 * Where to go after signing in: the `next` query parameter, or home.
 *
 * Only same-origin paths are honoured, so a crafted `?next=https://evil.example` cannot turn a
 * sign-in link into an open redirect.
 */
export function useNextPath(): string {
  const [searchParams] = useSearchParams()
  const next = searchParams.get('next')
  if (!next || !next.startsWith('/') || next.startsWith('//')) return '/'
  return next
}
