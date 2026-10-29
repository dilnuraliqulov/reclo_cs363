# Admin moderation queue and approval states: design (KAN-14 / KAN-58)

Vendors create listings as `PENDING_REVIEW` and re-enter it on every content edit
([`listing-design.md`](./listing-design.md), KAN-10). Nothing yet lets an admin move a listing out of
review, so no listing can reach the map. This task adds the admin side: a queue, a preview, approve and
reject, and the audit trail behind them.

## Decisions

- **Rejection is a new status, `REJECTED`, not `INACTIVE`.** `listing-design.md` sends a rejected
  listing to `INACTIVE`, but that opens a hole: the vendor's **Resume** action is
  `INACTIVE -> ACTIVE`, so a vendor could "resume" a rejected listing and publish exactly what the
  admin refused, with no review. The listing design closes the same hole for edits (an edit of an
  `INACTIVE` listing goes to review) but not for resume, because until now every `INACTIVE` listing was
  one the vendor paused after an approval. `REJECTED` keeps the two meanings apart: `INACTIVE` = "was
  approved, the vendor paused it"; `REJECTED` = "an admin said no". The cost is one enum value, and
  the changes to the listing design listed under [State machine](#state-machine).
- **A rejection needs a reason.** Required, trimmed, 10 to 500 characters (`rejectPlacementRequestSchema`).
  Without a reason the vendor learns nothing and re-submits the same content. Approval takes no
  comment.
- **The vendor sees the reason.** The reason is the point of rejecting rather than ignoring. The vendor
  API returns `rejectionReason` on a `REJECTED` listing (read from the latest rejection event, below)
  and My listings and the editor show it. It is admin-written free text, shown as plain text and not
  translated, like vendor content in `i18n-design.md`. Admins see the vendor's name and email in the
  preview; the vendor never sees which admin rejected.
- **How a vendor recovers from a rejection.** Any content edit (including adding or removing a photo,
  which already counts as an edit) moves `REJECTED -> PENDING_REVIEW`, the same rule as for `ACTIVE`
  and `INACTIVE`. There is no separate "resubmit" button: fixing the problem is the resubmission. The
  vendor can also archive a rejected listing. `pause`, `resume` are `409` on `REJECTED`.
- **A listing with no photos cannot be approved.** `listing-design.md` allows creating a listing
  without photos and requires this task to block the approval. Approve answers `409 PLACEMENT_NO_PHOTOS`
  and the UI also disables the Approve button with an inline explanation, so the admin does not find
  out by clicking. The check is part of the conditional update, not a read followed by a write (see
  concurrency).
- **Re-approval after an edit is the same approval.** An edit puts the listing back in
  `PENDING_REVIEW` and it appears in the same queue; the admin cannot tell it apart except by the
  history panel ("approved on 3 Mar, edited on 9 Mar"). There is no "changed fields" diff in this task:
  that needs a snapshot of the approved content and is listed under Open questions.
- **Optimistic concurrency with a content version.** Two things can go wrong: two admins moderate the
  same listing, and the vendor edits the listing while an admin is reading it (an edit of a
  `PENDING_REVIEW` listing keeps it `PENDING_REVIEW`, so a status check alone would let the admin
  approve content they never saw). Both are closed by one conditional `updateMany` whose `where`
  carries `status = PENDING_REVIEW` **and** `updatedAt = expectedUpdatedAt`, where
  `expectedUpdatedAt` is the `updatedAt` of the detail the admin was looking at and is sent in the
  request body. Zero rows updated means `409`; a follow-up read picks the code (see API contract). The
  second admin gets "already moderated"; the admin racing a vendor edit gets "changed, review again"
  and the UI refetches the detail.
- **Audit trail: a small append-only `ModerationEvent` table, not columns on `Placement`.**
  Columns (`reviewedBy`, `reviewedAt`) answer "who decided last" but a listing is moderated many
  times (approve, vendor edit, re-approve, reject, ...) and overwriting loses the history that an
  audit exists to keep. One table with five columns is the simplest structure that keeps it. It also
  stores the rejection reason, so there is exactly one place for it and no denormalised
  `Placement.rejectionReason` to keep in sync or clear on resubmission. The state change and the event
  insert run in one `prisma.$transaction`, so a decision without its event cannot exist. Events are
  never updated or deleted by the app; they cascade with the placement (the same as inquiries) and
  `adminId` is `SetNull` on user delete so history survives an admin leaving.
- **Queue ordering: oldest first.** Ordered by `updatedAt asc`, `id asc` as tie-break. While a listing
  is `PENDING_REVIEW` the only writers are the vendor (edit, photos) and the admin decision, so
  `updatedAt` is "when it last entered or changed in the queue". That is the right priority and needs
  no `submittedAt` column. The cost: a vendor who keeps editing a pending listing goes to the back of
  the line, which is acceptable because the content changed and the admin has to look again anyway.
  A new index `(status, updatedAt)` replaces `@@index([status])` and serves the queue.
- **Pagination is offset-based** (`page`, `pageSize` default 20, max 50, `total` returned), matching
  `vendorPlacementListQuerySchema`. The queue shrinks as admins work, so a page can skip an item when
  the list shifts underneath; the UI does not advance a page after a decision but refetches the same
  page, and an item that is skipped is still first in line on the next load. Cursor pagination is not
  worth its complexity at a queue of tens.
- **Filter.** `status` (default `PENDING_REVIEW`; also `REJECTED`, `ACTIVE`, `INACTIVE`, `ARCHIVED`
  so an admin can look a listing up), `type`, and `city`. No free-text search in this task.
- **Admin routes live under `/api/admin/placements`**, mounted with one
  `router.use(requireAuth, requireRole('ADMIN'))` like the vendor router. `VENDOR` and `CLIENT` get
  `403 FORBIDDEN`; no session gets `401`. Admin reads are not owner-scoped: an admin can open any
  listing by id, in any status.
- **Rate limit.** Approve and reject share one limiter, same `express-rate-limit` approach and
  15-minute window as the other routes, `adminRateLimitMax` option on `createApp` (default 120: an
  admin working through a queue legitimately makes dozens of decisions; the limit is there to stop a
  stolen session script, not to pace people). Reads are not limited.
- **No `admin` user can be created through the app.** Admins are seeded or set in the database; this
  task does not add a sign-up path. The seed script must make sure one admin exists (see hand-off).
- **Vendor notification is out of scope.** The vendor learns of a decision by opening My listings
  (status badge, rejection reason). No email, push or in-app inbox here; if wanted it is a follow-up
  that reads `ModerationEvent`.
- **Admin edits of listing content are out of scope.** An admin can only approve or reject, never fix a
  typo on the vendor's behalf. Admin archive/take-down of a live listing is also not here (see Open
  questions).

