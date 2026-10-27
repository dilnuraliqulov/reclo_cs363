import { describe, expect, it } from 'vitest'
import { decodeCursor, encodeCursor } from './cursor'

const CREATED_AT = new Date('2026-10-26T10:00:00.000Z')
const ID = '8f1e2bb6-6ad8-4a2e-9f6e-1c2f6f2a31aa'

describe('inquiry history cursors', () => {
  it('round-trips a position', () => {
    expect(decodeCursor(encodeCursor({ createdAt: CREATED_AT, id: ID }))).toEqual({
      createdAt: CREATED_AT,
      id: ID,
    })
  })

  it('encodes to something opaque, so no client is tempted to parse it', () => {
    const cursor = encodeCursor({ createdAt: CREATED_AT, id: ID })

    expect(cursor).not.toContain(ID)
    expect(cursor).not.toContain('2026-10-26')
    // base64url, so it survives a query string without escaping.
    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('keeps millisecond precision, which is what the createdAt half is for', () => {
    const precise = new Date('2026-10-26T10:00:00.123Z')

    expect(decodeCursor(encodeCursor({ createdAt: precise, id: ID }))?.createdAt).toEqual(precise)
  })

  it.each([
    ['an empty string', ''],
    ['unencoded text', 'not-a-cursor'],
    ['a missing separator', Buffer.from(CREATED_AT.toISOString(), 'utf8').toString('base64url')],
    ['a missing id', Buffer.from(`${CREATED_AT.toISOString()}|`, 'utf8').toString('base64url')],
    ['a missing timestamp', Buffer.from(`|${ID}`, 'utf8').toString('base64url')],
    ['an unparseable timestamp', Buffer.from(`tomorrow|${ID}`, 'utf8').toString('base64url')],
    // `new Date()` accepts these, but they are not what encodeCursor writes, and paging from them
    // would start at a subtly different point.
    ['a date-only timestamp', Buffer.from(`2026-10-26|${ID}`, 'utf8').toString('base64url')],
    [
      'a timestamp without milliseconds',
      Buffer.from(`2026-10-26T10:00:00Z|${ID}`, 'utf8').toString('base64url'),
    ],
    [
      'a non-UTC timestamp',
      Buffer.from(`2026-10-26T15:00:00.000+05:00|${ID}`, 'utf8').toString('base64url'),
    ],
  ])('rejects %s', (_label, value) => {
    expect(decodeCursor(value)).toBeNull()
  })

  it('keeps an id containing a separator intact, splitting on the first one only', () => {
    // Ids are uuids today, so this cannot happen — but a decoder that split on every "|" would
    // silently truncate an id if that ever changed.
    const odd = 'weird|id'

    expect(decodeCursor(encodeCursor({ createdAt: CREATED_AT, id: odd }))?.id).toBe(odd)
  })
})
