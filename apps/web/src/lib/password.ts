// No 0/O, 1/l/I: the admin may read this out to the vendor over the phone.
const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
export const GENERATED_PASSWORD_LENGTH = 16

/** A random password from `crypto.getRandomValues`, never `Math.random`. */
export function generatePassword(length = GENERATED_PASSWORD_LENGTH): string {
  // Rejection sampling: 256 is not a multiple of the alphabet size, and a plain modulo would make
  // the first characters of the alphabet slightly more likely.
  const limit = 256 - (256 % PASSWORD_ALPHABET.length)
  let password = ''
  while (password.length < length) {
    for (const byte of crypto.getRandomValues(new Uint8Array(length * 2))) {
      if (byte < limit && password.length < length) {
        password += PASSWORD_ALPHABET[byte % PASSWORD_ALPHABET.length]
      }
    }
  }
  return password
}
