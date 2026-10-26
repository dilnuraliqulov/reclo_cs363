import { describe, expect, it } from 'vitest'
import { formatInquiryDate, formatUzPhone } from './inquiries'

describe('formatUzPhone', () => {
  it('groups a canonical E.164 Uzbek number', () => {
    expect(formatUzPhone('+998901234567')).toBe('+998 90 123 45 67')
  })

  it('returns anything else untouched', () => {
    expect(formatUzPhone('+7 495 123 45 67')).toBe('+7 495 123 45 67')
    expect(formatUzPhone('+99890123456')).toBe('+99890123456')
    expect(formatUzPhone('')).toBe('')
  })
})

describe('formatInquiryDate', () => {
  it('reads an ISO timestamp as a short date', () => {
    expect(formatInquiryDate('2026-10-20T08:00:00.000Z')).toBe('20 Oct 2026')
  })

  it('returns an unparseable value untouched', () => {
    expect(formatInquiryDate('not a date')).toBe('not a date')
  })
})
