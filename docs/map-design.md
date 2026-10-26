# Interactive placement map: design (KAN-4 / KAN-22)

## Decisions

- **Map engine**: Leaflet (`leaflet` and `react-leaflet`) with OpenStreetMap (OSM) standard tile layers.
  Completely open-source, lightweight, requires no API key or paid subscription, and works reliably in local development and automated testing environments.
- **Coordinate reference system**: Standard WGS 84 (`EPSG:4326`) latitude and longitude stored as `Float` in PostgreSQL.
- **Default center & viewport**:
  - Center: Tashkent, Uzbekistan (`lat: 41.311081`, `lng: 69.279737`).
  - Default zoom level: `12` (metropolitan city scale).
  - Bounds clamp: Uzbekistan geographic bounding box (`lat: [37.0, 45.6]`, `lng: [56.0, 73.2]`).
- **Viewport bounding-box fetching**:
  - Rather than loading all placements nationally at once, the client requests pins within the current map bounding box (`minLat`, `maxLat`, `minLng`, `maxLng`).
  - Map pan/zoom triggers a debounced query (300ms) to update markers without UI stutter.
  - An optional "Search this area as I move" toggle allows users to freeze or enable automatic refetching.
- **Lightweight marker payload**:
  - The map query (`GET /api/placements/map`) returns a compact marker payload containing only rendering-critical fields (`id`, `title`, `type`, `latitude`, `longitude`, `pricePerMonth`, `photo`, `status`).
  - Detailed specs, description, vendor details, and full gallery are fetched on demand via `GET /api/placements/:id`.
- **Public access**:
  - Browsing the map and inspecting placement pins is public and does not require authentication.
  - The map API filters for `status = 'ACTIVE'` for client browsing.
- **Layout & interaction**:
  - Split-screen layout: left-hand listing pane (40% width, min 380px) and right-hand full-height map canvas (60% width).
  - On mobile screens (< 768px), the map takes full screen with a bottom preview card drawer and a floating toggle button to switch to full list view.
  - Bidirectional sync: hovering/clicking a card in the list highlights the corresponding pin on the map; clicking a pin pans smoothly and highlights the matching card in the list.

## Data model (Prisma)

```prisma
enum PlacementType {
  BILLBOARD
  LED_SCREEN
}

enum PlacementStatus {
  ACTIVE
  PENDING_REVIEW
  INACTIVE
  ARCHIVED
}

model Placement {
  id            String          @id @default(uuid())
  title         String
  description   String?
  type          PlacementType   @default(BILLBOARD)
  status        PlacementStatus @default(PENDING_REVIEW)
  latitude      Float
  longitude     Float
  address       String
  city          String
  pricePerMonth Int             // Stored as integer in UZS (e.g. 5_000_000)
  width         Float?          // Width in meters
  height        Float?          // Height in meters
  lighting      Boolean         @default(false)
  ledDurationSeconds Int?
  ledPlaysPerDay Int?
  photos        String[]        @default([])
  vendorId      String
  vendor        User            @relation(fields: [vendorId], references: [id], onDelete: Cascade)
  createdAt     DateTime        @default(now())
  updatedAt     DateTime        @updatedAt

  @@index([vendorId])
  @@index([status])
  @@index([city])
  @@index([latitude, longitude])
}
```

The composite index `@@index([latitude, longitude])` supports fast bounding-box range scans:
`WHERE status = 'ACTIVE' AND latitude >= :minLat AND latitude <= :maxLat AND longitude >= :minLng AND longitude <= :maxLng`.

## Shared Zod schemas (`packages/shared/src/placement.ts`)

```ts
placementTypeSchema = z.enum(['BILLBOARD', 'LED_SCREEN'])
placementStatusSchema = z.enum(['ACTIVE', 'PENDING_REVIEW', 'INACTIVE', 'ARCHIVED'])

mapBoundsQuerySchema = z.object({
  minLat: z.coerce.number().min(-90).max(90),
  maxLat: z.coerce.number().min(-90).max(90),
  minLng: z.coerce.number().min(-180).max(180),
  maxLng: z.coerce.number().min(-180).max(180),
  type: placementTypeSchema.optional(),
  city: z.string().trim().optional(),
  minPrice: z.coerce.number().int().nonnegative().optional(),
  maxPrice: z.coerce.number().int().positive().optional(),
  ledDurationSeconds: z.coerce.number().int().positive().optional(),
  ledPlaysPerDay: z.coerce.number().int().positive().optional(),
})

placementMarkerSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  type: placementTypeSchema,
  status: placementStatusSchema,
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  address: z.string(),
  city: z.string(),
  pricePerMonth: z.number().int().nonnegative(),
  photo: z.string().url().optional(),
})

mapMarkersResponseSchema = z.object({
  markers: z.array(placementMarkerSchema),
  total: z.number().int().nonnegative(),
})

placementDetailSchema = placementMarkerSchema.extend({
  description: z.string().nullable(),
  width: z.number().nullable(),
  height: z.number().nullable(),
  lighting: z.boolean(),
  photos: z.array(z.string().url()),
  ledDurationSeconds: z.number().int().positive().nullable(),
  ledPlaysPerDay: z.number().int().positive().nullable(),
  vendorId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
```

