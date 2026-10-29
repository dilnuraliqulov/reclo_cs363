# Vendor listing editor and archive: design (KAN-10 / KAN-42)

## Decisions

- **Reuse `Placement`; there is no second "Listing" table.** The map, the detail view and the inquiry
  rows already point at `Placement`, so a parallel table would need syncing. A "listing" is a
  `Placement` seen from its owner's side. One column is added, `archivedAt DateTime?`; everything else
  the editor needs already exists. `tier` stays derived from `pricePerMonth` (`getPlacementTier`), so
  the editor never writes it.
- **Archive is a soft delete, and a vendor never hard-deletes.** Archiving sets `status = ARCHIVED` and
  `archivedAt = now()`; the row, its photos and its inquiries stay. Inquiries cascade-delete with the
  placement, and the client history (KAN-9) joins the placement without filtering on its status, so a
  hard delete would erase a client's history. Removing rows for good is an admin or ops matter.
- **Status state machine** (vendor-initiated transitions only; admin approval is KAN-14):

  | From             | To               | Who    | How                                                       |
  | ---------------- | ---------------- | ------ | --------------------------------------------------------- |
  | _(none)_         | `PENDING_REVIEW` | vendor | create                                                    |
  | `ACTIVE`         | `INACTIVE`       | vendor | pause                                                     |
  | `INACTIVE`       | `ACTIVE`         | vendor | resume                                                    |
  | `ACTIVE`         | `PENDING_REVIEW` | system | vendor edits any content field                            |
  | `INACTIVE`       | `PENDING_REVIEW` | system | vendor edits any content field                            |
  | `PENDING_REVIEW` | `ACTIVE`         | admin  | KAN-14 (not here)                                         |
  | `PENDING_REVIEW` | `INACTIVE`       | admin  | KAN-14 (reject; not here)                                 |
  | any non-archived | `ARCHIVED`       | vendor | archive                                                   |
  | `ARCHIVED`       | `PENDING_REVIEW` | vendor | restore (never straight to `ACTIVE`; goes back to review) |

  Every other transition is `409`. A `PENDING_REVIEW` listing stays `PENDING_REVIEW` when edited.
  An `ARCHIVED` listing cannot be edited: restore it first.

