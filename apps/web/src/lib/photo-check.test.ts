import { LISTING_LIMITS } from '@reclo/shared'
import { describe, expect, it } from 'vitest'
import { checkPhotoFile } from './photo-check'

describe('checkPhotoFile', () => {
  it.each(['image/jpeg', 'image/png', 'image/webp'])('accepts %s', (type) => {
    expect(checkPhotoFile({ type, size: 1000 })).toBeNull()
  })

  it.each(['image/gif', 'image/svg+xml', 'application/pdf', ''])('rejects type "%s"', (type) => {
    expect(checkPhotoFile({ type, size: 1000 })).toBe('type')
  })

  it('accepts exactly the size limit and rejects one byte more', () => {
    const type = 'image/jpeg'
    expect(checkPhotoFile({ type, size: LISTING_LIMITS.maxPhotoBytes })).toBeNull()
    expect(checkPhotoFile({ type, size: LISTING_LIMITS.maxPhotoBytes + 1 })).toBe('size')
  })

  it('reports the type first when both are wrong', () => {
    expect(checkPhotoFile({ type: 'image/gif', size: LISTING_LIMITS.maxPhotoBytes + 1 })).toBe(
      'type',
    )
  })
})
