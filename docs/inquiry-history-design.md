# Client inquiry history: design (KAN-9 / KAN-38)

The read side of the inquiry feature. KAN-8 lets a client send an inquiry; this lets them see what
they sent, to whom, and where it stands. It adds no new table and no new status transition — it is a
query over rows `POST /api/inquiries` already writes, plus a page to show them.

## Decisions

- **The list is the feature; the detail is a disclosure.** An inquiry is small enough to render whole
  in an expanded row, so the history is one page with expandable rows rather than a list page plus a
  detail route. No `/inquiries/:id` route and no second fetch.
- **Authentication required, and scoped to the session.** `GET /api/inquiries` sits behind
  `requireAuth` and `requireRole('CLIENT')` and reads `clientId` from the session only. There is no
  `clientId` query parameter: one client's history must not be reachable by guessing another's id.
  The admin dispute view (KAN-15) is a separate route with its own authorisation, not this one with a
  parameter.
- **Newest first, cursor-paginated.** The `@@index([clientId, createdAt])` index KAN-34 already added
  exists for exactly this query. Pagination is by `createdAt` cursor rather than `offset`, because a
  new inquiry arriving mid-scroll shifts every offset and silently duplicates a row.
- **Status is read-only here**, as KAN-34 decided. `NEW → READ → RESPONDED → CLOSED` is the vendor's
  workflow; the client observes it. This task adds no transition, not even "cancel" — withdrawing an
  inquiry is a status change and belongs with the rest of them in KAN-15.
- **Placement context is denormalised into the response.** A history row shows the placement's title,
  city and type, so the list renders from one request without the client fetching each placement. The
  row keeps `placementId` so the UI can link back to the placement on the map.
- **A deleted or archived placement must not hide an inquiry.** `Inquiry.placementId` cascades on
  delete, so a hard-deleted placement takes its inquiries with it — but archiving does not, and an
  archived placement is the common case. The join therefore does not filter on
  `placement.status = 'ACTIVE'`: a client's record of what they sent survives the vendor archiving the
  listing. The row renders without a link when the placement is no longer viewable.
- **Contact details are shown back to the client.** They were captured per inquiry, not read from the
  profile, so the client cannot otherwise tell which number they gave a vendor six weeks ago.
- **Empty is a first-run state, not an error.** A client with no inquiries sees a prompt pointing at
  the map, not a bare "no results" line.

## API contract

One new route under the existing `/api/inquiries` router.

| Route                | Query                       | Success                         | Errors                                                             |
| -------------------- | --------------------------- | ------------------------------- | ------------------------------------------------------------------ |
| `GET /api/inquiries` | `inquiryHistoryQuerySchema` | `200 { inquiries, nextCursor }` | `400` invalid query; `401` not authenticated; `403` not a `CLIENT` |

Server-side rules:

1. `requireAuth`, then `requireRole('CLIENT')` — the same guard chain as `POST`, for the same reason.
2. Read `clientId` from the session. Never from the query.
3. Select the client's inquiries ordered by `createdAt DESC, id DESC`, limited to `limit + 1` rows.
   The tie-break on `id` matters: two inquiries can share a `createdAt` at millisecond resolution, and
   without it a cursor can loop or skip.
4. When `status` is given, filter to it. When `cursor` is given, take rows strictly older than it.
5. If `limit + 1` rows came back, drop the extra and return its predecessor's cursor as `nextCursor`;
   otherwise `nextCursor` is `null`. Deriving it from the extra row rather than counting means the
   last page never advertises a page that turns out to be empty.

`GET /api/inquiries/:id` is deliberately absent: the list returns whole inquiries, so a detail
fetch would duplicate it.

### Cursor format

The cursor is `"<createdAt ISO>|<id>"`, base64url-encoded so it reads as opaque and nobody builds a
client that parses it. It is decoded and validated server-side; a malformed cursor is a `400`, not a
silent reset to page one, which would otherwise look like the list restarting at random.

The cursor is not a security boundary — it only ever narrows a query already scoped to the session's
`clientId`, so a forged cursor can reach another page of the client's own history and nothing else.

## Shared Zod schemas (`packages/shared/src/inquiry.ts`)

Added to the existing file, beside the schemas KAN-34 put there.

```ts
export const INQUIRY_PAGE_SIZE = 20
export const INQUIRY_PAGE_SIZE_MAX = 50

export const inquiryHistoryQuerySchema = z.object({
  status: inquiryStatusSchema.optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(INQUIRY_PAGE_SIZE_MAX).default(INQUIRY_PAGE_SIZE),
})
export type InquiryHistoryQuery = z.infer<typeof inquiryHistoryQuerySchema>

/** The placement context carried on a history row, enough to render it without a second fetch. */
export const inquiryPlacementSummarySchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  city: z.string(),
  type: placementTypeSchema,
  /** False once the placement is archived or inactive: the row renders without a link. */
  isViewable: z.boolean(),
})

export const inquiryHistoryItemSchema = inquirySchema.extend({
  placement: inquiryPlacementSummarySchema.nullable(),
})
export type InquiryHistoryItem = z.infer<typeof inquiryHistoryItemSchema>

export const inquiryHistoryResponseSchema = z.object({
  inquiries: z.array(inquiryHistoryItemSchema),
  nextCursor: z.string().nullable(),
})
export type InquiryHistoryResponse = z.infer<typeof inquiryHistoryResponseSchema>
```

