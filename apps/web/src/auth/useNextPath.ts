import { useSearchParams } from 'react-router'

/**
 * Where to go after signing in: the `next` query parameter, or home.
 *
 * Only same-origin paths are honoured, so a crafted `?next=https://evil.example` cannot turn a
 * sign-in link into an open redirect. Three layers are needed, because each catches what the
 * others miss:
 *
 * 1. The raw value must be a path. Browsers normalise backslashes and strip tabs and newlines
 *    while parsing, so `/\evil.example` and `/\t/evil.example` would otherwise resolve off-origin.
 * 2. Resolved against this origin, it must stay on it — that is what rejects an absolute URL.
 * 3. The resolved path must itself still be a single-slash path. Dot segments collapse during
 *    parsing, so `/.//evil.example`, `/%2e//evil.example` and `/a/../..//evil.example` all pass
 *    the first two layers and come back as `//evil.example`, which is protocol-relative. What is
 *    returned is checked, not only what came in.
 */
export function useNextPath(): string {
  const [searchParams] = useSearchParams()
  const next = searchParams.get('next')
  if (!isPath(next)) return '/'
  try {
    const url = new URL(next, window.location.origin)
    if (url.origin !== window.location.origin) return '/'
    const path = `${url.pathname}${url.search}${url.hash}`
    return isPath(path) ? path : '/'
  } catch {
    return '/'
  }
}

/** A same-origin path: one leading slash, and nothing a URL parser would read as an authority. */
function isPath(value: string | null): value is string {
  return (
    value !== null && value.startsWith('/') && !value.startsWith('//') && !/[\\\t\r\n]/.test(value)
  )
}