## State machine

This replaces the admin rows in the table in `listing-design.md` and adds `REJECTED`.

| From             | To               | Who    | How                                                 |
| ---------------- | ---------------- | ------ | --------------------------------------------------- |
| _(none)_         | `PENDING_REVIEW` | vendor | create                                              |
| `PENDING_REVIEW` | `ACTIVE`         | admin  | approve (needs at least one photo)                  |
| `PENDING_REVIEW` | `REJECTED`       | admin  | reject (reason required)                            |
| `ACTIVE`         | `INACTIVE`       | vendor | pause                                               |
| `INACTIVE`       | `ACTIVE`         | vendor | resume (only ever reached from an approved state)   |
| `ACTIVE`         | `PENDING_REVIEW` | system | vendor edits a content field                        |
| `INACTIVE`       | `PENDING_REVIEW` | system | vendor edits a content field                        |
| `REJECTED`       | `PENDING_REVIEW` | system | vendor edits a content field (this is the resubmit) |
| any non-archived | `ARCHIVED`       | vendor | archive (includes `REJECTED`)                       |
| `ARCHIVED`       | `PENDING_REVIEW` | vendor | restore                                             |

Every other transition is `409`. A `PENDING_REVIEW` listing stays `PENDING_REVIEW` when edited.

**What this changes in `listing-design.md` / KAN-43** (hand-off, because KAN-42 is not merged yet):

