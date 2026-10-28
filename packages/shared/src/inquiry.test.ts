import { describe, expect, it } from 'vitest'
import { VALIDATION_CODES } from './errors'
import {
  createInquiryRequestSchema,
  DURATION_MAX_MONTHS,
  INQUIRY_PAGE_SIZE,
  INQUIRY_PAGE_SIZE_MAX,
  inquiryHistoryItemSchema,
  inquiryHistoryQuerySchema,
  MESSAGE_MAX_LENGTH,
  MESSAGE_MIN_LENGTH,
  uzPhoneSchema,
} from './inquiry'

const PLACEMENT_ID = 'b1e0696a-54c3-4d40-84c4-f2a89326e680'

/** A request that passes, so each test can vary one field. */
function validRequest(overrides: Record<string, unknown> = {}) {
  return {
    placementId: PLACEMENT_ID,
    message: 'We would like to run a two-month campaign on this billboard.',
    contactName: 'Aziza Karimova',
    contactPhone: '+998901234567',
    contactEmail: 'aziza@example.com',
    ...overrides,
  }
}

/** The messages for one field of a failed parse. */
function errorsFor(result: ReturnType<typeof createInquiryRequestSchema.safeParse>, field: string) {
  if (result.success) throw new Error('expected the parse to fail')
  return result.error.issues
    .filter((issue) => issue.path.join('.') === field)
    .map((issue) => issue.message)
}

describe('uzPhoneSchema', () => {
  it.each([
    ['E.164', '+998901234567'],
    ['no plus', '998901234567'],
    ['international prefix', '00998901234567'],
    ['bare national number', '901234567'],
    ['spaced', '+998 90 123 45 67'],
    ['dashed', '+998-90-123-45-67'],
    ['parenthesised operator code', '+998 (90) 123.45.67'],
    ['national number with spaces', '90 123 45 67'],
    ['surrounded by whitespace', '  +998901234567  '],
  ])('normalizes %s to E.164', (_label, input) => {
    expect(uzPhoneSchema.parse(input)).toBe('+998901234567')
  })

  it.each([
    ['a Russian number', '+74951234567'],
    ['a country code that is not 998', '+998901234567'.replace('998', '997')],
    ['too few digits', '+99890123456'],
    ['too many digits', '+9989012345678'],
    ['eight national digits', '90123456'],
    ['letters', 'call me maybe'],
    ['an empty string', ''],
  ])('rejects %s', (_label, input) => {
    expect(uzPhoneSchema.safeParse(input).success).toBe(false)
  })

  it('names the phone code rather than a sentence, since both locales render it', () => {
    const result = uzPhoneSchema.safeParse('+7 495 123 45 67')

    expect(result.success).toBe(false)
    if (!result.success) {
      // The message is parsed by the web form and the API route alike, so it belongs to no one
      // language; `apps/web/src/lib/messages.ts` holds the words.
      expect(result.error.issues[0]?.message).toBe(VALIDATION_CODES.phoneUz)
    }
  })
})

