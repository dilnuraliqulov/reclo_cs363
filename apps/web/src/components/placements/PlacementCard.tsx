import { useState } from 'react'
import type { PlacementMarker } from '@reclo/shared'
import { MapPin, Navigation, Eye, ImageOff } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { formatPrice, formatPlacementType, getPlacementTypeColor } from '@/lib/placements'
import { cn } from '@/lib/utils'

interface PlacementCardProps {
  marker: PlacementMarker
  isSelected?: boolean
  onSelect?: (marker: PlacementMarker) => void
  onViewDetails?: (marker: PlacementMarker) => void
}

export function PlacementCard({
  marker,
  isSelected = false,
  onSelect,
  onViewDetails,
}: PlacementCardProps) {
  const [imageError, setImageError] = useState(false)
  const typeColors = getPlacementTypeColor(marker.type)

  return (
    <Card
      data-testid={`placement-card-${marker.id}`}
      onClick={() => onSelect?.(marker)}
      className={cn(
        'group cursor-pointer transition-all hover:shadow-md border-border/80 overflow-hidden',
        isSelected && 'border-primary ring-2 ring-primary/20 shadow-md bg-accent/20',
      )}
    >
      <div className="flex flex-col sm:flex-row gap-3 p-3">
        {/* Thumbnail */}
        <div className="relative aspect-video sm:aspect-square w-full sm:w-28 sm:h-28 shrink-0 rounded-md overflow-hidden bg-muted flex items-center justify-center">
          {marker.photo && !imageError ? (
            <img
              src={marker.photo}
              alt={marker.title}
              loading="lazy"
              onError={() => setImageError(true)}
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="flex flex-col items-center justify-center text-muted-foreground p-2 text-center">
              <ImageOff className="w-6 h-6 mb-1 opacity-60" />
              <span className="text-[10px]">No photo</span>
            </div>
          )}
          <Badge
            className={cn(
              'absolute top-1.5 left-1.5 text-[10px] px-1.5 py-0 font-medium shadow-xs',
              typeColors.bg,
            )}
          >
            {formatPlacementType(marker.type)}
          </Badge>
        </div>

        {/* Content */}
        <div className="flex flex-col justify-between flex-1 min-w-0">
          <div>
            <h3 className="font-semibold text-sm line-clamp-1 group-hover:text-primary transition-colors">
              {marker.title}
            </h3>
            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1 line-clamp-1">
              <MapPin className="w-3 h-3 shrink-0" />
              <span>
                {marker.address}, {marker.city}
              </span>
            </p>
          </div>

          <div className="mt-2.5 pt-2 border-t border-border/50 flex items-center justify-between gap-2">
            <div>
              <span className="text-xs text-muted-foreground block">Price</span>
              <span className="text-sm font-bold text-foreground">
                {formatPrice(marker.pricePerMonth)}
              </span>
              <span className="text-[10px] text-muted-foreground ml-1">/mo</span>
            </div>

            <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={() => onSelect?.(marker)}
                title="Center on map"
              >
                <Navigation className="w-3.5 h-3.5 mr-1" />
                Map
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs"
                onClick={() => onViewDetails?.(marker)}
              >
                <Eye className="w-3.5 h-3.5 mr-1" />
                Details
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Card>
  )
}
