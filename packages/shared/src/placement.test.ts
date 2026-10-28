import { describe, expect, it } from 'vitest'
import type { z } from 'zod'
import { VALIDATION_CODES, validationCodeSchema } from './errors'
import {
  createPlacementRequestSchema,
  updatePlacementRequestSchema,
  vendorPlacementListQuerySchema,
} from './placement'

const valid = {
  title: 'Amir Temur Billboard',
  type: 'BILLBOARD',
  latitude: 41.311,
  longitude: 69.279,
  address: 'Amir Temur Ave 10',
  city: 'Tashkent',
  pricePerMonth: 5_000_000,
}

function messages(
  input: unknown,
  schema: z.ZodType = createPlacementRequestSchema,
  field?: string,
) {
  const result = schema.safeParse(input)
  if (result.success) return []
  return result.error.issues
    .filter((issue) => field === undefined || issue.path[0] === field)
    .map((issue) => issue.message)
}

describe('createPlacementRequestSchema', () => {
  it('accepts a minimal listing and defaults lighting to false', () => {
    const parsed = createPlacementRequestSchema.parse(valid)

    expect(parsed.lighting).toBe(false)
    expect(parsed.description).toBeUndefined()
  })

  it('trims text and coerces numeric strings, as the form sends them', () => {
    const parsed = createPlacementRequestSchema.parse({
      ...valid,
      title: '  Amir Temur Billboard  ',
      pricePerMonth: '5000000',
      width: '6.5',
    })

    expect(parsed.title).toBe('Amir Temur Billboard')
    expect(parsed.pricePerMonth).toBe(5_000_000)
    expect(parsed.width).toBe(6.5)
  })

  it.each([
    ['title', { title: 'abcd' }, VALIDATION_CODES.titleLength],
    ['title', { title: 'a'.repeat(121) }, VALIDATION_CODES.titleLength],
    ['description', { description: 'a'.repeat(2001) }, VALIDATION_CODES.descriptionTooLong],
    ['address', { address: 'ab' }, VALIDATION_CODES.addressLength],
    ['city', { city: 'a' }, VALIDATION_CODES.cityLength],
    ['pricePerMonth', { pricePerMonth: 99_999 }, VALIDATION_CODES.priceRange],
    ['pricePerMonth', { pricePerMonth: 1_000_000_001 }, VALIDATION_CODES.priceRange],
    ['pricePerMonth', { pricePerMonth: 150_000.5 }, VALIDATION_CODES.priceRange],
    ['latitude', { latitude: 36.9 }, VALIDATION_CODES.latitudeRange],
    ['latitude', { latitude: 45.7 }, VALIDATION_CODES.latitudeRange],
    ['longitude', { longitude: 55.9 }, VALIDATION_CODES.longitudeRange],
    ['longitude', { longitude: 73.3 }, VALIDATION_CODES.longitudeRange],
    ['width', { width: 0 }, VALIDATION_CODES.sizeRange],
    ['width', { width: 101 }, VALIDATION_CODES.sizeRange],
    ['height', { height: -1 }, VALIDATION_CODES.sizeRange],
  ])('rejects %s out of bounds with a code', (field, override, code) => {
    expect(messages({ ...valid, ...override }, createPlacementRequestSchema, field)).toEqual([code])
  })

  it('accepts every bound exactly', () => {
    const edge = {
      ...valid,
      title: 'a'.repeat(5),
      pricePerMonth: 100_000,
      latitude: 37.0,
      longitude: 73.2,
      width: 100,
    }

    expect(createPlacementRequestSchema.safeParse(edge).success).toBe(true)
    expect(
      createPlacementRequestSchema.safeParse({ ...edge, pricePerMonth: 1_000_000_000 }).success,
    ).toBe(true)
  })

  it('rejects swapped latitude and longitude, since 69 is outside Uzbekistan latitudes', () => {
    const swapped = { ...valid, latitude: 69.279, longitude: 41.311 }

    expect(messages(swapped)).toEqual([
      VALIDATION_CODES.latitudeRange,
      VALIDATION_CODES.longitudeRange,
    ])
  })

  it('reports a missing required field with the required code', () => {
    const withoutTitle = { ...valid, title: undefined }

    expect(messages(withoutTitle, createPlacementRequestSchema, 'title')).toEqual([
      VALIDATION_CODES.required,
    ])
  })

  it('strips fields the server owns', () => {
    const parsed = createPlacementRequestSchema.parse({
      ...valid,
      status: 'ACTIVE',
      vendorId: 'someone-else',
      archivedAt: '2026-01-01',
      photos: ['/x.jpg'],
      tier: 'GOLD',
    })

    expect(Object.keys(parsed).sort()).toEqual(
      [
        'address',
        'city',
        'latitude',
        'lighting',
        'longitude',
        'pricePerMonth',
        'title',
        'type',
      ].sort(),
    )
  })

  it('only emits codes the client can translate', () => {
    const result = createPlacementRequestSchema.safeParse({})
    const issues = result.success ? [] : result.error.issues

    expect(issues.length).toBeGreaterThan(0)
    for (const issue of issues) {
      expect(validationCodeSchema.safeParse(issue.message).success, issue.message).toBe(true)
    }
  })
})

describe('updatePlacementRequestSchema', () => {
  it('rejects an empty object', () => {
    expect(messages({}, updatePlacementRequestSchema)).toEqual([VALIDATION_CODES.nothingToUpdate])
  })

  it('rejects a body of only unknown keys, which strip to nothing', () => {
    expect(messages({ status: 'ACTIVE' }, updatePlacementRequestSchema)).toEqual([
      VALIDATION_CODES.nothingToUpdate,
    ])
  })

  it('accepts one field and does not re-apply the lighting default', () => {
    const parsed = updatePlacementRequestSchema.parse({ title: 'A new title' })

    expect(parsed).toEqual({ title: 'A new title' })
  })

  it('applies the same bounds as create', () => {
    expect(messages({ pricePerMonth: 5 }, updatePlacementRequestSchema)).toEqual([
      VALIDATION_CODES.priceRange,
    ])
  })

  it('does not accept null to clear a value', () => {
    expect(updatePlacementRequestSchema.safeParse({ description: null }).success).toBe(false)
  })
})

describe('vendorPlacementListQuerySchema', () => {
  it('defaults to page 1 of 20 and no status filter', () => {
    expect(vendorPlacementListQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20 })
  })

  it('rejects an unknown status and an oversized page', () => {
    expect(vendorPlacementListQuerySchema.safeParse({ status: 'DELETED' }).success).toBe(false)
    expect(vendorPlacementListQuerySchema.safeParse({ pageSize: 51 }).success).toBe(false)
    expect(vendorPlacementListQuerySchema.safeParse({ page: 0 }).success).toBe(false)
  })
})
