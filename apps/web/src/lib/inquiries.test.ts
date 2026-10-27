import { inquiryStatusSchema } from '@reclo/shared'
import { describe, expect, it } from 'vitest'
import {
  formatInquiryDate,
  formatUzPhone,
  inquiryStatusLabel,
  inquiryStatusVariant,
} from './inquiries'

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

describe('inquiry status presentation', () => {
  // The client never sees the enum: NEW reads as "Sent" from where they are standing, not as a
  // vendor's inbox state. Pinned here so a rename cannot slip through unnoticed.
  it.each([
    ['NEW', 'Sent'],
    ['READ', 'Seen'],
    ['RESPONDED', 'Replied'],
    ['CLOSED', 'Closed'],
  ] as const)('labels %s as %s', (status, label) => {
    expect(inquiryStatusLabel(status)).toBe(label)
  })

  it('covers every status in the enum, so a new one cannot render blank', () => {
    for (const status of inquiryStatusSchema.options) {
      expect(inquiryStatusLabel(status)).toBeTruthy()
      expect(inquiryStatusVariant(status)).toBeTruthy()
    }
  })

  it('gives each status a badge variant the badge component accepts', () => {
    const allowed = ['default', 'secondary', 'outline']
    for (const status of inquiryStatusSchema.options) {
      expect(allowed).toContain(inquiryStatusVariant(status))
    }
  })
})
