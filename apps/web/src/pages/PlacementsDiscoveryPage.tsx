import { useCallback, useMemo, useState } from 'react'
import type { MapBoundsQuery, PlacementMarker } from '@reclo/shared'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Activity, Layers, List, Map as MapIcon } from 'lucide-react'
import { toast } from 'sonner'
import { AuthControls } from '@/components/auth/AuthControls'
import { Button } from '@/components/ui/button'
import { PlacementMap, type MapBounds } from '@/components/map/PlacementMap'
import { PlacementDetailModal } from '@/components/placements/PlacementDetailModal'
import {
  PlacementFilters,
  type PlacementFilterState,
} from '@/components/placements/PlacementFilters'
import { PlacementList } from '@/components/placements/PlacementList'
import { usePlacementMarkers } from '@/hooks/usePlacementMarkers'
import { fetchHealth, fetchPlacementDetail } from '@/lib/api'
import { cn } from '@/lib/utils'

export function PlacementsDiscoveryPage() {
  // Map viewport bounds
  const [bounds, setBounds] = useState<MapBounds | null>(null)

  // Leaflet reports bounds as a fresh object on every pan, so keep the previous
  // state when the viewport has not actually moved and avoid a needless render.
  const handleBoundsChange = useCallback((next: MapBounds) => {
    setBounds((prev) =>
      prev &&
      prev.minLat === next.minLat &&
      prev.maxLat === next.maxLat &&
      prev.minLng === next.minLng &&
      prev.maxLng === next.maxLng
        ? prev
        : next,
    )
  }, [])

  // Filter state
  const [filters, setFilters] = useState<PlacementFilterState>({
    type: undefined,
    city: '',
    minPrice: '',
    maxPrice: '',
  })

  // Selected marker (active in list & highlighted on map)
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null)

  // Detail Modal
  const [detailMarker, setDetailMarker] = useState<PlacementMarker | null>(null)
  const [isDetailOpen, setIsDetailOpen] = useState(false)

  // Mobile tab view
  const [mobileView, setMobileView] = useState<'map' | 'list'>('map')

  // API Health mutation
  const healthCheck = useMutation({
    mutationFn: fetchHealth,
    onSuccess: () => toast.success('API and database are reachable'),
    onError: (error) => toast.error(`Health check failed: ${error.message}`),
  })

  // Has active filters
  const hasActiveFilters = Boolean(
    filters.type ||
    filters.city.trim() !== '' ||
    filters.minPrice.trim() !== '' ||
    filters.maxPrice.trim() !== '',
  )

  const handleResetFilters = () => {
    setFilters({
      type: undefined,
      city: '',
      minPrice: '',
      maxPrice: '',
    })
  }

  // Combined bounds query
  const queryParams = useMemo<MapBoundsQuery | null>(() => {
    if (!bounds) return null

    const query: MapBoundsQuery = {
      minLat: bounds.minLat,
      maxLat: bounds.maxLat,
      minLng: bounds.minLng,
      maxLng: bounds.maxLng,
    }

    if (filters.type) query.type = filters.type
    if (filters.city.trim()) query.city = filters.city.trim()
    if (filters.minPrice.trim()) {
      const min = parseInt(filters.minPrice, 10)
      if (!isNaN(min) && min >= 0) query.minPrice = min
    }
    if (filters.maxPrice.trim()) {
      const max = parseInt(filters.maxPrice, 10)
      if (!isNaN(max) && max > 0) query.maxPrice = max
    }

    return query
  }, [bounds, filters])

  // Placement markers query
  const { data, isLoading, error, refetch } = usePlacementMarkers(queryParams, {
    enabled: Boolean(bounds),
  })

  // A stable array identity keeps the map from rebuilding its pins (and closing
  // an open popup) on unrelated re-renders.
  const markers = useMemo(() => data?.markers ?? [], [data])
  const total = data?.total

  const handleSelectMarker = useCallback((marker: PlacementMarker) => {
    setSelectedMarkerId(marker.id)
  }, [])

  const handleViewDetails = useCallback((marker: PlacementMarker) => {
    setDetailMarker(marker)
    setIsDetailOpen(true)
  }, [])

  const detailQuery = useQuery({
    queryKey: ['placements', 'detail', detailMarker?.id],
    queryFn: () => {
      if (!detailMarker) throw new Error('Placement id is required')
      return fetchPlacementDetail(detailMarker.id)
    },
    enabled: Boolean(detailMarker && isDetailOpen),
    staleTime: 1000 * 30,
  })

  return (
    <div className="flex flex-col h-screen w-full overflow-hidden bg-background">
      {/* Top Navigation Bar */}
      <header className="h-14 border-b border-border/80 px-4 flex items-center justify-between shrink-0 bg-background/95 backdrop-blur-sm z-30">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 font-bold text-lg tracking-tight">
            <span className="w-8 h-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center shadow-xs">
              <Layers className="w-4 h-4" />
            </span>
            <span>Reclo</span>
          </div>
          <span className="hidden sm:inline-block text-xs text-muted-foreground border-l pl-3 border-border/60">
            Outdoor Advertising Marketplace
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Mobile view switch */}
          <div className="flex md:hidden border rounded-lg p-0.5 bg-muted/40">
            <Button
              size="sm"
              variant={mobileView === 'map' ? 'default' : 'ghost'}
              className="h-7 text-xs px-2.5"
              onClick={() => setMobileView('map')}
            >
              <MapIcon className="w-3.5 h-3.5 mr-1" />
              Map
            </Button>
            <Button
              size="sm"
              variant={mobileView === 'list' ? 'default' : 'ghost'}
              className="h-7 text-xs px-2.5"
              onClick={() => setMobileView('list')}
            >
              <List className="w-3.5 h-3.5 mr-1" />
              List ({markers.length})
            </Button>
          </div>

          {/* Health Check Button */}
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => healthCheck.mutate()}
            disabled={healthCheck.isPending}
            title="Verify API connection"
          >
            <Activity className="w-3.5 h-3.5 mr-1 text-emerald-600" />
            {healthCheck.isPending ? 'Checking…' : 'Check API'}
          </Button>

          <AuthControls />
        </div>
      </header>

      {/* Main Split View */}
      <main className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden relative">
        {/* Left Sidebar (Listing feed & filters) */}
        <section
          className={cn(
            'w-full md:w-[420px] lg:w-[480px] h-full flex flex-col border-r border-border/80 bg-background shrink-0 z-20',
            mobileView === 'map' && 'hidden md:flex',
            mobileView === 'list' && 'flex',
          )}
        >
          {/* Filters Area */}
          <div className="p-3 border-b border-border/60">
            <PlacementFilters
              filters={filters}
              onChange={setFilters}
              onReset={handleResetFilters}
              hasActiveFilters={hasActiveFilters}
            />
          </div>

          {/* Cards List */}
          <div className="flex-1 min-h-0">
            <PlacementList
              markers={markers}
              total={total}
              selectedMarkerId={selectedMarkerId}
              isLoading={isLoading}
              error={error}
              onSelectMarker={handleSelectMarker}
              onViewDetails={handleViewDetails}
              onResetFilters={handleResetFilters}
              hasActiveFilters={hasActiveFilters}
              onRetry={() => refetch()}
            />
          </div>
        </section>

        {/* Right Canvas (Leaflet interactive map) */}
        <section
          className={cn('flex-1 h-full relative z-10', mobileView === 'list' && 'hidden md:block')}
        >
          <PlacementMap
            markers={markers}
            selectedMarkerId={selectedMarkerId}
            onSelectMarker={handleSelectMarker}
            onViewDetails={handleViewDetails}
            onBoundsChange={handleBoundsChange}
            isLoading={isLoading}
          />
        </section>
      </main>

      {/* Detail Modal */}
      <PlacementDetailModal
        marker={detailMarker}
        detail={detailQuery.data ?? null}
        isDetailLoading={detailQuery.isLoading}
        detailError={detailQuery.error ?? null}
        open={isDetailOpen}
        onOpenChange={setIsDetailOpen}
      />
    </div>
  )
}