1. `placementStatusSchema` and the Prisma `PlacementStatus` enum gain `REJECTED`. The public map and
   detail queries already filter `status = 'ACTIVE'`, so they need no change; a `REJECTED` listing is a
   `404` publicly, like any non-active one.
2. The vendor editor treats `REJECTED` like `ACTIVE`/`INACTIVE` for edits: allowed, sets
   `PENDING_REVIEW`. The status banner and My listings tabs gain `REJECTED` (the "Inactive" tab must
   not include it; "All" does). `pause`/`resume` answer `409` on `REJECTED`; `archive` is allowed.
3. `vendorPlacementSchema` gains `rejectionReason: string | null`, filled from the latest event only
   while `status = REJECTED`.
4. The "admin approval, rejection and moderation queue: KAN-14" rows and the `PENDING_REVIEW -> INACTIVE`
   row are superseded by the table above.

## Data model (Prisma)

```prisma
enum PlacementStatus {
  ACTIVE
  PENDING_REVIEW
  INACTIVE
  REJECTED // an admin refused it; the vendor must edit it to resubmit
  ARCHIVED
}

enum ModerationAction {
  APPROVED
  REJECTED
}

model ModerationEvent {
  id          String           @id @default(uuid())
  placementId String
  placement   Placement        @relation(fields: [placementId], references: [id], onDelete: Cascade)
  adminId     String?
  admin       User?            @relation("ModerationEvents", fields: [adminId], references: [id], onDelete: SetNull)
  action      ModerationAction
  reason      String?          // required when action = REJECTED, null for APPROVED
  createdAt   DateTime         @default(now())

  // History of one listing, newest first (detail pane, vendor rejection reason).
  @@index([placementId, createdAt])
}

model Placement {
  // ...existing fields...
  moderationEvents ModerationEvent[]

  // @@index([status]) is replaced by the composite below
  @@index([status, updatedAt]) // moderation queue, oldest first
}

model User {
  // ...existing fields...
  moderationEvents ModerationEvent[] @relation("ModerationEvents")
}
```

If KAN-43 has already replaced `@@index([vendorId])` with `@@index([vendorId, status])`, this
migration leaves it alone. Run `pnpm db:migrate` then `pnpm db:generate`; the migration is additive
except for the index swap and the enum value, so existing rows are untouched. Existing
`PENDING_REVIEW` rows from the seed or earlier testing simply appear in the queue.

Both decisions are conditional writes inside one transaction:

```ts
// approve: succeeds only if still pending, unchanged since the admin looked, and has a photo
prisma.$transaction(async (tx) => {
  const { count } = await tx.placement.updateMany({
    where: {
      id,
      status: 'PENDING_REVIEW',
      updatedAt: expectedUpdatedAt,
      photos: { isEmpty: false },
    },
    data: { status: 'ACTIVE' },
  })
  if (count === 0) return null // route reads the row once more to choose 404 / 409 code
  await tx.moderationEvent.create({ data: { placementId: id, adminId, action: 'APPROVED' } })
  return tx.placement.findUniqueOrThrow({ where: { id }, include: detailInclude })
})
// reject is the same with data: { status: 'REJECTED' }, no photos condition, and reason on the event
```

Approve bumps `updatedAt` (it is `@updatedAt`); that is fine, the client uses the returned row.

## Shared Zod schemas (`packages/shared/src/moderation.ts`)

