import { randomUUID } from 'node:crypto'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

export type PhotoExtension = 'jpg' | 'png' | 'webp'

/**
 * Where listing photos live. The rest of the app only sees site-relative paths such as
 * `/uploads/placements/<id>/<uuid>.jpg`, so S3-style storage can replace the disk one without a
 * data migration (docs/listing-design.md).
 */
export interface PhotoStorage {
  /** Stores the bytes under a server-chosen name and returns the site-relative path. */
  save: (placementId: string, bytes: Buffer, extension: PhotoExtension) => Promise<string>
  /** Deletes a stored photo. A file that is already gone is not an error. */
  remove: (photoPath: string) => Promise<void>
}

export const UPLOADS_URL_PREFIX = '/uploads'

export function photoPath(placementId: string, file: string): string {
  return `${UPLOADS_URL_PREFIX}/placements/${placementId}/${file}`
}

/** The `:file` of a photo URL as this API generates it. Anything else cannot be one of ours. */
export const PHOTO_FILE_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/

/**
 * Decides the image type from the file's own first bytes. The client's `Content-Type` and filename
 * are attacker-controlled and are never consulted.
 */
export function sniffImageType(bytes: Buffer): PhotoExtension | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg'
  if (
    bytes.length >= 8 &&
    bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'png'
  }
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString('latin1') === 'RIFF' &&
    bytes.subarray(8, 12).toString('latin1') === 'WEBP'
  ) {
    return 'webp'
  }
  return null
}

export class DiskPhotoStorage implements PhotoStorage {
  constructor(private readonly rootDir: string) {}

  async save(placementId: string, bytes: Buffer, extension: PhotoExtension): Promise<string> {
    const file = `${randomUUID()}.${extension}`
    const target = this.resolve(photoPath(placementId, file))
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, bytes)
    return photoPath(placementId, file)
  }

  async remove(photoPathValue: string): Promise<void> {
    await rm(this.resolve(photoPathValue), { force: true })
  }

  /** Maps a site path onto disk, refusing anything that would leave the uploads directory. */
  private resolve(sitePath: string): string {
    const relative = sitePath.slice(UPLOADS_URL_PREFIX.length)
    const target = path.resolve(this.rootDir, `.${relative}`)
    if (
      !sitePath.startsWith(`${UPLOADS_URL_PREFIX}/`) ||
      !target.startsWith(path.resolve(this.rootDir) + path.sep)
    ) {
      throw new Error(`Refusing to touch a path outside the uploads directory: ${sitePath}`)
    }
    return target
  }
}

/**
 * Photos are stored as site-relative paths and become URLs only on the way out, so the host can
 * change without touching the data. A value that is already absolute (seed data) passes through.
 */
export function publicPhotoUrl(stored: string, publicUrl: string): string {
  return stored.startsWith('/') ? `${publicUrl.replace(/\/+$/, '')}${stored}` : stored
}
