import { LISTING_LIMITS } from '@reclo/shared'

export const ACCEPTED_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp']

export type PhotoProblem = 'type' | 'size'

/**
 * A pre-check so an obviously bad file never leaves the browser. It trusts the browser's MIME type,
 * which a client can lie about, so the server (which reads the magic bytes) stays the authority.
 */
export function checkPhotoFile(file: Pick<File, 'type' | 'size'>): PhotoProblem | null {
  if (!ACCEPTED_PHOTO_TYPES.includes(file.type)) return 'type'
  if (file.size > LISTING_LIMITS.maxPhotoBytes) return 'size'
  return null
}