```ts
// placement.ts: placementStatusSchema = z.enum(['ACTIVE','PENDING_REVIEW','INACTIVE','REJECTED','ARCHIVED'])

moderationActionSchema = z.enum(['APPROVED', 'REJECTED'])

adminPlacementListQuerySchema = z.object({
  status: placementStatusSchema.default('PENDING_REVIEW'),
  type: placementTypeSchema.optional(),
  city: z.string().trim().min(1).max(80).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
})

approvePlacementRequestSchema = z.object({
  expectedUpdatedAt: z.string().datetime(), // updatedAt of the detail the admin was viewing
})

rejectPlacementRequestSchema = approvePlacementRequestSchema.extend({
  reason: z
    .string()
    .trim()
    .min(10, VALIDATION_CODES.reasonTooShort)
    .max(500, VALIDATION_CODES.reasonTooLong),
})

moderationEventSchema = z.object({
  id: z.string(),
  action: moderationActionSchema,
  reason: z.string().nullable(),
  adminName: z.string().nullable(), // null once the admin account is deleted
  createdAt: z.string(),
})

adminPlacementSummarySchema = z.object({
  id,
  title,
  type,
  city,
  pricePerMonth,
  status,
  cover: z.string().url().nullable(),
  photoCount: z.number().int().nonnegative(),
  vendorName: z.string(),
  updatedAt: z.string(), // queue position / "waiting since"
})

adminPlacementDetailSchema = placementDetailSchema.extend({
  vendor: z.object({ id: z.string(), name: z.string(), email: z.string() }),
  archivedAt: z.string().nullable(),
  updatedAt: z.string(),
  events: z.array(moderationEventSchema), // newest first
})

adminPlacementListResponseSchema = z.object({
  placements: z.array(adminPlacementSummarySchema),
  total: z.number().int().nonnegative(),
})
adminPlacementResponseSchema = z.object({ placement: adminPlacementDetailSchema })
```

Rules worth stating:

- The reason bounds are a guess: 10 stops "no" and "bad", 500 fits a paragraph. Cheap to change.
- `VALIDATION_CODES` gains `reasonTooShort: 'validation.reason.tooShort'` and
  `reasonTooLong: 'validation.reason.tooLong'` (and `reasonRequired` if the form distinguishes empty),
  following the convention in `i18n-design.md`: schema messages are codes, `FieldError` renders
  `t(code)`.
- `errorCodeSchema` gains the codes in the API contract below. The web `error.*` catalog must cover
  them in all three languages (the catalog completeness test enforces it).
- `placementDetailSchema.vendor` is not exposed publicly; the `vendor` block is admin-only and lives
  only in `adminPlacementDetailSchema`. `adminName` is the admin's display name, shown to other
  admins only.
- Unknown keys in a body are stripped; a client cannot send `status` or `adminId`.

## API contract

Routes under `/api/admin/placements`, JSON, called with `credentials: 'include'`. Every route runs
`requireAuth` then `requireRole('ADMIN')`.

| Route                                    | Body / query                    | Success                     | Errors                                      |
| ---------------------------------------- | ------------------------------- | --------------------------- | ------------------------------------------- |
| `GET /api/admin/placements`              | `adminPlacementListQuerySchema` | `200 { placements, total }` | `400`, `401`, `403`                         |
| `GET /api/admin/placements/:id`          | none                            | `200 { placement }`         | `400` bad id, `401`, `403`, `404`           |
| `POST /api/admin/placements/:id/approve` | `approvePlacementRequestSchema` | `200 { placement }`         | `400`, `401`, `403`, `404`, `409` x3, `429` |
| `POST /api/admin/placements/:id/reject`  | `rejectPlacementRequestSchema`  | `200 { placement }`         | `400`, `401`, `403`, `404`, `409` x2, `429` |

Error codes (all `{ error, code }`, English sentence in `error` as the fallback per `i18n-design.md`):

