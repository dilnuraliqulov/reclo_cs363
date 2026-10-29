import { describe, expect, it } from 'vitest'
import { VALIDATION_CODES, errorCodeSchema } from './errors'
import {
  adminPlacementListQuerySchema,
  approvePlacementRequestSchema,
  rejectPlacementRequestSchema,
} from './moderation'
import { placementStatusSchema } from './placement'

const expectedUpdatedAt = '2026-10-12T15:00:00.000Z'
const reject = (reason: unknown) =>
  rejectPlacementRequestSchema.safeParse({ expectedUpdatedAt, reason })

describe('rejectPlacementRequestSchema reason', () => {
  it.each<[number, boolean, string?]>([
    [9, false, VALIDATION_CODES.reasonTooShort],
    [10, true],
    [500, true],
    [501, false, VALIDATION_CODES.reasonTooLong],
  ])('with %i characters: valid=%s', (length, valid, code) => {
    const result = reject('x'.repeat(length))

    expect(result.success).toBe(valid)
    if (!result.success) expect(result.error.issues[0]?.message).toBe(code)
  })

  it('trims, so whitespace cannot make up the length', () => {
    expect(reject(' '.repeat(20)).success).toBe(false)
    const padded = reject(`   ${'x'.repeat(9)}   `)
    expect(padded.success).toBe(false)
    const ok = reject(`  ${'x'.repeat(10)}  `)
    expect(ok.success && ok.data.reason).toBe('x'.repeat(10))
  })

  it('answers a missing reason with a code, not an English sentence', () => {
    const result = rejectPlacementRequestSchema.safeParse({ expectedUpdatedAt })

    expect(!result.success && result.error.issues[0]?.message).toBe(VALIDATION_CODES.required)
  })
})

describe('expectedUpdatedAt', () => {
  it.each(['', 'yesterday', '2026-10-12', '12/10/2026', 1760281200000])('rejects %j', (value) => {
    expect(approvePlacementRequestSchema.safeParse({ expectedUpdatedAt: value }).success).toBe(
      false,
    )
  })

  it('accepts an ISO timestamp', () => {
    expect(approvePlacementRequestSchema.safeParse({ expectedUpdatedAt }).success).toBe(true)
  })

  it('strips status and adminId, so a client cannot choose them', () => {
    const parsed = approvePlacementRequestSchema.parse({
      expectedUpdatedAt,
      status: 'ACTIVE',
      adminId: 'x',
    })

    expect(parsed).toEqual({ expectedUpdatedAt })
  })
})

describe('adminPlacementListQuerySchema', () => {
  it('defaults to the pending queue, page 1, 20 per page', () => {
    expect(adminPlacementListQuerySchema.parse({})).toEqual({
      status: 'PENDING_REVIEW',
      page: 1,
      pageSize: 20,
    })
  })

  it('refuses a page size above 50 and an unknown status', () => {
    expect(adminPlacementListQuerySchema.safeParse({ pageSize: '51' }).success).toBe(false)
    expect(adminPlacementListQuerySchema.safeParse({ status: 'DELETED' }).success).toBe(false)
  })
})

describe('moderation vocabulary', () => {
  it('knows REJECTED as a listing status', () => {
    expect(placementStatusSchema.options).toContain('REJECTED')
  })

  it('has the three 409 codes', () => {
    for (const code of ['PLACEMENT_NOT_PENDING', 'PLACEMENT_CHANGED', 'PLACEMENT_NO_PHOTOS']) {
      expect(errorCodeSchema.safeParse(code).success).toBe(true)
    }
  })
})
