import { useCallback, useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet.markercluster'
import type { MapBoundsQuery, PlacementMarker } from '@reclo/shared'
import { Check, Compass, Loader2, Minus, Plus, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  formatCompactPrice,
  formatPrice,
  formatPlacementType,
  getPlacementTypeColor,
} from '@/lib/placements'
import { DEFAULT_ZOOM, TASHKENT_CENTER, UZBEKISTAN_BOUNDS } from '@/lib/map-config'
import { cn } from '@/lib/utils'

const BOUNDS_DEBOUNCE_MS = 300

// Nearby pins collapse into a counted cluster until the map is zoomed in far
// enough that individual placements stop overlapping.
const CLUSTER_RADIUS_PX = 60
const DISABLE_CLUSTERING_AT_ZOOM = 17

export type MapBounds = Pick<MapBoundsQuery, 'minLat' | 'maxLat' | 'minLng' | 'maxLng'>

// Leaflet builds pins and popups from HTML strings, so placement text (which is
// vendor-supplied) has to be escaped before it is interpolated into them.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function createClusterIcon(cluster: L.MarkerCluster): L.DivIcon {
  const count = cluster.getChildCount()
  const size = count >= 100 ? 48 : count >= 10 ? 42 : 36

  return L.divIcon({
    html: `
      <div class="flex items-center justify-center w-full h-full rounded-full border-2 border-primary/30 bg-primary text-primary-foreground font-bold shadow-lg transition-transform duration-200 hover:scale-110 ${
        count >= 100 ? 'text-sm' : 'text-xs'
      }">
        ${count}
      </div>
    `,
    className: 'reclo-custom-marker',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

function createPinIcon(marker: PlacementMarker, isSelected: boolean): L.DivIcon {
  const typeColor = getPlacementTypeColor(marker.type)

  return L.divIcon({
    html: `
      <div class="reclo-pin-wrapper cursor-pointer select-none transition-transform duration-200 hover:scale-110 ${
        isSelected ? 'scale-110 z-50' : ''
      }">
        <div class="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold shadow-md border ${
          isSelected
            ? 'bg-primary text-primary-foreground border-primary ring-2 ring-primary ring-offset-2'
            : 'bg-background text-foreground border-border hover:bg-muted'
        }">
          <span class="w-2 h-2 rounded-full ${typeColor.dot}"></span>
          <span>${escapeHtml(formatCompactPrice(marker.pricePerMonth))}</span>
        </div>
      </div>
    `,
    className: 'reclo-custom-marker',
    iconSize: [80, 30],
    iconAnchor: [40, 15],
    popupAnchor: [0, -18],
  })
}

function createPopupHtml(marker: PlacementMarker): string {
  const title = escapeHtml(marker.title)

  return `
    <div class="p-1 max-w-[220px] text-left font-sans">
      ${
        marker.photo
          ? `<div class="aspect-video w-full rounded overflow-hidden mb-2 bg-muted">
               <img src="${escapeHtml(marker.photo)}" alt="${title}" class="w-full h-full object-cover" />
             </div>`
          : ''
      }
      <div class="text-[10px] font-semibold tracking-wide uppercase text-muted-foreground mb-0.5">
        ${escapeHtml(formatPlacementType(marker.type))}
      </div>
      <div class="text-xs font-bold text-foreground line-clamp-1 mb-1">
        ${title}
      </div>
      <div class="text-[11px] text-muted-foreground line-clamp-1 mb-2">
        ${escapeHtml(`${marker.address}, ${marker.city}`)}
      </div>
      <div class="flex items-center justify-between border-t border-border/50 pt-1.5 mt-1">
        <span class="text-xs font-extrabold text-foreground">${escapeHtml(
          formatPrice(marker.pricePerMonth),
        )}<span class="text-[9px] font-normal text-muted-foreground">/mo</span></span>
        <button
          type="button"
          data-view-placement-id="${escapeHtml(marker.id)}"
          class="px-2 py-1 bg-primary text-primary-foreground rounded text-[11px] font-medium hover:opacity-90 transition-opacity"
        >
          Details
        </button>
      </div>
    </div>
  `
}

interface PlacementMapProps {
  markers: PlacementMarker[]
  selectedMarkerId?: string | null
  onSelectMarker?: (marker: PlacementMarker) => void
  onViewDetails?: (marker: PlacementMarker) => void
  onBoundsChange: (bounds: MapBounds) => void
  isLoading?: boolean
  className?: string
}

export function PlacementMap({
  markers,
  selectedMarkerId,
  onSelectMarker,
  onViewDetails,
  onBoundsChange,
  isLoading = false,
  className,
}: PlacementMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<L.Map | null>(null)
  const markersLayerRef = useRef<L.MarkerClusterGroup | null>(null)
  const markerMapRef = useRef<Map<string, L.Marker>>(new Map())
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [searchAsIMove, setSearchAsIMove] = useState(true)
  const [hasPendingMove, setHasPendingMove] = useState(false)
  const [currentZoom, setCurrentZoom] = useState(DEFAULT_ZOOM)

  // The Leaflet instance is created once and never torn down on prop changes.
  // Its event handlers read the latest props and state through these refs, so a
  // new marker list or a toggled setting never rebuilds the map.
  const markersRef = useRef(markers)
  const onBoundsChangeRef = useRef(onBoundsChange)
  const onSelectMarkerRef = useRef(onSelectMarker)
  const onViewDetailsRef = useRef(onViewDetails)
  const searchAsIMoveRef = useRef(searchAsIMove)

  useEffect(() => {
    markersRef.current = markers
    onBoundsChangeRef.current = onBoundsChange
    onSelectMarkerRef.current = onSelectMarker
    onViewDetailsRef.current = onViewDetails
    searchAsIMoveRef.current = searchAsIMove
  })

  const emitBounds = useCallback((map: L.Map) => {
    const b = map.getBounds()
    onBoundsChangeRef.current({
      minLat: Number(b.getSouth().toFixed(6)),
      maxLat: Number(b.getNorth().toFixed(6)),
      minLng: Number(b.getWest().toFixed(6)),
      maxLng: Number(b.getEast().toFixed(6)),
    })
    setHasPendingMove(false)
  }, [])

  // Initialize the map (once)
  useEffect(() => {
    const container = containerRef.current
    if (!container || mapRef.current) return

    const map = L.map(container, {
      center: TASHKENT_CENTER,
      zoom: DEFAULT_ZOOM,
      zoomControl: false, // We use custom styled controls
      maxBounds: UZBEKISTAN_BOUNDS,
      maxBoundsViscosity: 0.8,
      minZoom: 6,
      maxZoom: 18,
    })

    // Standard OpenStreetMap tiles
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
    }).addTo(map)

    markersLayerRef.current = L.markerClusterGroup({
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: true,
      maxClusterRadius: CLUSTER_RADIUS_PX,
      disableClusteringAtZoom: DISABLE_CLUSTERING_AT_ZOOM,
      iconCreateFunction: createClusterIcon,
    }).addTo(map)
    mapRef.current = map

    // Initial bounds notification after map is ready
    map.whenReady(() => {
      emitBounds(map)
    })

    const handleMoveEnd = () => {
      setCurrentZoom(map.getZoom())
      if (!searchAsIMoveRef.current) {
        setHasPendingMove(true)
        return
      }
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
      debounceTimerRef.current = setTimeout(() => emitBounds(map), BOUNDS_DEBOUNCE_MS)
    }

    map.on('moveend', handleMoveEnd)

    // Handle popup "Details" button clicks via delegation
    const handlePopupClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null
      const button = target?.closest('button[data-view-placement-id]')
      if (!button) return
      const id = button.getAttribute('data-view-placement-id')
      const matched = markersRef.current.find((m) => m.id === id)
      if (matched) onViewDetailsRef.current?.(matched)
    }
    container.addEventListener('click', handlePopupClick)

    const markerLookup = markerMapRef.current

    return () => {
      container.removeEventListener('click', handlePopupClick)
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
      map.off('moveend', handleMoveEnd)
      map.remove()
      mapRef.current = null
      markersLayerRef.current = null
      markerLookup.clear()
    }
  }, [emitBounds])

  // Render pins for the current marker list and selection
  useEffect(() => {
    const layer = markersLayerRef.current
    if (!layer) return

    layer.clearLayers()
    markerMapRef.current.clear()

    const leafletMarkers = markers.map((marker) => {
      const leafletMarker = L.marker([marker.latitude, marker.longitude], {
        icon: createPinIcon(marker, marker.id === selectedMarkerId),
        title: marker.title,
      })

      leafletMarker.bindPopup(createPopupHtml(marker), {
        closeButton: true,
        className: 'reclo-custom-popup',
      })

      leafletMarker.on('click', () => {
        onSelectMarkerRef.current?.(marker)
      })

      markerMapRef.current.set(marker.id, leafletMarker)
      return leafletMarker
    })

    // Bulk insert so the cluster group indexes the whole viewport in one pass.
    layer.addLayers(leafletMarkers)
  }, [markers, selectedMarkerId])

  // Pan to a newly selected marker, and keep its popup open across pin rebuilds.
  // Panning is tied to the selection changing, not to the marker list, so a
  // refetch never drags the viewport back off whatever the user is looking at.
  const pannedToRef = useRef<string | null>(null)
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (!selectedMarkerId) {
      pannedToRef.current = null
      return
    }

    const marker = markerMapRef.current.get(selectedMarkerId)
    if (!marker) return

    const openPopup = () => {
      if (!marker.isPopupOpen()) {
        marker.openPopup()
      }
    }

    if (pannedToRef.current !== selectedMarkerId) {
      pannedToRef.current = selectedMarkerId
      // The pin may be collapsed inside a cluster, so zoom until it is visible
      // before opening its popup.
      markersLayerRef.current?.zoomToShowLayer(marker, openPopup)
      return
    }

    openPopup()
  }, [selectedMarkerId, markers])

  // Zoom controls
  const handleZoomIn = () => mapRef.current?.zoomIn()
  const handleZoomOut = () => mapRef.current?.zoomOut()
  const handleRecenter = () => {
    mapRef.current?.setView(TASHKENT_CENTER, DEFAULT_ZOOM, { animate: true })
  }

  const handleManualSearch = () => {
    if (mapRef.current) {
      emitBounds(mapRef.current)
    }
  }

  return (
    <div
      data-testid="placement-map-container"
      className={cn('relative w-full h-full overflow-hidden bg-muted/20', className)}
    >
      {/* Map DOM Element */}
      <div ref={containerRef} className="w-full h-full z-0" />

      {/* Loading Indicator Overlay */}
      {isLoading && (
        <div className="absolute top-4 left-4 z-[500] bg-background/90 backdrop-blur-sm px-3 py-1.5 rounded-full shadow-md border border-border flex items-center gap-2 text-xs font-medium">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
          <span>Updating placements…</span>
        </div>
      )}

      {/* Floating Action Button: Search this area */}
      {hasPendingMove && !searchAsIMove && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[500] animate-in fade-in slide-in-from-top-2 duration-200">
          <Button
            size="sm"
            onClick={handleManualSearch}
            className="shadow-lg gap-1.5 rounded-full px-4 text-xs font-semibold"
          >
            <Search className="w-3.5 h-3.5" />
            Search this area
          </Button>
        </div>
      )}

      {/* Top-Right Map Controls */}
      <div className="absolute top-4 right-4 z-[500] flex flex-col gap-1.5">
        <div className="bg-background/90 backdrop-blur-sm rounded-lg shadow-md border border-border p-1 flex flex-col gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={handleZoomIn}
            title="Zoom in"
          >
            <Plus className="w-4 h-4" />
          </Button>
          <div className="h-px bg-border/60 mx-1" />
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={handleZoomOut}
            title="Zoom out"
          >
            <Minus className="w-4 h-4" />
          </Button>
        </div>

        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9 bg-background/90 backdrop-blur-sm shadow-md"
          onClick={handleRecenter}
          title="Recenter to Tashkent"
        >
          <Compass className="w-4 h-4 text-primary" />
        </Button>
      </div>

      {/* Bottom-Right "Search as I move" Toggle */}
      <div className="absolute bottom-4 right-4 z-[500] bg-background/90 backdrop-blur-sm px-3 py-1.5 rounded-full shadow-md border border-border flex items-center gap-2 text-xs">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={searchAsIMove}
            onChange={(e) => setSearchAsIMove(e.target.checked)}
            className="sr-only"
          />
          <div
            className={cn(
              'w-4 h-4 rounded border flex items-center justify-center transition-colors',
              searchAsIMove
                ? 'bg-primary border-primary text-primary-foreground'
                : 'border-muted-foreground/40 bg-background',
            )}
          >
            {searchAsIMove && <Check className="w-3 h-3 stroke-[3]" />}
          </div>
          <span className="font-medium text-muted-foreground">Search as I move</span>
        </label>
      </div>

      {/* Bottom-Left Zoom Badge */}
      <div className="absolute bottom-4 left-4 z-[500] bg-background/80 backdrop-blur-sm px-2.5 py-1 rounded text-[11px] font-mono text-muted-foreground border border-border/40 shadow-xs hidden sm:block">
        Zoom: {currentZoom}
      </div>
    </div>
  )
}
