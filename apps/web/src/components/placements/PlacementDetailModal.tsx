import type { PlacementMarker } from '@reclo/shared'
import { Calendar, Compass, DollarSign, ImageOff, MapPin, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
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
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function PlacementDetailModal({ marker, open, onOpenChange }: PlacementDetailModalProps) {
  if (!marker) return null

  const typeColor = getPlacementTypeColor(marker.type)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <Badge className={typeColor.bg}>{formatPlacementType(marker.type)}</Badge>
            <Badge variant="outline" className="text-emerald-600 border-emerald-300">
              {marker.status}
            </Badge>
          </div>
          <DialogTitle className="text-lg font-bold">{marker.title}</DialogTitle>
          <DialogDescription className="flex items-center gap-1 text-xs">
            <MapPin className="w-3.5 h-3.5 shrink-0" />
            {marker.address}, {marker.city}
          </DialogDescription>
        </DialogHeader>

        {/* Image Preview */}
        <div className="relative aspect-video w-full rounded-md overflow-hidden bg-muted flex items-center justify-center my-2">
          {marker.photo ? (
            <img src={marker.photo} alt={marker.title} className="w-full h-full object-cover" />
          ) : (
            <div className="flex flex-col items-center justify-center text-muted-foreground p-4">
              <ImageOff className="w-8 h-8 mb-2 opacity-50" />
              <span className="text-xs">No preview photo available</span>
            </div>
          )}
        </div>

        {/* Specs & Pricing */}
        <div className="space-y-2.5 text-xs border rounded-lg p-3 bg-muted/20">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5 text-primary" />
              Monthly rate
            </span>
            <span className="font-semibold text-sm text-foreground">
              {formatPrice(marker.pricePerMonth)}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-muted-foreground flex items-center gap-1.5">
              <Compass className="w-3.5 h-3.5 text-primary" />
              Coordinates
            </span>
            <span className="font-mono text-muted-foreground">
              {marker.latitude.toFixed(5)}, {marker.longitude.toFixed(5)}
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
          <Button
            className="gap-1.5"
            onClick={() => {
              // The vendor inquiry flow lands with KAN-8 / KAN-34.
              toast.info('Sending inquiries to vendors is coming soon.')
            }}
          >
            <Sparkles className="w-4 h-4" />
            Inquire / Reserve
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