describe('createInquiryRequestSchema', () => {
  it('accepts a minimal request and leaves the optional campaign fields unset', () => {
    const result = createInquiryRequestSchema.parse(validRequest())

    expect(result.desiredStartDate).toBeUndefined()
    expect(result.durationMonths).toBeUndefined()
  })

  it('strips unknown keys, so status, clientId and vendorId cannot be set from the body', () => {
    const result = createInquiryRequestSchema.parse(
      validRequest({ status: 'CLOSED', clientId: 'spoofed', vendorId: 'spoofed', id: 'spoofed' }),
    )

    expect(result).not.toHaveProperty('status')
    expect(result).not.toHaveProperty('clientId')
    expect(result).not.toHaveProperty('vendorId')
    expect(result).not.toHaveProperty('id')
  })

  it('requires a uuid placement id', () => {
    expect(
      createInquiryRequestSchema.safeParse(validRequest({ placementId: 'nope' })).success,
    ).toBe(false)
  })

  describe('message', () => {
    it('trims surrounding whitespace', () => {
      const result = createInquiryRequestSchema.parse(
        validRequest({ message: `   ${'a'.repeat(20)}   ` }),
      )

      expect(result.message).toBe('a'.repeat(20))
    })

    it('accepts both length bounds exactly', () => {
      expect(
        createInquiryRequestSchema.parse(validRequest({ message: 'a'.repeat(MESSAGE_MIN_LENGTH) }))
          .message,
      ).toHaveLength(MESSAGE_MIN_LENGTH)
      expect(
        createInquiryRequestSchema.parse(validRequest({ message: 'a'.repeat(MESSAGE_MAX_LENGTH) }))
          .message,
      ).toHaveLength(MESSAGE_MAX_LENGTH)
    })

    it('rejects one character under and one over', () => {
      const short = createInquiryRequestSchema.safeParse(
        validRequest({ message: 'a'.repeat(MESSAGE_MIN_LENGTH - 1) }),
      )
      const long = createInquiryRequestSchema.safeParse(
        validRequest({ message: 'a'.repeat(MESSAGE_MAX_LENGTH + 1) }),
      )

      expect(errorsFor(short, 'message')).toHaveLength(1)
      expect(errorsFor(long, 'message')).toHaveLength(1)
    })

    it('counts length after trimming, so whitespace cannot pad a short message', () => {
      const result = createInquiryRequestSchema.safeParse(
        validRequest({ message: `  ${'a'.repeat(MESSAGE_MIN_LENGTH - 1)}  ` }),
      )

      expect(result.success).toBe(false)
    })
  })

  describe('contactName', () => {
    it('trims it', () => {
      expect(
        createInquiryRequestSchema.parse(validRequest({ contactName: '  Aziza  ' })).contactName,
      ).toBe('Aziza')
    })

    it('rejects a single character and more than 120', () => {
      expect(createInquiryRequestSchema.safeParse(validRequest({ contactName: 'A' })).success).toBe(
        false,
      )
      expect(
        createInquiryRequestSchema.safeParse(validRequest({ contactName: 'a'.repeat(121) }))
          .success,
      ).toBe(false)
    })
  })

  describe('contactEmail', () => {
    it('trims and lowercases it, so the vendor sees one canonical address', () => {
      expect(
        createInquiryRequestSchema.parse(validRequest({ contactEmail: '  Aziza@Example.COM ' }))
          .contactEmail,
      ).toBe('aziza@example.com')
    })

    it('rejects a malformed address', () => {
      expect(
        createInquiryRequestSchema.safeParse(validRequest({ contactEmail: 'not-an-email' }))
          .success,
      ).toBe(false)
    })
  })

  describe('desiredStartDate', () => {
    it('accepts a plain YYYY-MM-DD date', () => {
      expect(
        createInquiryRequestSchema.parse(validRequest({ desiredStartDate: '2026-12-01' }))
          .desiredStartDate,
      ).toBe('2026-12-01')
    })

    it.each([
      ['a timestamp', '2026-12-01T10:00:00.000Z'],
      ['a slashed date', '01/12/2026'],
      ['a non-date string', 'tomorrow'],
      ['an impossible day', '2026-02-30'],
    ])('rejects %s', (_label, value) => {
      expect(
        createInquiryRequestSchema.safeParse(validRequest({ desiredStartDate: value })).success,
      ).toBe(false)
    })
  })

  describe('durationMonths', () => {
    it('coerces the numeric string a select sends', () => {
      expect(
        createInquiryRequestSchema.parse(validRequest({ durationMonths: '6' })).durationMonths,
      ).toBe(6)
    })

    it('accepts both ends of the range', () => {
      expect(
        createInquiryRequestSchema.parse(validRequest({ durationMonths: 1 })).durationMonths,
      ).toBe(1)
      expect(
        createInquiryRequestSchema.parse(validRequest({ durationMonths: DURATION_MAX_MONTHS }))
          .durationMonths,
      ).toBe(DURATION_MAX_MONTHS)
    })

    it.each([
      ['zero', 0],
      ['a negative number', -3],
      ['past the two-year cap', DURATION_MAX_MONTHS + 1],
      ['a fraction', 1.5],
      ['a non-numeric string', 'six'],
    ])('rejects %s', (_label, value) => {
      expect(
        createInquiryRequestSchema.safeParse(validRequest({ durationMonths: value })).success,
      ).toBe(false)
    })
  })

  it('reports every invalid field at once, so a form can show them together', () => {
    const result = createInquiryRequestSchema.safeParse({
      placementId: 'nope',
      message: 'short',
      contactName: 'A',
      contactPhone: '+74951234567',
      contactEmail: 'not-an-email',
      durationMonths: 99,
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      const fields = new Set(result.error.issues.map((issue) => issue.path.join('.')))
      expect(fields).toEqual(
        new Set([
          'placementId',
          'message',
          'contactName',
          'contactPhone',
          'contactEmail',
          'durationMonths',
        ]),
      )
    }
  })
})

describe('inquiryHistoryQuerySchema', () => {
  it('defaults to the standard page size when no limit is given', () => {
    expect(inquiryHistoryQuerySchema.parse({}).limit).toBe(INQUIRY_PAGE_SIZE)
  })

  it('coerces the limit a query string carries', () => {
    expect(inquiryHistoryQuerySchema.parse({ limit: '5' }).limit).toBe(5)
  })

  it('accepts both ends of the limit range', () => {
    expect(inquiryHistoryQuerySchema.parse({ limit: 1 }).limit).toBe(1)
    expect(inquiryHistoryQuerySchema.parse({ limit: INQUIRY_PAGE_SIZE_MAX }).limit).toBe(
      INQUIRY_PAGE_SIZE_MAX,
    )
  })

  it.each([
    ['zero', 0],
    ['a negative limit', -1],
    ['past the cap', INQUIRY_PAGE_SIZE_MAX + 1],
    ['a fraction', 1.5],
    ['a non-numeric limit', 'all'],
  ])('rejects %s', (_label, limit) => {
    expect(inquiryHistoryQuerySchema.safeParse({ limit }).success).toBe(false)
  })

  it('leaves status and cursor unset when absent, so All means all', () => {
    const result = inquiryHistoryQuerySchema.parse({})

    expect(result.status).toBeUndefined()
    expect(result.cursor).toBeUndefined()
  })

  it('rejects a status outside the enum', () => {
    expect(inquiryHistoryQuerySchema.safeParse({ status: 'PENDING' }).success).toBe(false)
  })

  it('strips a clientId, which the route takes from the session only', () => {
    expect(inquiryHistoryQuerySchema.parse({ clientId: 'someone-else' })).not.toHaveProperty(
      'clientId',
    )
  })
})

describe('inquiryHistoryItemSchema', () => {
  const base = {
    id: '8f1e2bb6-6ad8-4a2e-9f6e-1c2f6f2a31aa',
    placementId: PLACEMENT_ID,
    status: 'NEW',
    message: 'We would like to run a two-month campaign on this billboard.',
    contactName: 'Aziza Karimova',
    contactPhone: '+998901234567',
    contactEmail: 'aziza@example.com',
    desiredStartDate: null,
    durationMonths: null,
    createdAt: '2026-10-26T10:00:00.000Z',
  }

  const placement = {
    id: PLACEMENT_ID,
    title: 'Amir Temur Avenue billboard',
    city: 'Tashkent',
    type: 'BILLBOARD',
    isViewable: true,
  }

  it('parses a row carrying its placement', () => {
    expect(inquiryHistoryItemSchema.parse({ ...base, placement }).placement).toEqual(placement)
  })

  it('parses a row whose placement was hard-deleted', () => {
    expect(inquiryHistoryItemSchema.parse({ ...base, placement: null }).placement).toBeNull()
  })

  it('requires the placement key, so a missing join is not read as a deleted placement', () => {
    expect(inquiryHistoryItemSchema.safeParse(base).success).toBe(false)
  })

  it('carries every field of the submission response, so the two cannot drift apart', () => {
    const item = inquiryHistoryItemSchema.parse({ ...base, placement })

    for (const key of Object.keys(base)) {
      expect(item).toHaveProperty(key)
    }
  })
})
