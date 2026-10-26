import { useSearchParams } from 'react-router'

/**
 * Where to go after signing in: the `next` query parameter, or home.
 *
 * Only same-origin paths are honoured, so a crafted `?next=https://evil.example` cannot turn a
 * sign-in link into an open redirect. A prefix check alone is not enough: browsers normalise
 * backslashes and strip tabs and newlines while parsing, so `/\evil.example` and `/\t/evil.example`
 * both resolve off-origin. The value is therefore resolved against this origin and rejected unless
 * it stays on it.
 */
export function useNextPath(): string {
  const [searchParams] = useSearchParams()
  const next = searchParams.get('next')
  if (!next || !next.startsWith('/') || next.startsWith('//') || /[\\\t\r\n]/.test(next)) return '/'
  try {
    const url = new URL(next, window.location.origin)
    if (url.origin !== window.location.origin) return '/'
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return '/'
  }
}