| Status | Code                              | When                                                                                  |
| ------ | --------------------------------- | ------------------------------------------------------------------------------------- |
| 401    | `NOT_AUTHENTICATED`               | no session (existing)                                                                 |
| 403    | `FORBIDDEN`                       | `VENDOR` or `CLIENT` (existing)                                                       |
| 400    | `INVALID_PLACEMENT_ID`            | `:id` is not a UUID (existing)                                                        |
| 400    | `INVALID_INPUT` / `INVALID_QUERY` | body / query fails the shared schema; `fieldErrors` carry validation codes (existing) |
| 404    | `PLACEMENT_NOT_FOUND`             | no such listing (existing)                                                            |
| 409    | `PLACEMENT_NOT_PENDING`           | status is no longer `PENDING_REVIEW` (another admin decided, vendor archived it)      |
| 409    | `PLACEMENT_CHANGED`               | still pending but `updatedAt` differs from `expectedUpdatedAt`                        |
| 409    | `PLACEMENT_NO_PHOTOS`             | approve on a listing with `photos.length === 0`                                       |
| 429    | `RATE_LIMITED`                    | limiter (existing)                                                                    |

Server-side rules:

1. When a conditional update touches zero rows the route reads the row once and chooses the code in
   this order: missing -> `404`; `status !== PENDING_REVIEW` -> `PLACEMENT_NOT_PENDING`;
   `updatedAt !== expectedUpdatedAt` -> `PLACEMENT_CHANGED`; otherwise (approve only, no photos) ->
   `PLACEMENT_NO_PHOTOS`. The read is only for the message; the decision itself is never made from it.
2. A `409` response includes nothing about the other admin. The UI refetches the detail and shows the
   current state.
3. `GET` list: `where { status, type?, city? }`, `orderBy [{ updatedAt: 'asc' }, { id: 'asc' }]`,
   `total` on the same filter. Summaries do not include description or the full photo list.
4. `GET :id` returns photos as absolute URLs (`API_PUBLIC_URL` prefix, as in the vendor routes) and
   `events` newest first, limited to the last 20.
5. Approving or rejecting twice with the same body is not idempotent: the second call is
   `PLACEMENT_NOT_PENDING`. That is intended; the UI handles it as "already done".
6. `createApp` takes a new optional `adminPlacementStore` dependency, mounted only when present, so
   route tests stub it and need no database (same pattern as `vendorPlacementStore`). The store
   interface has `list`, `findById`, `approve`, `reject`, with the decision methods returning a
   discriminated result (`{ ok: true, placement } | { ok: false, reason: 'NOT_FOUND' | 'NOT_PENDING' | 'CHANGED' | 'NO_PHOTOS' }`)
   so the route maps results to codes and the Prisma store owns the transaction.
