import { describe, expect, it } from 'vitest'
import { VALIDATION_CODES } from './errors'
import { COMPANY_NAME_MAX_LENGTH, createVendorRequestSchema } from './vendor'

const valid = { email: 'sales@reklama.uz', companyName: 'Reklama Plus', password: 'long-enough' }

function errorsFor(input: Record<string, unknown>, field: string) {
  const result = createVendorRequestSchema.safeParse({ ...valid, ...input })
  return result.success
    ? []
    : result.error.issues.filter((i) => i.path[0] === field).map((i) => i.message)
}

describe('createVendorRequestSchema', () => {
  it('accepts a valid request and strips a role', () => {
    expect(createVendorRequestSchema.parse({ ...valid, role: 'ADMIN' })).toEqual(valid)
  })

  it('requires a non-blank company name', () => {
    expect(errorsFor({ companyName: '   ' }, 'companyName')).toEqual([
      VALIDATION_CODES.companyNameRequired,
    ])
  })

  it('caps the company name length', () => {
    const name = 'x'.repeat(COMPANY_NAME_MAX_LENGTH)
    expect(errorsFor({ companyName: name }, 'companyName')).toEqual([])
    expect(errorsFor({ companyName: `${name}x` }, 'companyName')).toEqual([
      VALIDATION_CODES.companyNameTooLong,
    ])
  })

  it('applies the client password policy', () => {
    expect(errorsFor({ password: 'short' }, 'password')).toEqual([
      VALIDATION_CODES.passwordTooShort,
    ])
  })
})
