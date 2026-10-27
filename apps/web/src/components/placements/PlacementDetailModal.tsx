import { useState } from 'react'
import type { PlacementDetail, PlacementMarker } from '@reclo/shared'
import { Calendar, Compass, DollarSign, ImageOff, MapPin, Sparkles } from 'lucide-react'
import { InquiryFormDialog } from '@/components/inquiries/InquiryFormDialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { formatPrice, formatPlacementType, getPlacementTypeColor } from '@/lib/placements'

interface PlacementDetailModalProps {
  marker: PlacementMarker | null
  detail: PlacementDetail | null
  isDetailLoading?: boolean
  detailError?: Error | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

function getTierBadgeClass(tier: PlacementDetail['tier']): string {
  switch (tier) {
    case 'GOLD':
      return 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300'
    case 'SILVER':
      return 'bg-slate-100 text-slate-800 dark:bg-slate-800/70 dark:text-slate-200'
    case 'BRONZE':
      return 'bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-300'
  }
}

export function PlacementDetailModal({
  marker,
  detail,
  isDetailLoading = false,
  detailError = null,
  open,
  onOpenChange,
}: PlacementDetailModalProps) {
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(0)
  const [isInquiryOpen, setIsInquiryOpen] = useState(false)
  if (!marker) return null
  const typeColor = getPlacementTypeColor(detail?.type ?? marker.type)
  const photos = detail?.photos.length ? detail.photos : marker.photo ? [marker.photo] : []
  const safeSelectedPhotoIndex = selectedPhotoIndex < photos.length ? selectedPhotoIndex : 0
  const selectedPhoto = photos[safeSelectedPhotoIndex]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <Badge className={typeColor.bg}>
              {formatPlacementType(detail?.type ?? marker.type)}
            </Badge>
            <Badge variant="outline" className="text-emerald-600 border-emerald-300">
              {detail?.status ?? marker.status}
            </Badge>
            {detail && <Badge className={getTierBadgeClass(detail.tier)}>{detail.tier} Tier</Badge>}
          </div>
          <DialogTitle className="text-lg font-bold">{detail?.title ?? marker.title}</DialogTitle>
          <DialogDescription className="flex items-center gap-1 text-xs">
            <MapPin className="w-3.5 h-3.5 shrink-0" />
            {detail?.address ?? marker.address}, {detail?.city ?? marker.city}
          </DialogDescription>
        </DialogHeader>

        {/* Image Preview */}
        <div className="relative aspect-video w-full rounded-md overflow-hidden bg-muted flex items-center justify-center my-2">
          {selectedPhoto ? (
            <img
              src={selectedPhoto}
              alt={detail?.title ?? marker.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="flex flex-col items-center justify-center text-muted-foreground p-4">
              <ImageOff className="w-8 h-8 mb-2 opacity-50" />
              <span className="text-xs">No preview photo available</span>
            </div>
          )}
        </div>
        {photos.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {photos.map((photo, index) => (
              <button
                key={photo}
                type="button"
                onClick={() => setSelectedPhotoIndex(index)}
                className="rounded-md overflow-hidden border border-border/70 data-[active=true]:ring-2 data-[active=true]:ring-primary"
                data-active={safeSelectedPhotoIndex === index}
                aria-label={`Show photo ${index + 1}`}
              >
                <img
                  src={photo}
                  alt={`Placement photo ${index + 1}`}
                  className="w-14 h-14 object-cover"
                />
              </button>
            ))}
          </div>
        )}

        {/* Specs & Pricing */}
        <div className="space-y-2.5 text-xs border rounded-lg p-3 bg-muted/20">
          {isDetailLoading && <p className="text-muted-foreground">Loading placement details…</p>}
          {detailError && !isDetailLoading && (
            <p className="text-destructive">Could not load full details. Showing map data.</p>
          )}
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5 text-primary" />
              Monthly rate
            </span>
            <span className="font-semibold text-sm text-foreground">
              {formatPrice(detail?.pricePerMonth ?? marker.pricePerMonth)}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-muted-foreground flex items-center gap-1.5">
              <Compass className="w-3.5 h-3.5 text-primary" />
              Coordinates
            </span>
            <span className="font-mono text-muted-foreground">
              {(detail?.latitude ?? marker.latitude).toFixed(5)},{' '}
              {(detail?.longitude ?? marker.longitude).toFixed(5)}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-muted-foreground flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-primary" />
              Availability
            </span>
            <span className="text-emerald-600 font-medium">Available now</span>
          </div>
        </div>

        <DialogFooter className="mt-4 flex flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button className="gap-1.5" onClick={() => setIsInquiryOpen(true)}>
            <Sparkles className="w-4 h-4" />
            Inquire / Reserve
          </Button>
        </DialogFooter>

        {/* Stacks over this modal, so the client keeps the placement in view. */}
        {isInquiryOpen && (
          <InquiryFormDialog
            placement={marker}
            open={isInquiryOpen}
            onOpenChange={setIsInquiryOpen}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
