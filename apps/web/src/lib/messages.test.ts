import { errorCodeSchema, VALIDATION_CODES, validationCodeSchema } from '@reclo/shared'
import { describe, expect, it } from 'vitest'
import { ApiRequestError } from './api'
import { apiErrorText, fieldError, fieldErrorText } from './messages'

describe('apiErrorText', () => {
  it('prefers the code over the English string the response carried', () => {
    const error = new ApiRequestError(
      401,
      'Not authenticated',
      undefined,
      null,
      'INVALID_CREDENTIALS',
    )

    expect(apiErrorText(error)).toBe('Invalid email or password')
  })

  it('falls back to the response string when there is no code', () => {
    // A route that has not been migrated, or an older server.
    const error = new ApiRequestError(500, 'Something specific went wrong')

    expect(apiErrorText(error)).toBe('Something specific went wrong')
  })

  it('falls back for a plain error, such as a network failure', () => {
    expect(apiErrorText(new Error('Cannot reach the server'))).toBe('Cannot reach the server')
  })

  it('never returns an empty string, even for something that is not an error', () => {
    expect(apiErrorText('nonsense')).toBe('Something went wrong')
  })

  it('has words for every code the API can send', () => {
    // The table is exhaustive at compile time; this catches an entry left as an empty string.
    for (const code of errorCodeSchema.options) {
      const text = apiErrorText(new ApiRequestError(400, 'fallback', undefined, null, code))
      expect(text.length).toBeGreaterThan(0)
      expect(text).not.toBe(code)
    }
  })
})

describe('fieldErrorText', () => {
  it('turns a validation code into the sentence for this locale', () => {
    expect(fieldErrorText(VALIDATION_CODES.phoneUz)).toBe(
      'Enter a valid Uzbek number, e.g. +998 90 123 45 67',
    )
  })

  it('regains the interpolation the code dropped on the wire', () => {
    // The bound is read back from the shared constant rather than written into the message.
    expect(fieldErrorText(VALIDATION_CODES.messageTooShort)).toBe(
      'Message must be at least 10 characters',
    )
  })

  it('passes a sentence through, since Zod built-ins were never customised', () => {
    expect(fieldErrorText('Invalid input')).toBe('Invalid input')
  })

  it('leaves undefined alone, so a valid field renders nothing', () => {
    expect(fieldErrorText(undefined)).toBeUndefined()
  })

  it('has words for every validation code a shared schema can produce', () => {
    for (const code of validationCodeSchema.options) {
      const text = fieldErrorText(code)
      expect(text).toBeTruthy()
      // A code reaching the screen is the failure this whole table exists to prevent.
      expect(text).not.toBe(code)
    }
  })
})

describe('fieldError', () => {
  it('wraps the text in the shape FieldError takes', () => {
    expect(fieldError({ message: VALIDATION_CODES.nameRequired })).toEqual({
      message: 'Enter your name',
    })
  })

  it('tolerates a missing error object', () => {
    expect(fieldError(undefined)).toEqual({ message: undefined })
  })
})
