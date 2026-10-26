import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { useNextPath } from './useNextPath'

function Probe() {
  return <span data-testid="next">{useNextPath()}</span>
}

/** The path `useNextPath` resolves for a given sign-in URL. */
function resolve(entry: string): string {
  // RTL's queries are bound to document.body, so read the container and unmount: a test may then
  // resolve more than one URL without two probes colliding.
  const { container, unmount } = render(
    <MemoryRouter initialEntries={[entry]}>
      <Probe />
    </MemoryRouter>,
  )
  const resolved = container.textContent ?? ''
  unmount()
  return resolved
}

describe('useNextPath', () => {
  it('returns home when there is no next parameter', () => {
    expect(resolve('/sign-in')).toBe('/')
  })

  it('keeps a same-origin path, with its query and hash', () => {
    expect(resolve(`/sign-in?next=${encodeURIComponent('/placements')}`)).toBe('/placements')
    expect(resolve(`/sign-in?next=${encodeURIComponent('/placements?city=Tashkent#pin')}`)).toBe(
      '/placements?city=Tashkent#pin',
    )
  })

  it('normalizes a harmless dot segment', () => {
    expect(resolve(`/sign-in?next=${encodeURIComponent('/./placements')}`)).toBe('/placements')
  })

  it.each([
    ['an absolute URL', 'https://evil.example/phish'],
    ['a protocol-relative URL', '//evil.example'],
    // Browsers normalise a backslash to a slash while parsing, so this would leave the origin.
    ['a backslash-escaped host', '/\\evil.example'],
    // Tabs and newlines are stripped during parsing, which would also leave the origin.
    ['a tab-split host', '/\t/evil.example'],
    ['a scheme-relative javascript URL', 'javascript:alert(1)'],
    ['a path that does not start with a slash', 'placements'],
    // These three pass a check on the input but collapse to "//evil.example" once parsed, so the
    // returned path has to be checked too.
    ['a dot segment hiding an authority', '/.//evil.example'],
    ['a percent-encoded dot segment', '/%2e//evil.example'],
    ['parent segments climbing past the root', '/a/../..//evil.example'],
  ])('refuses %s', (_label, next) => {
    expect(resolve(`/sign-in?next=${encodeURIComponent(next)}`)).toBe('/')
  })
})
