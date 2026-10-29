import { describe, expect, it } from 'vitest'
import { apiErrorSchema, errorCodeSchema, VALIDATION_CODES, validationCodeSchema } from './errors'

describe('apiErrorSchema', () => {
  it('reads a body that carries a code', () => {
    const parsed = apiErrorSchema.parse({ error: 'Not authenticated', code: 'NOT_AUTHENTICATED' })

    expect(parsed.code).toBe('NOT_AUTHENTICATED')
  })

  it('still reads a body with no code, so a route not yet carrying one degrades', () => {
    // `code` is optional for exactly this reason: the client falls back to `error`.
    const parsed = apiErrorSchema.parse({ error: 'Something went wrong' })

    expect(parsed.code).toBeUndefined()
  })

  it('drops a code it does not know, keeping the body and its English sentence', () => {
    // A newer API can send a code this build has never heard of. Failing the whole parse would
    // throw away `error` too and leave the reader with a generic apology, so the unknown code
    // falls away and the sentence survives.
    const parsed = apiErrorSchema.parse({ error: 'Vendor is on holiday', code: 'VENDOR_ON_LEAVE' })

    expect(parsed.code).toBeUndefined()
    expect(parsed.error).toBe('Vendor is on holiday')
  })

  it('still rejects a body with no error sentence at all', () => {
    expect(apiErrorSchema.safeParse({ code: 'INTERNAL' }).success).toBe(false)
  })

  it('keeps field errors alongside the code', () => {
    const parsed = apiErrorSchema.parse({
      error: 'Invalid input',
      code: 'INVALID_INPUT',
      fieldErrors: { email: [VALIDATION_CODES.emailInvalid] },
    })

    expect(parsed.fieldErrors?.email).toEqual([VALIDATION_CODES.emailInvalid])
  })
})

describe('the code enums', () => {
  it('accepts every validation code, so a schema cannot name one the client cannot resolve', () => {
    for (const code of Object.values(VALIDATION_CODES)) {
      expect(validationCodeSchema.safeParse(code).success).toBe(true)
    }
  })

  it('namespaces every validation code under validation.', () => {
    // The web catalogs key on these values, so the prefix is part of the contract.
    for (const code of validationCodeSchema.options) {
      expect(code.startsWith('validation.')).toBe(true)
    }
  })

  it('names no error code in lower case, so the two namespaces cannot be confused', () => {
    for (const code of errorCodeSchema.options) {
      expect(code).toBe(code.toUpperCase())
    }
  })
})
