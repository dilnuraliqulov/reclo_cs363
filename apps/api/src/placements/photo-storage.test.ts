import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  DiskPhotoStorage,
  PHOTO_FILE_PATTERN,
  publicPhotoUrl,
  sniffImageType,
} from './photo-storage'

describe('sniffImageType', () => {
  it('recognises JPEG, PNG and WebP by their first bytes', () => {
    expect(sniffImageType(Buffer.from([0xff, 0xd8, 0xff, 0xe1]))).toBe('jpg')
    expect(sniffImageType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(
      'png',
    )
    expect(
      sniffImageType(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP')])),
    ).toBe('webp')
  })

  it.each([
    ['empty', Buffer.alloc(0)],
    ['too short for JPEG', Buffer.from([0xff, 0xd8])],
    ['a truncated PNG signature', Buffer.from([0x89, 0x50, 0x4e, 0x47])],
    ['GIF', Buffer.from('GIF89a')],
    ['SVG text', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')],
    ['PDF', Buffer.from('%PDF-1.7')],
    ['RIFF WAVE', Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVE')])],
  ])('rejects %s', (_label, bytes) => {
    expect(sniffImageType(bytes)).toBeNull()
  })
})

describe('publicPhotoUrl', () => {
  it('prefixes a site path, tolerating a trailing slash on the host', () => {
    expect(publicPhotoUrl('/uploads/p/a.jpg', 'https://api.example.com')).toBe(
      'https://api.example.com/uploads/p/a.jpg',
    )
    expect(publicPhotoUrl('/uploads/p/a.jpg', 'https://api.example.com/')).toBe(
      'https://api.example.com/uploads/p/a.jpg',
    )
  })

  it('leaves an absolute URL alone', () => {
    expect(publicPhotoUrl('https://cdn.example.com/a.jpg', 'https://api.example.com')).toBe(
      'https://cdn.example.com/a.jpg',
    )
  })
})

describe('PHOTO_FILE_PATTERN', () => {
  it('matches only names this API generates', () => {
    expect(PHOTO_FILE_PATTERN.test('0b3f2f0a-7f0e-4a3c-9a43-0d6b1d1b8b11.webp')).toBe(true)
    for (const name of ['a.jpg', '../0b3f2f0a-7f0e-4a3c-9a43-0d6b1d1b8b11.jpg', 'x/y.png', '']) {
      expect(PHOTO_FILE_PATTERN.test(name)).toBe(false)
    }
  })
})

describe('DiskPhotoStorage', () => {
  let root: string
  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'reclo-photos-'))
  })
  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('writes the bytes under placements/<id>/<uuid>.<ext> and returns the site path', async () => {
    const storage = new DiskPhotoStorage(root)

    const sitePath = await storage.save('listing-1', Buffer.from('bytes'), 'png')

    expect(sitePath).toMatch(/^\/uploads\/placements\/listing-1\/[0-9a-f-]{36}\.png$/)
    expect(await readFile(path.join(root, sitePath.slice('/uploads/'.length)), 'utf8')).toBe(
      'bytes',
    )
  })

  it('names two uploads of the same bytes differently', async () => {
    const storage = new DiskPhotoStorage(root)

    const [a, b] = await Promise.all([
      storage.save('listing-1', Buffer.from('x'), 'jpg'),
      storage.save('listing-1', Buffer.from('x'), 'jpg'),
    ])

    expect(a).not.toBe(b)
  })

  it('removes a file, and a file that is already gone is not an error', async () => {
    const storage = new DiskPhotoStorage(root)
    const sitePath = await storage.save('listing-1', Buffer.from('x'), 'jpg')
    const onDisk = path.join(root, sitePath.slice('/uploads/'.length))

    await storage.remove(sitePath)
    await expect(stat(onDisk)).rejects.toThrow()
    await expect(storage.remove(sitePath)).resolves.toBeUndefined()
  })

  it.each([
    '/uploads/../outside.txt',
    '/uploads/placements/../../outside.txt',
    '/etc/passwd',
    'uploads/x.jpg',
  ])('refuses to remove %s, which is outside the uploads directory', async (sitePath) => {
    await expect(new DiskPhotoStorage(root).remove(sitePath)).rejects.toThrow(/outside the uploads/)
  })
})
