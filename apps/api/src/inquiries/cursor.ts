/**
 * Pagination cursors for the client inquiry history.
 *
 * The history pages by `(createdAt, id)` rather than by offset: a new inquiry arriving mid-scroll
 * shifts every offset and silently duplicates a row. The `id` half is the tie-break — two
 * inquiries can share a `createdAt` at millisecond resolution, and without it paging can loop on
 * one row or skip the other.
 *
 * The encoding is base64url so the value reads as opaque and nobody builds a client that parses
 * it. It is not a security boundary: a cursor only narrows a query already scoped to the session's
 * `clientId`, so a forged one reaches another page of the client's own history and nothing else.
 */

export interface InquiryCursor {
  createdAt: Date
  id: string
}

export function encodeCursor({ createdAt, id }: InquiryCursor): string {
  return Buffer.from(`${createdAt.toISOString()}|${id}`, 'utf8').toString('base64url')
}

/**
 * Null for anything that is not a cursor this module produced. The route answers that with a 400
 * rather than silently resetting to page one, which would look like the list restarting at random.
 */
export function decodeCursor(value: string): InquiryCursor | null {
  let decoded: string
  try {
    decoded = Buffer.from(value, 'base64url').toString('utf8')
  } catch {
    return null
  }

  // The id is a uuid and holds no "|", so splitting on the first one is unambiguous.
  const separator = decoded.indexOf('|')
  if (separator === -1) return null

  const timestamp = decoded.slice(0, separator)
  const id = decoded.slice(separator + 1)
  if (!id) return null

  const createdAt = new Date(timestamp)
  // Round-trip the timestamp: `new Date()` accepts plenty of strings that are not the ISO form
  // encodeCursor wrote, and those would page from a subtly different point.
  if (Number.isNaN(createdAt.getTime()) || createdAt.toISOString() !== timestamp) return null

  return { createdAt, id }
}
