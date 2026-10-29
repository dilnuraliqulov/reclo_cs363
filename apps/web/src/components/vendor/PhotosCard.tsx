import { LISTING_LIMITS, type VendorPlacement } from '@reclo/shared'
import { useMutation } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useApiErrorHandler } from '@/hooks/useApiErrorHandler'
import { useT } from '@/i18n/useLocale'
import { useMessages } from '@/lib/messages'
import { ACCEPTED_PHOTO_TYPES, checkPhotoFile } from '@/lib/photo-check'
import { deletePlacementPhoto, uploadPlacementPhoto } from '@/lib/vendor-placements'

/** Uploads in flight at once, so eight photos do not open eight connections. */
const UPLOAD_CONCURRENCY = 3

interface PhotosCardProps {
  /** Null on the create page, where there is no listing to attach photos to yet. */
  placement: VendorPlacement | null
  disabled?: boolean
  /** Called with the listing the server returned, so the page's copy stays current. */
  onChange: (placement: VendorPlacement) => void
  /** After a batch of uploads has finished: parallel responses can arrive out of order, so refetch. */
  onSettled?: () => void
}

interface Attempt {
  key: number
  name: string
  state: 'uploading' | 'failed'
  message?: string
}

export function PhotosCard({ placement, disabled, onChange, onSettled }: PhotosCardProps) {
  const t = useT()
  const { apiErrorText } = useMessages()
  const handleError = useApiErrorHandler()
  const inputRef = useRef<HTMLInputElement>(null)
  const nextKey = useRef(0)
  const [attempts, setAttempts] = useState<Attempt[]>([])

  const removal = useMutation({
    mutationFn: (url: string) => deletePlacementPhoto(placement!.id, url),
    onSuccess: onChange,
    onError: handleError,
  })

  const photos = placement?.photos ?? []
  const uploading = attempts.filter((attempt) => attempt.state === 'uploading').length

  function setAttempt(key: number, patch: Partial<Attempt> | null) {
    setAttempts((current) =>
      patch === null
        ? current.filter((attempt) => attempt.key !== key)
        : current.map((attempt) => (attempt.key === key ? { ...attempt, ...patch } : attempt)),
    )
  }

  async function uploadAll(files: File[]) {
    if (!placement) return
    const queue = files.map((file) => ({ file, key: nextKey.current++ }))
    // Built before the workers start: they empty `queue`, and React runs a state updater later.
    const started: Attempt[] = queue.map(({ file, key }) => ({
      key,
      name: file.name,
      state: 'uploading',
    }))
    setAttempts((current) => [...current, ...started])

    const worker = async () => {
      for (let item = queue.shift(); item; item = queue.shift()) {
        try {
          onChange(await uploadPlacementPhoto(placement.id, item.file))
          setAttempt(item.key, null)
        } catch (error) {
          // The server is the authority: its code explains a rejection the pre-check let through.
          setAttempt(item.key, {
            state: 'failed',
            message: t('listing.photos.errorUpload', {
              name: item.file.name,
              reason: apiErrorText(error),
            }),
          })
        }
      }
    }
    await Promise.all(Array.from({ length: UPLOAD_CONCURRENCY }, worker))
    onSettled?.()
  }

  function onFilesChosen(chosen: FileList | null) {
    const files = Array.from(chosen ?? [])
    // Chosen again later, the same file must still fire `change`.
    if (inputRef.current) inputRef.current.value = ''
    if (files.length === 0) return

    const rejected: Attempt[] = []
    const accepted: File[] = []
    let slots = LISTING_LIMITS.maxPhotos - photos.length - uploading
    for (const file of files) {
      const problem = checkPhotoFile(file)
      const reject = (message: string) =>
        rejected.push({ key: nextKey.current++, name: file.name, state: 'failed', message })
      if (problem === 'type') reject(t('listing.photos.errorType', { name: file.name }))
      else if (problem === 'size') reject(t('listing.photos.errorSize', { name: file.name }))
      else if (slots <= 0) {
        reject(t('listing.photos.errorLimit', { max: LISTING_LIMITS.maxPhotos, name: file.name }))
      } else {
        accepted.push(file)
        slots -= 1
      }
    }
    setAttempts((current) => [
      ...current.filter((attempt) => attempt.state !== 'failed'),
      ...rejected,
    ])
    if (accepted.length > 0) void uploadAll(accepted)
  }

  const full = photos.length + uploading >= LISTING_LIMITS.maxPhotos

  return (
    <Card role="group" aria-labelledby="listing-photos-title">
      <CardHeader>
        <CardTitle id="listing-photos-title">{t('listing.editor.photos')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!placement ? (
          <p className="text-sm text-muted-foreground">{t('listing.photos.saveFirst')}</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                variant="outline"
                disabled={disabled || full}
                onClick={() => inputRef.current?.click()}
              >
                {t('listing.photos.add')}
              </Button>
              <input
                ref={inputRef}
                type="file"
                multiple
                hidden
                data-testid="photo-input"
                accept={ACCEPTED_PHOTO_TYPES.join(',')}
                onChange={(event) => onFilesChosen(event.target.files)}
              />
              <span className="text-sm tabular-nums" aria-live="polite">
                {t('listing.photos.counter', {
                  count: photos.length,
                  max: LISTING_LIMITS.maxPhotos,
                })}
              </span>
              <span className="text-xs text-muted-foreground">{t('listing.photos.hint')}</span>
            </div>

            {(photos.length > 0 || attempts.length > 0) && (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {photos.map((url, index) => (
                  <li key={url} className="relative">
                    <img
                      src={url}
                      alt={t('listing.photos.alt', { n: index + 1 })}
                      className="aspect-video w-full rounded-md object-cover"
                    />
                    {index === 0 && (
                      <Badge className="absolute bottom-1 left-1">
                        {t('listing.photos.cover')}
                      </Badge>
                    )}
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon"
                      className="absolute top-1 right-1 size-8"
                      disabled={disabled || removal.isPending}
                      aria-label={t('listing.photos.remove', { n: index + 1 })}
                      onClick={() => removal.mutate(url)}
                    >
                      <X aria-hidden />
                    </Button>
                  </li>
                ))}
                {attempts.map((attempt) => (
                  <li key={attempt.key}>
                    {attempt.state === 'uploading' ? (
                      <Skeleton
                        className="aspect-video w-full rounded-md"
                        role="status"
                        aria-label={t('listing.photos.uploading', { name: attempt.name })}
                      />
                    ) : (
                      <p role="alert" className="text-xs text-destructive">
                        {attempt.message}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