7. The public `GET /api/placements/*` routes are untouched. The vendor routes change only as listed in
   [State machine](#state-machine).

## Screens and layout

Admin screens sit behind `RequireAuth` plus an `ADMIN` role check; any other role who opens the URL is
sent to `/`. The header shows a **Moderation** link to admins only.

| Route                   | Screen                          |
| ----------------------- | ------------------------------- |
| `/admin/moderation`     | Queue (list)                    |
| `/admin/moderation/:id` | Detail / preview with decisions |

One page component for both: on desktop (>= 1024px) the route shows the list at left and the detail pane
at right (the same split the map uses); `:id` selects the open item and survives a reload. On mobile
the list is full screen and `:id` opens the detail as its own screen with a back button.

### Queue

```
ModerationPage
├─ Header row: <h1> "Moderation" · total ("12 waiting")
├─ Filters row: Tabs (Pending review · Rejected · Active · All) · Select "Type" · Select "City"
├─ Table (desktop) / Cards (mobile)
│   ├─ TableHead: Photo · Title / city · Type · Vendor · Price per month · Waiting since
│   └─ TableRow per listing, clickable, aria-current on the open one
│       ├─ cover thumbnail (or placeholder) + a Badge "No photos" when photoCount = 0
│       └─ "Waiting since" as a relative duration with the absolute date in a title
└─ Pagination: Button "Previous" · "Page n of m" · Button "Next"
```

The default tab is Pending review, sorted oldest first; the order is fixed (no column sorting) because
the queue is a work list, not a report. Other tabs exist so an admin can find a listing they decided on;
their sort is the same.

### Detail / preview pane

```
ModerationDetail
├─ Back link (mobile) · Badge for status
├─ Title, city, address, vendor name + email
├─ Photo gallery (cover large, thumbnails); Alert "No photos" when empty
├─ Specs (DescriptionList-style grid): type, price, tier, size, lighting, LED fields, coordinates
├─ Description (plain text, whitespace preserved)
├─ Mini map (read-only, pin at the coordinates; reuses the map components)
├─ History Card: list of ModerationEvents ("Approved by Aziza · 3 Mar", "Rejected by Rustam · 5 Mar" + reason)
└─ Sticky footer (only when status = PENDING_REVIEW):
     Button variant=outline "Reject" · Button "Approve"
```

- **Approve** needs no confirmation dialog: it is reversible only by the vendor's edit, but a misclick
  is cheap and an extra dialog per decision slows a queue. It is disabled while submitting and when
  `photoCount = 0`, with the reason in text beside it.
- **Reject** opens a `Dialog` with a `Field` containing `FieldLabel` "Reason for the vendor",
  `Textarea` rows=4 with a character counter (`n/500`), `FieldDescription` "The vendor will see this
  text." and `FieldError`. Buttons: `Cancel` (default focus) and a destructive "Reject listing". The
  form is React Hook Form + `zodResolver(rejectPlacementRequestSchema.pick({ reason: true }))`; the
  `expectedUpdatedAt` is added from the loaded detail on submit. Both buttons are disabled while the
  request runs and the confirm reads "Rejecting…".
- After a successful decision: toast, the item leaves the Pending list, and focus and selection move to
  the next item in the list (the one that now sits in the same position), or to the empty state.
- **shadcn/ui components.** Already in `components/ui`: `badge`, `button`, `card`, `dialog`, `field`,
  `input`, `label`, `select`, `separator`, `skeleton`, `sonner`, `tabs`, `textarea`. To add with
  `pnpm dlx shadcn@latest add <name>` from `apps/web`: `table`, `alert` (pagination reuses Previous / Next
  `Button`s as in the vendor list). KAN-43 also adds `table`; whichever branch
  merges first adds it, the other just pulls it in. Nothing else, and generated files stay as
  generated.
- **Mobile (< 768px).** The table becomes `Card`s; filters scroll horizontally; the decision footer
  stays sticky; tap targets are at least 40 px; the reject dialog is full width.

### States

- **Queue, loading:** five `Skeleton` rows; tabs and filters stay interactive.
- **Queue, empty (Pending):** _"The queue is empty. New listings appear here when vendors submit
  them."_ Empty for another tab or filter: _"No listings match these filters."_ with a "Clear filters"
  button.
- **Queue, error:** inline `Card` with _"Couldn't load the moderation queue."_ and "Try again".
- **Detail, loading:** page-shaped `Skeleton`s. `404`: _"Listing not found"_ with a link back to the
  queue. A `403` (someone's role changed under them) redirects to `/`.
- **Detail, not pending:** shows the listing without the decision footer, with the status Badge and the
  history, so an admin can look up a listing already decided.
- **Decision, submitting:** buttons disabled; no optimistic removal from the list (the result may be a
  `409`).
- **Decision, success:** toast _"Listing approved."_ / _"Listing rejected."_.
- **Decision, `409`:** the current detail is refetched and a `sonner` toast explains it with the
  code's copy: already decided by someone else, or "The vendor changed this listing. Review it again."
  (`PLACEMENT_CHANGED`); the reject dialog closes and keeps the typed reason out of the way (it is
  lost; the reason may no longer fit changed content).
- **Decision, other errors (`401`, `429`, `5xx`, network):** toast with the code's copy; the reject
  dialog stays open with the text intact. `401` redirects to `/sign-in?next=<current path>`.
- **Accessibility.** The dialog returns focus to the Reject button on cancel; the selected row has
  `aria-current`; status Badges carry text, not just colour; the character counter is
  `aria-live="polite"` and announces only near the limit; decisions are reachable by keyboard from the
  detail without the mouse.

### i18n keys

All three of `en.ts`, `uz.ts`, `ru.ts`, grouped by surface as in `i18n-design.md`. Names are a
proposal; KAN-61 may adjust them, as long as the three catalogs agree.

- `nav.moderation`
- `moderation.title`, `moderation.waiting` (counted: `{count} waiting`, plural forms for ru)
- `moderation.tab.pending`, `.rejected`, `.active`, `.all`
- `moderation.filter.type`, `.city`, `.allCities`, `.clear`
- `moderation.col.photo`, `.title`, `.type`, `.vendor`, `.price`, `.waitingSince`
- `moderation.noPhotos`, `moderation.noPhotos.blocked` ("Add at least one photo before approving" shown to the admin as why Approve is off)
- `moderation.detail.vendor`, `.specs`, `.description`, `.location`, `.history`, `.historyEmpty`, `.back`
- `moderation.event.approved`, `moderation.event.rejected` (interpolate `{admin}`, `{date}`)
- `moderation.action.approve`, `.reject`, `.approving`, `.rejecting`
- `moderation.reject.title`, `.reasonLabel`, `.reasonHelp`, `.cancel`, `.confirm`
- `moderation.toast.approved`, `moderation.toast.rejected`
- `moderation.empty.pending`, `moderation.empty.filtered`
- `moderation.error.load`, `moderation.error.notFound`, `moderation.retry`
- `placement.status.rejected` (and the other status labels if not already keyed)
- `vendor.rejection.title`, `vendor.rejection.hint` (vendor editor banner: "Rejected. Fix the issues below and save to send it for review again.")
- `error.PLACEMENT_NOT_PENDING`, `error.PLACEMENT_CHANGED`, `error.PLACEMENT_NO_PHOTOS`
- `validation.reason.tooShort`, `validation.reason.tooLong`

Dates (waiting since, event times) go through the `Intl` formatters bound to the active locale, not
hard-coded `en-GB`.

## Testing notes

- Schema unit tests: reason bounds (9, 10, 500, 501 characters; whitespace-only), `expectedUpdatedAt`
  rejects non-ISO strings, list query defaults to `PENDING_REVIEW` and clamps `pageSize`, `status`,
  `adminId` in a body are stripped, `placementStatusSchema` accepts `REJECTED`.
- Route tests via Supertest with a stub store: `VENDOR`, `CLIENT` and no session get `403`/`401` on
  every route; approve and reject happy paths; each store `reason` maps to its `409`/`404` code;
  missing reason is `400` with the validation code; bad UUID is `400`; list ordering and filter are
  passed to the store; rate limiter returns `429` with `adminRateLimitMax` lowered.
- Store tests (against the DB, or with a Prisma stub asserting the `where`): approve's `where`
  carries status, `updatedAt` and `photos: { isEmpty: false }`; approving a listing without photos
  changes nothing and writes no event; two decisions on the same row yield one winner and one event;
  a vendor edit between read and approve makes the approve fail with `CHANGED`; the transaction rolls
  back the status change if the event insert fails.
- Component tests: queue tabs and filters, empty and error states, the reject dialog (reason
  validation, cancel does nothing, confirm calls the API once with `expectedUpdatedAt`), the Approve
  button disabled with no photos, a `409` refetching the detail, and the history list.
- Cross-feature test: vendor creates -> admin approves -> listing shows on the public map; vendor edits
  -> it leaves the map and re-enters the queue; admin rejects -> vendor sees the reason and cannot
  resume; vendor edits -> back in the queue.
- i18n: the existing catalog completeness test covers the new keys; add a render test of the Russian
  plural for `moderation.waiting`.

## Open questions

- **Should the vendor-facing `INACTIVE` tab be told apart from `REJECTED` in the KAN-42 design now?**
  This design assumes KAN-43 adds `REJECTED` as part of its work (hand-off item 1-3). If KAN-43 has
  merged without it, KAN-59 owns the enum change and the vendor-side edits; either way one of the two
  must do it before KAN-60.
- **No diff of what the vendor changed.** Re-review shows the full listing and a history, not a field
  diff. A diff needs a snapshot of the last approved content (a JSON column or a revision table). Worth
  it if edits turn out to be frequent; `listing-design.md` already flags the volume.
- **Admin take-down of a live listing** (ACTIVE -> REJECTED/ARCHIVED by an admin) is not covered; it
  also decides the "who archived it?" question left open in `listing-design.md`. Likely a follow-up
  that adds `ModerationAction.TAKEN_DOWN` and a status rule.
- **Reason language.** The reason is admin-written text in whichever language the admin chooses. The
  vendor may read another. Fixed canned reasons (a `Select` of codes plus an optional note) would be
  translatable but are less useful; revisit if vendors report confusing rejections.
- **Offset pagination** can skip an item while the queue shifts. Acceptable at this scale; switch to a
  cursor on `(updatedAt, id)` if the queue grows.
- **Who is the first admin?** Seeded. The seed script (`apps/api/prisma/seed.ts` or equivalent) needs a
  documented admin account for development and the e2e tests, with the password from the environment.

## Out of scope

- Notifying vendors (email, push, in-app) of a decision.
- Admin editing, archiving or deleting listings; bulk approve/reject.
- A diff view of vendor edits; reassigning or locking an item to one admin ("claim").
- Free-text search in the queue and admin analytics.
- The input-validation audit of all write endpoints (KAN-20).

## Hand-off to KAN-59 / KAN-60 / KAN-61

**KAN-59 Backend**

1. Prisma: add `REJECTED` to `PlacementStatus` (if KAN-43 has not), `ModerationAction`,
   `ModerationEvent`, the `User` relation, and swap `@@index([status])` for `@@index([status, updatedAt])`.
   Start from the latest `main`, read `schema.prisma` first, then `pnpm db:migrate` and `pnpm db:generate`.
2. Shared: `moderation.ts` schemas above, `REJECTED` in `placementStatusSchema`, new `ErrorCode`s
   (`PLACEMENT_NOT_PENDING`, `PLACEMENT_CHANGED`, `PLACEMENT_NO_PHOTOS`) and the reason validation codes.
3. API: `adminPlacementStore` (Prisma) with the transactional conditional updates, the router under
   `/api/admin/placements` behind `requireAuth` + `requireRole('ADMIN')`, `adminRateLimitMax`, wired in
   `createApp` as an optional dependency. Error responses carry codes, not sentences only.
4. Vendor side adjustments if KAN-43 is merged: `REJECTED` handling, `rejectionReason` in the vendor
   response, `pause`/`resume` `409` on `REJECTED`.
5. Seed an admin user. Tests per Testing notes (Supertest with stubs plus store tests).

**KAN-60 Frontend**

1. `/admin/moderation` and `/admin/moderation/:id` behind an ADMIN guard; the admin-only header link.
2. Queue, detail pane, reject `Dialog`, and every state in [States](#states), built from shadcn/ui
   only (`pnpm dlx shadcn@latest add table alert` from `apps/web`; skip any KAN-43 already added).
3. Forms use `Field` + `Controller` + `zodResolver` with the shared schema (the `form` component is a
   stub). TanStack Query for the list, detail and mutations; on a decision invalidate the list and set
   the detail from the response.
4. Add every key from the i18n list to `en.ts`, `uz.ts` and `ru.ts`, plus the `error.*` and
   `validation.*` keys for the new codes. Vendor editor/My listings: `REJECTED` badge, tab handling and
   the rejection banner, if KAN-43 is merged.

**KAN-61 Testing**

1. Component and route tests as in Testing notes; the end-to-end flow (vendor create -> approve ->
   public map -> edit -> re-review -> reject -> vendor sees reason) in uz and ru as well as en, in the
   style of KAN-79.
2. The concurrency cases (two admins, vendor edit during review) against the real store, not only stubs.
3. `pnpm lint`, `pnpm typecheck`, `pnpm test` all green and their output shown.
