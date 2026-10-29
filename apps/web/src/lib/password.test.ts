import { describe, expect, it } from 'vitest'
import { GENERATED_PASSWORD_LENGTH, generatePassword } from './password'

describe('generatePassword', () => {
  it('meets the shared password policy and avoids look-alike characters', () => {
    for (let i = 0; i < 50; i++) {
      const password = generatePassword()
      expect(password).toHaveLength(GENERATED_PASSWORD_LENGTH)
      expect(password).toMatch(/^[A-Za-z2-9]+$/)
      expect(password).not.toMatch(/[0O1lI]/)
    }
  })

  it('does not repeat itself', () => {
    const seen = new Set(Array.from({ length: 100 }, () => generatePassword()))
    expect(seen.size).toBe(100)
  })
})
