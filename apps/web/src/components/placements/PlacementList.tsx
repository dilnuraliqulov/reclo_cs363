import { useEffect, useRef } from 'react'
import type { PlacementMarker } from '@reclo/shared'
import { AlertCircle, MapPinOff, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { PlacementCard } from '@/components/placements/PlacementCard'

interface PlacementListProps {
  markers: PlacementMarker[]
  total?: number
  selectedMarkerId?: string | null
  isLoading?: boolean
  error?: Error | null
  onSelectMarker: (marker: PlacementMarker) => void
  onViewDetails: (marker: PlacementMarker) => void
  onResetFilters?: () => void
  hasActiveFilters?: boolean
  onRetry?: () => void
}

export function PlacementList({
  markers,
  total,
  selectedMarkerId,
  isLoading = false,
  error = null,
  onSelectMarker,
  onViewDetails,
  onResetFilters,
  hasActiveFilters = false,
  onRetry,
}: PlacementListProps) {
  const listContainerRef = useRef<HTMLDivElement | null>(null)

  // Scroll to selected card when selected
  useEffect(() => {
    if (!selectedMarkerId || !listContainerRef.current) return
    const cardEl = listContainerRef.current.querySelector(
      `[data-testid="placement-card-${selectedMarkerId}"]`,
    )
    if (cardEl) {
      cardEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [selectedMarkerId])

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header bar */}
      <div className="p-3 border-b border-border/60 flex items-center justify-between text-xs text-muted-foreground bg-background shrink-0">
        <span className="font-medium text-foreground">
          {isLoading ? (
            'Searching placements…'
          ) : (
            <>
              <strong className="text-foreground font-semibold">{total ?? markers.length}</strong>{' '}
              {markers.length === 1 ? 'placement' : 'placements'} in this area
            </>
          )}
        </span>
      </div>

      {/* Content Feed */}
      <div
        ref={listContainerRef}
        className="flex-1 overflow-y-auto p-3 space-y-3 divide-y divide-transparent"
      >
        {/* Error State */}
        {error && (
          <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-center space-y-2">
            <AlertCircle className="w-8 h-8 mx-auto opacity-80" />
            <p className="text-xs font-semibold">Failed to load placements</p>
            <p className="text-[11px] opacity-90">{error.message}</p>
            {onRetry && (
              <Button
                size="sm"
                variant="outline"
                className="mt-2 text-xs border-destructive/30"
                onClick={onRetry}
              >
                <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                Retry
              </Button>
            )}
          </div>
        )}

        {/* Loading Skeletons */}
        {isLoading && !error && (
          <div className="space-y-3" data-testid="placement-skeletons">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="border rounded-lg p-3 flex flex-col sm:flex-row gap-3 bg-card"
              >
                <Skeleton className="w-full sm:w-28 h-28 rounded-md shrink-0" />
                <div className="flex-1 space-y-2 py-1">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                  <div className="pt-4 flex justify-between items-center">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-7 w-28 rounded" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty State */}
        {!isLoading && !error && markers.length === 0 && (
          <div
            data-testid="placement-empty-state"
            className="h-64 flex flex-col items-center justify-center text-center p-6 space-y-3 text-muted-foreground"
          >
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
              <MapPinOff className="w-6 h-6 text-muted-foreground/60" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-foreground">No placements in this area</h4>
              <p className="text-xs mt-1 max-w-xs">
                Try zooming out, panning the map to Tashkent center, or clearing your active
                filters.
              </p>
            </div>
            {hasActiveFilters && onResetFilters && (
              <Button variant="outline" size="sm" className="text-xs mt-2" onClick={onResetFilters}>
                Reset filters
              </Button>
            )}
          </div>
        )}

        {/* Loaded Cards */}
        {!isLoading &&
          !error &&
          markers.map((marker) => (
            <PlacementCard
              key={marker.id}
              marker={marker}
              isSelected={marker.id === selectedMarkerId}
              onSelect={onSelectMarker}
              onViewDetails={onViewDetails}
            />
          ))}
      </div>
    </div>
  )
}
