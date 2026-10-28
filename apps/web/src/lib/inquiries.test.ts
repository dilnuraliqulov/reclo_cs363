import { describe, expect, it } from 'vitest'
import { formatInquiryDate, formatUzPhone, inquiryStatusVariant } from './inquiries'
import { inquiryStatusSchema } from '@reclo/shared'

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
    expect(formatInquiryDate('2026-10-20T08:00:00.000Z', 'en')).toBe('20 Oct 2026')
  })

  // The same instant in each locale. Uzbek and Russian readers are both in Uzbekistan, so the day
  // leads in all three; only the words and the separators change.
  it('writes the month in Uzbek', () => {
    expect(formatInquiryDate('2026-10-20T08:00:00.000Z', 'uz')).toBe('20-okt, 2026')
  })

  it('writes the month in Russian', () => {
    expect(formatInquiryDate('2026-10-20T08:00:00.000Z', 'ru')).toBe('20 окт. 2026 г.')
  })

  it('returns an unparseable value untouched', () => {
    expect(formatInquiryDate('not a date', 'en')).toBe('not a date')
  })
})

describe('inquiryStatusVariant', () => {
  it('covers every status in the enum, so a new one cannot render unstyled', () => {
    for (const status of inquiryStatusSchema.options) {
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