- **A content edit re-enters moderation.** Editing an `ACTIVE` listing sets it back to
  `PENDING_REVIEW`, and the same goes for `INACTIVE`. Otherwise a vendor could get a harmless listing
  approved and then swap in anything. KAN-14 relies on this. The price is that a typo fix takes the
  listing off the map until an admin re-approves it; the editor says so before saving (see
  [States](#states)). Because an edit also pulls a paused listing out of `INACTIVE`, resuming
  `INACTIVE -> ACTIVE` never publishes unreviewed content. "Content field" means every field in
  `updatePlacementRequestSchema`, including `ledDurationSeconds` and `ledPlaysPerDay`; photo upload and removal count as an edit too.
- **Restore goes to `PENDING_REVIEW`, not back to the previous status.** It needs no
  `statusBeforeArchive` column, and a listing that sat archived for months gets a fresh look. Restore
  sets `archivedAt = null`.
- **Archived listings are invisible to the public.** `GET /api/placements/map` and
  `GET /api/placements/:id` already filter `status = 'ACTIVE'`, so an archived listing returns the same
  `404 { error: "Placement not found" }` as one that does not exist. No change to those routes; KAN-43
  adds a test for the archived case. `POST /api/inquiries` already answers `404` for non-`ACTIVE`
  placements, so archiving also stops new inquiries. Old inquiries stay visible to the client and the
  vendor.
- **Photos are stored on local disk** under `apps/api/uploads/placements/<placementId>/`, served by
  `express.static` at `/uploads`, and gitignored. This is a course project with one server and no
  budget for object storage; the cost is that files do not survive a redeploy to ephemeral hosting, and
  the store is hidden behind one small `PhotoStorage` interface so S3-style storage can replace it.
  - Max **8 photos** per listing, max **5 MB** each, `image/jpeg`, `image/png`, `image/webp` only.
  - Type is decided from the file's magic bytes, not from the client's `Content-Type` or filename. The
    server generates the file name (`<uuid>.<ext>`); the client's name is discarded.
  - The first photo is the cover (the map `photo` thumbnail). There is no reorder in this task.
  - `Placement.photos` holds **site-relative paths** (`/uploads/placements/<id>/<uuid>.jpg`). The API
    prefixes `API_PUBLIC_URL` when serialising, so the existing `photos: z.array(z.string().url())` in
    `placementDetailSchema` keeps holding and the host can change without a data migration.
  - Removing a photo drops the path from the array and deletes the file, best effort: a failed unlink
    is logged and does not fail the request. Archiving keeps the files.
  - Upload uses `multer` with memory storage and a hard `fileSize` limit. It has no install script, so
    `allowBuilds` is untouched.
- **Create is one request, photos follow.** `POST` creates the listing as `PENDING_REVIEW` with no
  photos, then the editor uploads photos against the new id. A listing without a photo is allowed to
  exist, but KAN-14 must not approve one with `photos.length === 0`; the editor warns about it.
- **Vendor routes live under `/api/vendor/placements`**, not under the public `/api/placements`. The
  public router has the `/:id` wildcard and no auth, and a separate mount keeps `requireAuth` +
  `requireRole('VENDOR')` as one `router.use` that no new route can forget.
- **Ownership is enforced in the query, not after it.** Every read and write uses
  `where: { id, vendorId: req.user.id }`. A listing owned by someone else answers `404`, the same as a
  missing one, so ids cannot be probed (the same reasoning as the `404` in `inquiry-design.md`).
  `vendorId`, `status`, `archivedAt`, `photos` and `tier` in a request body are ignored: unknown keys are
  stripped and all of them are set server-side.
- **Admins do not use these routes.** `ADMIN` gets `403`. Moderation and admin edits are KAN-14.

## Data model (Prisma)

Only the new field and index are shown; the rest of `Placement` is as in
[`map-design.md`](./map-design.md).

```prisma
model Placement {
  // ...existing fields...
  archivedAt DateTime? // set when status becomes ARCHIVED, cleared on restore

  @@index([vendorId, status]) // vendor "My listings" list and status filter
}
```

The existing `@@index([vendorId])` is superseded by the composite and is dropped in the same
migration, since `(vendorId, status)` also serves vendor-only lookups.

Transitions are written as conditional updates so two tabs cannot race a listing into an illegal state:

```ts
// archive: only succeeds from a non-archived state, zero rows updated means 409
prisma.placement.updateMany({
  where: { id, vendorId, status: { not: 'ARCHIVED' } },
  data: { status: 'ARCHIVED', archivedAt: now },
})
```

## Shared Zod schemas (`packages/shared/src/placement.ts`)

New schemas are added next to the existing placement ones. The web form and the API both import them.

```ts
// Uzbekistan bounding box, the same one the map clamps to (map-design.md)
const latitudeSchema = z.number().min(37.0).max(45.6)
const longitudeSchema = z.number().min(56.0).max(73.2)

createPlacementRequestSchema = z
  .object({
    title: z.string().trim().min(5).max(120),
    description: z.string().trim().max(2000).optional(),
    type: placementTypeSchema, // BILLBOARD | LED_SCREEN (KAN-12)
    latitude: latitudeSchema,
    longitude: longitudeSchema,
    address: z.string().trim().min(3).max(200),
    city: z.string().trim().min(2).max(80),
    pricePerMonth: z.coerce.number().int().min(100_000).max(1_000_000_000), // UZS
    width: z.coerce.number().positive().max(100).optional(), // metres
    height: z.coerce.number().positive().max(100).optional(),
    lighting: z.boolean().default(false),
    ledDurationSeconds: z.number().int().positive().optional(), // LED_SCREEN only
    ledPlaysPerDay: z.number().int().positive().optional(), // LED_SCREEN only
  })
  .refine(ledOnlyForLedScreen) // 400 validation.led.typeOnly otherwise

updatePlacementRequestSchema = createPlacementRequestSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, { message: 'Nothing to update' })

vendorPlacementListQuerySchema = z.object({
  status: placementStatusSchema.optional(), // omitted = every status except ARCHIVED
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
})

vendorPlacementSchema = placementDetailSchema.extend({ archivedAt: z.string().nullable() })
vendorPlacementResponseSchema = z.object({ placement: vendorPlacementSchema })
vendorPlacementListResponseSchema = z.object({
  placements: z.array(vendorPlacementSchema),
  total: z.number().int().nonnegative(),
})
```

Rules worth stating:

- `description`, `width` and `height` cleared in the form are sent as omitted on create. On `PATCH`,
  `null` is not accepted; clearing a value is not supported in this task.
- The price floor of 100 000 UZS catches a vendor typing the price in thousands or in dollars. The
  ceiling catches an extra zero. Both are a guess and are cheap to change.
- Coordinates are range-checked against Uzbekistan, which also rejects a lat/lng swap (a latitude of 69
  is out of range).
- All text is stored and returned as plain text; nothing in the pipeline renders it as HTML.
- **KAN-20 will audit every write endpoint**, including these. Anything below that looks arbitrary
  (limits, rate limit) is meant to be tightened there, not defended here.

## API contract

Routes under `/api/vendor/placements`, JSON in and out except the upload, called with
`credentials: 'include'`. Every route runs `requireAuth` then `requireRole('VENDOR')`.

| Route                                            | Body                                   | Success                     | Errors                                                                                |
| ------------------------------------------------ | -------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------- |
| `POST /api/vendor/placements`                    | `createPlacementRequestSchema`         | `201 { placement }`         | `400`, `401`, `403`, `429`                                                            |
| `GET /api/vendor/placements`                     | query `vendorPlacementListQuerySchema` | `200 { placements, total }` | `400`, `401`, `403`                                                                   |
| `GET /api/vendor/placements/:id`                 | none                                   | `200 { placement }`         | `400` bad id, `401`, `403`, `404`                                                     |
| `PATCH /api/vendor/placements/:id`               | `updatePlacementRequestSchema`         | `200 { placement }`         | `400`, `401`, `403`, `404`, `409` archived, `429`                                     |
| `POST /api/vendor/placements/:id/archive`        | none                                   | `200 { placement }`         | `401`, `403`, `404`, `409` already archived                                           |
| `POST /api/vendor/placements/:id/restore`        | none                                   | `200 { placement }`         | `401`, `403`, `404`, `409` not archived                                               |
| `POST /api/vendor/placements/:id/pause`          | none                                   | `200 { placement }`         | `401`, `403`, `404`, `409` not `ACTIVE`                                               |
| `POST /api/vendor/placements/:id/resume`         | none                                   | `200 { placement }`         | `401`, `403`, `404`, `409` not `INACTIVE`                                             |
| `POST /api/vendor/placements/:id/photos`         | `multipart/form-data`, field `photo`   | `201 { placement }`         | `400` no file, `404`, `409` archived or 8 photos, `413` > 5 MB, `415` bad type, `429` |
| `DELETE /api/vendor/placements/:id/photos/:file` | none                                   | `200 { placement }`         | `404` listing or photo not found, `409` archived                                      |

Server-side rules:

1. `401 { error: "Not authenticated" }` without a valid session; `403 { error: "Forbidden" }` for a
   `CLIENT` or `ADMIN`. Both come from the existing middleware.
2. A malformed `:id` (not a UUID) is `400`. A well-formed id that is missing, or owned by another
   vendor, is `404 { error: "Placement not found" }`. Never `403` for someone else's listing: `403`
   would confirm the id exists.
3. Validation failures are `400 { error, fieldErrors }`, the shape the other routes use.
4. State errors are `409 { error }` with a message that names the current status, e.g. _"Only an
   archived listing can be restored"_. The editor shows it as a toast and refetches.
5. LED fields (`ledDurationSeconds`, `ledPlaysPerDay`, positive ints, both optional) are accepted only
   when the type after the edit is `LED_SCREEN`; otherwise `400` with `fieldErrors.type =
["validation.led.typeOnly"]`. A `PATCH` that changes the type away from `LED_SCREEN` clears both
   (sets `null`) in the same update; LED values for a stored non-LED listing, with no `type` in the
   body, are the same `400` (checked in the update's `where`, so it cannot race a type change).
   Editing them is a content edit like any other.
6. A `PATCH` on an `ACTIVE` or `INACTIVE` listing changes the content and sets
   `status = PENDING_REVIEW` in the same update. The response carries the new status so the UI can
   say so.
7. Mutating routes share a rate limiter (same `express-rate-limit` approach as the auth and inquiry
   routes, `vendorRateLimitMax` option on `createApp` so tests can lower it).
8. `GET` list: `where { vendorId }` plus the status rule, ordered `createdAt desc`, `total` counted on
   the same filter.
9. `createApp` takes a new optional `vendorPlacementStore` dependency, mounted only when present, so
   route tests stub it and need no database. Upload tests stub `PhotoStorage` as well.

## Screens and layout

All vendor screens sit behind the existing `RequireAuth` plus a `VENDOR` role check; a client or admin
who opens the URL is sent to `/`. The header shows a **My listings** link to vendors only.

| Route                         | Screen         |
| ----------------------------- | -------------- |
| `/vendor/placements`          | My listings    |
| `/vendor/placements/new`      | Create listing |
| `/vendor/placements/:id/edit` | Edit listing   |

### My listings

```
VendorListingsPage
├─ Header row: <h1> "My listings" · Button "New listing" -> /vendor/placements/new
├─ Tabs (status filter): Active · Pending review · Inactive · Archived · All
│     "All" = every status except Archived (the API default); counts are not shown
├─ Table
│   ├─ TableHead: Photo · Title / address · Type · Price per month · Status · Updated · (actions)
│   └─ TableRow per listing
│       ├─ cover thumbnail (or placeholder), title with city underneath
│       ├─ Badge for status (colour + text, never colour alone)
│       └─ DropdownMenu (aria-label "Actions for <title>")
│           ├─ Edit            (not for Archived)
│           ├─ Pause / Resume  (Active / Inactive only)
│           ├─ Archive         (not for Archived)  -> AlertDialog
│           └─ Restore         (Archived only)
└─ Pagination: Button "Previous" · "Page n of m" · Button "Next" (pageSize 20)
```

Archive confirmation is an `AlertDialog`:

- Title _"Archive this listing?"_, body _"“<title>” will disappear from the map and stop receiving
  inquiries. Existing inquiries are kept. You can restore it later; it will be reviewed again before
  it goes live."_
- Buttons: `Cancel` (default focus) and a destructive `Archive`. The button reads "Archiving…" and
  both buttons are disabled while the request runs. Restore and pause need no confirmation.

### Create / edit form

One page, one `<form>` (React Hook Form + `zodResolver(createPlacementRequestSchema)`; edit uses
`defaultValues` from the loaded listing and sends only dirty fields to `PATCH`). Built from `Card`
sections, each with a `CardHeader` title:

```
ListingEditorPage
├─ Breadcrumb row: "My listings" link · page title ("New listing" / listing title)
├─ StatusBanner (edit only; see States)
├─ <form> — FieldGroup inside four Cards
│   ├─ Card "Basics"
│   │   ├─ Field : FieldLabel "Title"        + Input                          + FieldError
│   │   ├─ Field : FieldLabel "Type"         + Select (2 placement types; LED fields appear for LED screen)     + FieldError
│   │   └─ Field : FieldLabel "Description"  + Textarea rows=5 + "<n>/2000"   + FieldError
│   ├─ Card "Location"
│   │   ├─ Field : FieldLabel "City"         + Input                          + FieldError
│   │   ├─ Field : FieldLabel "Address"      + Input                          + FieldError
│   │   └─ LocationPicker (Leaflet map, h-72)
│   │        click the map or drag the marker to set the pin; coordinates shown as text
│   │        below it ("41.31108, 69.27974") and announced politely; FieldError for lat/lng
│   ├─ Card "Pricing and size"
│   │   ├─ Field : FieldLabel "Price per month (UZS)" + Input inputMode=numeric
│   │   │          + FieldDescription showing the formatted value and the tier it falls in
│   │   ├─ Row (grid sm:grid-cols-2 gap-3)
│   │   │   ├─ Field : FieldLabel "Width (m)"  + Input inputMode=decimal      + FieldError
│   │   │   └─ Field : FieldLabel "Height (m)" + Input inputMode=decimal      + FieldError
│   │   └─ Field orientation=horizontal : FieldLabel "Lit at night" + Switch
│   └─ Card "Photos" (edit page only, see below)
└─ Sticky footer: Button variant=outline "Cancel" · Button type=submit "Create listing" / "Save changes"
```

- **Location picker.** Reuses the Leaflet setup from the map task (`react-leaflet`, OSM tiles, Tashkent
  centre and zoom 12, the Uzbekistan bounds clamp). The shared constants are lifted out of
  `PlacementMap` into a small module both import, rather than copied. On edit the map opens centred on
  the saved pin. A click outside the Uzbekistan bounds is ignored. The map is not the only way in:
  keyboard users get two numeric `Input`s (latitude, longitude) under the map that drive the same pin,
  so the picker is not mouse-only.
- **Photos card.** On `/new` it shows a note: _"Save the listing first, then add photos."_ After the
  first save the editor navigates to `/vendor/placements/:id/edit` and the card becomes live: a grid of
  thumbnails each with a remove `Button` (icon, `aria-label="Remove photo n"`), the first marked
  `Badge` "Cover", plus an "Add photos" `Button` wrapping a hidden `<input type=file multiple
accept="image/jpeg,image/png,image/webp">`, a counter "3 / 8", and a hint with the size limit. Files
  upload one request each, in parallel up to three; each thumbnail shows its own `Skeleton` while
  uploading and a per-file error underneath if it fails. Client-side checks (size, type, remaining
  slots) run first so an obviously bad file never leaves the browser; the server stays the authority.
- **shadcn/ui components.** Already in `components/ui`: `badge`, `button`, `card`, `dialog`, `field`,
  `input`, `label`, `select`, `separator`, `skeleton`, `sonner`, `tabs`, `textarea`. To add with
  `pnpm dlx shadcn@latest add <name>` from `apps/web`: `table`, `alert-dialog`, `dropdown-menu`,
  `switch`. Nothing else, and the generated files are left as generated.
- **Mobile (< 768px).** My listings drops the table for a stack of `Card`s (cover, title, status
  `Badge`, price, the same `DropdownMenu`); the tabs scroll horizontally. The form is a single column,
  the map is full width at `h-64`, the width/height row stacks, the footer stays sticky above the
  keyboard, and the photo grid is two columns. Tap targets are at least 40 px.

### States

- **My listings, loading:** five `Skeleton` rows (cards on mobile); the tabs are already interactive.
- **My listings, empty:** no listings at all: _"You have no listings yet."_ with a "New listing"
  button. Empty for a filter only: _"No <status> listings."_ with a "Show all" button. The Archived tab
  says _"Archived listings appear here. You can restore them at any time."_
- **My listings, error:** inline `Card` with _"Couldn't load your listings."_ and a "Try again" button;
  a failed row action is a `sonner` toast with the server message and the list refetches.
- **Editor, loading (edit):** form-shaped `Skeleton`s. A `404` renders _"Listing not found"_ with a link
  back to My listings; it does not distinguish "missing" from "not yours", matching the API.
- **Editor, status banner (edit):** shows the current status in words. `PENDING_REVIEW`: _"Waiting for
  review. It is not on the map yet."_ `ACTIVE`: _"Live on the map. Saving changes sends it back for
  review and removes it from the map until it is approved."_ `INACTIVE`: same warning as `ACTIVE`.
  `ARCHIVED`: _"Archived. Restore it to edit."_ with a "Restore" button; the whole form is
  `disabled`.
- **Editor, validation:** on submit, then on change, through the shared schema; messages render in
  `FieldError` and the `Input` gets `aria-invalid`. Focus moves to the first field in error.
- **Editor, submitting:** submit reads "Saving…", every input is disabled.
- **Editor, server field errors (`400`):** mapped onto the field with `setError`.
- **Editor, success:** create: toast _"Listing created. It will go live once it is reviewed."_ and
  navigate to its edit page. Save: toast _"Changes saved."_, or _"Changes saved. The listing is back in
  review."_ when the status moved.
- **Editor, unsaved changes:** leaving with a dirty form asks for confirmation (`beforeunload` and the
  router blocker).
- **Editor, other errors (`401`, `403`, `409`, `429`, `5xx`, network):** `sonner` toast with the server
  message. A `401` redirects to `/sign-in?next=<current path>` without discarding what was typed.
- **Accessibility.** Each Card section is a labelled group; dialogs return focus to the control that
  opened them; the status `Badge` carries text, not only colour; the character counters are
  `aria-live="polite"` and announce only on approach to the limit.

## Testing notes

- Schema unit tests: each bound of `createPlacementRequestSchema` (title, price floor and ceiling,
  Uzbekistan box, swapped lat/lng rejected, width/height), `updatePlacementRequestSchema` rejecting an
  empty object, unknown keys such as `status` and `vendorId` stripped.
- Route tests via Supertest against `createApp` with stub stores: every row of the table above, a
  `CLIENT` and an `ADMIN` getting `403`, someone else's id getting `404`, an edit of an `ACTIVE`
  listing returning `PENDING_REVIEW`, an edit of `ARCHIVED` returning `409`, archive then restore ending
  in `PENDING_REVIEW`, a double archive returning `409`, upload rejecting a 9th photo, an oversized
  file, and a `.jpg` whose bytes are not an image.
- Store tests: `where` always carries `vendorId`, archive and restore are conditional `updateMany`s, and
  the public map and detail queries still filter `ACTIVE` (archived case added).
- Component tests: tab filtering, the archive `AlertDialog` (cancel does nothing, confirm calls the
  API once), the status banner copy per status, the photo card limits, and the map pin updating the
  coordinate fields.

## Open questions

- **Who archived it?** An admin archive from KAN-14 and a vendor archive look identical, so a vendor
  could restore a listing an admin took down (it would only return to `PENDING_REVIEW`, so the damage
  is limited). If KAN-14 needs the distinction, it adds `archivedBy` or an `ARCHIVED_BY_ADMIN` reason;
  not decided here.
- **Re-review on every edit may be too strict.** If vendors complain about typo fixes, the follow-up is
  to split fields into "needs review" (location, photos, type, size) and "free" (description, price)
  rather than loosening it for everyone. KAN-14 should confirm it can cope with the extra volume.
- **Photo hosting.** Local disk is fine for the demo; a deployment with ephemeral storage needs the
  `PhotoStorage` swap before photos are real.

## Out of scope

- Admin approval, rejection and the moderation queue (KAN-14).
- The input-validation audit of all write endpoints (KAN-20).
- Hard delete, bulk archive, and photo reordering.
- Per-listing analytics and the vendor inquiry inbox (KAN-15).
- Term × duration pricing matrix and VAT (KAN-11).
- Uzbek and Russian translations (KAN-19 / KAN-76..79).
