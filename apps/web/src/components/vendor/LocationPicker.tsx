import { UZ_BOUNDS } from '@reclo/shared'
import L from 'leaflet'
import { useEffect, useRef } from 'react'
import { useT } from '@/i18n/useLocale'
import {
  DEFAULT_ZOOM,
  OSM_ATTRIBUTION,
  OSM_TILE_URL,
  TASHKENT_CENTER,
  UZBEKISTAN_BOUNDS,
} from '@/lib/map-config'

interface LocationPickerProps {
  latitude: number | undefined
  longitude: number | undefined
  onChange: (latitude: number, longitude: number) => void
  disabled?: boolean
}

const PIN_ICON = L.divIcon({
  html: '<div class="size-5 rounded-full border-2 border-background bg-primary shadow-md"></div>',
  className: 'reclo-custom-marker',
  iconSize: [20, 20],
  iconAnchor: [10, 10],
})

function insideUzbekistan(latitude: number, longitude: number): boolean {
  return (
    latitude >= UZ_BOUNDS.minLat &&
    latitude <= UZ_BOUNDS.maxLat &&
    longitude >= UZ_BOUNDS.minLng &&
    longitude <= UZ_BOUNDS.maxLng
  )
}

/**
 * Click the map or drag the pin to set a location. The numeric inputs under it (owned by the form)
 * drive the same pin, so this is not the only way in. A click outside Uzbekistan is ignored.
 */
export function LocationPicker({ latitude, longitude, onChange, disabled }: LocationPickerProps) {
  const t = useT()
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const markerRef = useRef<L.Marker | null>(null)
  const setPinRef = useRef<((at: L.LatLngTuple) => void) | null>(null)
  // Handlers are registered once, so they read the latest props through refs.
  const onChangeRef = useRef(onChange)
  const disabledRef = useRef(disabled)
  const initialRef = useRef({ latitude, longitude })

  useEffect(() => {
    onChangeRef.current = onChange
    disabledRef.current = disabled
  })

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const { latitude: lat, longitude: lng } = initialRef.current
    const hasPin = lat !== undefined && lng !== undefined
    const map = L.map(container, {
      center: hasPin ? [lat, lng] : TASHKENT_CENTER,
      zoom: DEFAULT_ZOOM,
      maxBounds: UZBEKISTAN_BOUNDS,
      maxBoundsViscosity: 0.8,
      minZoom: 6,
      maxZoom: 18,
    })
    L.tileLayer(OSM_TILE_URL, { maxZoom: 19, attribution: OSM_ATTRIBUTION }).addTo(map)

    // Moves the pin, creating it on first use. The map itself is the only place that knows how.
    const setPin = (at: L.LatLngTuple) => {
      if (markerRef.current) {
        markerRef.current.setLatLng(at)
        return
      }
      const marker = L.marker(at, { icon: PIN_ICON, draggable: true }).addTo(map)
      marker.on('dragend', () => {
        const dropped = marker.getLatLng()
        if (insideUzbekistan(dropped.lat, dropped.lng)) {
          onChangeRef.current(dropped.lat, dropped.lng)
        } else {
          marker.setLatLng(at)
        }
      })
      markerRef.current = marker
    }
    setPinRef.current = setPin
    if (hasPin) setPin([lat, lng])

    map.on('click', (event: L.LeafletMouseEvent) => {
      if (disabledRef.current) return
      const { lat: nextLat, lng: nextLng } = event.latlng
      if (!insideUzbekistan(nextLat, nextLng)) return
      onChangeRef.current(nextLat, nextLng)
    })

    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
      setPinRef.current = null
      markerRef.current = null
    }
  }, [])

  // Follows the form: typed coordinates, or a click that the form accepted.
  useEffect(() => {
    if (latitude === undefined || longitude === undefined) return
    if (!insideUzbekistan(latitude, longitude)) return
    setPinRef.current?.([latitude, longitude])
    mapRef.current?.panTo([latitude, longitude])
  }, [latitude, longitude])

  return (
    <div
      ref={containerRef}
      role="application"
      aria-label={t('listing.map.label')}
      className="h-64 w-full overflow-hidden rounded-lg border border-border/80 md:h-72"
    />
  )
}