## API contract

All placement routes are under `/api/placements`, JSON in and out.

| Route                     | Query Params           | Success                         | Errors                                                   | Notes                                                   |
| ------------------------- | ---------------------- | ------------------------------- | -------------------------------------------------------- | ------------------------------------------------------- |
| `GET /api/placements/map` | `mapBoundsQuerySchema` | `200 { markers: [...], total }` | `400` validation `{ error, fieldErrors }`                | Public endpoint; filters `status = ACTIVE`              |
| `GET /api/placements/:id` | none                   | `200 { placement }`             | `404 { error: "Placement not found" }`, `400` invalid id | Public endpoint; returns full details and photo gallery |

### Query parameters for `GET /api/placements/map`

- `minLat`, `maxLat`: latitude boundary range `[-90, 90]`.
- `minLng`, `maxLng`: longitude boundary range `[-180, 180]`.
- `type` _(optional)_: filter by `PlacementType` (e.g. `BILLBOARD`, `LED_SCREEN`).
- `city` _(optional)_: case-insensitive city name match (e.g. `Tashkent`).
- `minPrice`, `maxPrice` _(optional)_: monthly price filter in UZS.

## Screens and layout

The main map interface resides at `/` (or `/placements`) as the primary discovery screen of the application.

```
Main Layout
├─ Header: Logo, Search / Filter bar (City select, Type filter pills, Price range), Auth / Profile links
└─ Viewport Container (h-[calc(100vh-4rem)] flex)
    ├─ Left Sidebar (w-full md:w-[420px] lg:w-[480px] flex flex-col border-r)
    │   ├─ Results Bar: "X placements in this area" + sorting options (price, newly added)
    │   └─ Scrollable Placement Card Feed:
    │       └─ PlacementCard (Card)
    │           ├─ Thumbnail image with Type badge (Billboard, LED) overlay
    │           ├─ CardTitle: placement title + address
    │           ├─ Pricing: e.g. "5,000,000 UZS / mo"
    │           └─ Footer: "View on map" / "Details" button
    └─ Right Pane: Map Canvas (flex-1 relative)
        ├─ Leaflet MapContainer (OSM Carto / standard tiles)
        │   ├─ MapMarkers (custom pins with type icons or price badges)
        │   └─ MarkerPopup (on pin click)
        │       ├─ Thumbnail photo
        │       ├─ Title & Address
        │       ├─ Price per month
        │       └─ "View Details" link -> opens detail modal or navigates to `/placements/:id`
        ├─ Floating Map Controls (Top right: Zoom controls, Layer toggle)
        └─ Floating Action Button (Top center: "Search this area" button when map is panned)
```

### Pin visual design and states

- **Default pin**: Circular or pin marker with placement-type icon (billboard icon for `BILLBOARD`, digital monitor icon for `LED_SCREEN`) or compact price badge (e.g. `5M UZS`).
- **Hovered state**: Pin scales up (`scale-110`), elevates shadow, and displays a quick tooltip title.
- **Selected / Active state**: High-contrast highlight ring (`ring-2 ring-primary`) with an open interactive `Popup`.
- **Cluster state**: When zoomed out, nearby pins cluster with badge count indicator, expanding on click/zoom.

### UI states

- **Initial loading**: Map initializes at Tashkent coordinates. Skeleton cards render in the left sidebar while bounds query resolves.
- **Loaded with results**: Pins render on the map canvas; cards populate the sidebar.
- **Empty state**: If no placements match bounds or filter criteria, sidebar displays:
  _"No placements found in this area. Try zooming out, panning the map, or resetting filters."_ with a "Reset filters" button.
- **Query error**: Sonner toast error: _"Failed to load map placements. Please check your connection."_ with a retry button.
- **Offline / Map tile error**: Fallback tile message gracefully notifying client of tile loading issues.

## Out of scope

- Vendor placement creation, editing, and photo uploads (KAN-10).
- Admin placement approval and moderation workflow (KAN-14).
- Placing orders, shopping cart persistence, and checkout (KAN-7, KAN-18).
- Vendor inquiry form and messaging (KAN-8, KAN-34).
- Uzbek and Russian multi-language translations (KAN-19 / KAN-76..79).