`inquiryHistoryItemSchema` extends `inquirySchema` rather than redeclaring the fields, so the row the
history shows and the row `POST` returns cannot drift apart. `placement` is nullable for the
hard-deleted case, and `isViewable` distinguishes "archived, so no link" from "gone".

`limit` uses `z.coerce` because it arrives as a query string. As with `createInquiryRequestSchema`,
that makes the input and output types differ — anything binding this to a form needs `z.input`.

## Store interface (`apps/api/src/inquiries/store.ts`)

One method on the existing `InquiryStore`, so the route keeps taking its dependencies as arguments
and the tests keep running without a database.

```ts
listClientInquiries: (input: {
  clientId: string
  status?: InquiryStatus
  cursor?: { createdAt: Date; id: string }
  limit: number
}) => Promise<InquiryHistoryItem[]>
```

The store takes the cursor already decoded, so cursor encoding stays in the route and the store stays
a plain query. It returns up to `limit` rows; the route asks for `limit + 1` and does the trimming.

## Screens and layout

A new route, `/inquiries`, reachable from `AuthControls` — a link that renders only for a signed-in
`CLIENT`, next to the signed-in email. Guests and vendors never see it.

The route is guarded. `GuestOnly` is the wrong tool (it is the inverse), so this adds its counterpart,
`RequireAuth`, which redirects to `/sign-in?next=/inquiries` — the `next` parameter the hardened
`useNextPath` already handles.

```
InquiryHistoryPage (/inquiries)
├─ header: "Your inquiries" + AuthControls
├─ InquiryStatusFilter  (Tabs: All · New · Read · Responded · Closed)
└─ InquiryHistoryList
    ├─ InquiryHistoryRow  (Collapsible, one per inquiry)
    │   ├─ trigger row
    │   │   ├─ placement title + city     (Link to /placements?focus=<id>, when isViewable)
    │   │   ├─ InquiryStatusBadge         (Badge, variant per status)
    │   │   └─ sent date                  (formatInquiryDate)
    │   └─ CollapsibleContent
    │       ├─ message                    (whitespace-pre-wrap, plain text)
    │       ├─ campaign: start date · duration   (omitted when both unset)
    │       └─ contact: name · phone      (formatUzPhone) · email
    ├─ … rows …
    └─ Button variant=outline "Load older"   (when nextCursor !== null)
```

New shadcn/ui components this task adds, run from `apps/web`:
`pnpm dlx shadcn@latest add collapsible badge tabs`.

Strings live in a `copy` object at the top of each component file, as in `InquiryFormDialog`, ready
for KAN-19.

### Status presentation

The client sees the vendor's workflow, so the labels are written from the client's side rather than
exposing the enum:

| Status      | Label   | Badge variant | Reads as                           |
| ----------- | ------- | ------------- | ---------------------------------- |
| `NEW`       | Sent    | `secondary`   | delivered, not yet opened          |
| `READ`      | Seen    | `outline`     | the vendor opened it               |
| `RESPONDED` | Replied | `default`     | the vendor replied, off-platform   |
| `CLOSED`    | Closed  | `outline`     | finished, or expired after 14 days |

`RESPONDED` is the one that needs care: the reply arrives by phone or email, not in Reclo, so the row
says the vendor replied and leaves it there rather than implying a message is waiting on the platform.

### States

- **Loading**: three `Skeleton` rows, not a spinner — the shape is known, so the page should not jump.
- **Empty (no inquiries at all)**: _"You have not sent any inquiries yet"_ with a button to the map.
- **Empty (filtered)**: _"No inquiries with this status"_ and a button clearing the filter back to All.
  Distinct from the above: a client who filtered to Replied and sees the first-run prompt will think
  their history was lost.
- **Error**: inline message with a retry button. TanStack Query holds the previous page while
  refetching, so a failed "Load older" leaves the rows already on screen alone.
- **Paging**: "Load older" shows a pending label while fetching and is disabled; rows append.
- **Not signed in**: never rendered — `RequireAuth` redirects first.

### Accessibility

Each row's trigger is a `button` with `aria-expanded`, and the panel it controls is linked by
`aria-controls`. The status badge is not colour-only: the label carries the meaning, which also keeps
it legible once KAN-19 translates it. The filter is a `Tabs` list, so arrow keys move between statuses.
"Load older" keeps focus after the fetch, so a keyboard user is not returned to the top of the page.

## Testing notes (KAN-41)

- Schema unit tests: `limit` coercion, default and both bounds; an unknown `status` rejected; a
  history item parsing with `placement` present and `null`.
- Route tests via Supertest with a stub store: the happy path; `401` and `403` from the guard chain;
  a `clientId` in the query being ignored rather than honoured; `nextCursor` null on a short page and
  set on a full one; a malformed cursor returning `400`; the status filter narrowing results.
- A store-level test that two inquiries sharing a `createdAt` page without looping or skipping, which
  is the whole reason for the `id` tie-break.
- Component tests: the three empty states distinguished; a row expanding and collapsing; a status
  label rendering per enum value; "Load older" appending rather than replacing; an archived placement
  rendering without a link.

## Out of scope

- Vendor inbox and status transitions, including anything that would let a client withdraw an
  inquiry (KAN-15).
- The admin dispute view over another client's history (KAN-15) — a separate route and guard.
- Vendor notification email (KAN-17).
- Uzbek and Russian translations (KAN-19 / KAN-76..79); this task only keeps strings in one place.
- Search over message text, and date-range filtering. Status plus newest-first paging covers the
  volumes a single client will have for the foreseeable future.
