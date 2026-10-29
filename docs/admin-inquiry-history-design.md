# Admin client inquiry history: design (KAN-15 / KAN-62)

Admins need to see what a client sent, to whom and when, to settle disputes between clients and
vendors. This is a read-only view over the existing `Inquiry` model; no new table and no migration.

## Decisions

- **Reuse `Inquiry`.** Client, vendor and placement are already relations on it. The list query uses
  the existing `[clientId, createdAt]` index when filtered by client; a full scan of inquiries is fine
  at this marketplace's scale.
- **Read-only.** Admins look, they do not change status or edit messages. Both routes are `GET`.
- **Page numbers, not cursors.** The client history uses cursors; an admin wants "page 3 of 7" and a
  total. Page size is fixed at `ADMIN_INQUIRY_PAGE_SIZE` (20), newest first.
- **`clientQuery`** matches, case-insensitively and as a substring, the client's account email, the
  inquiry's `contactName` or its `contactEmail`. Clients have no name on `User`, so the contact name
  is the only name there is.
- **`from` / `to`** are calendar dates, both inclusive, on `createdAt` (UTC). `from > to` is
  `400 INVALID_QUERY` with `validation.dates.order` on `to`.
- **Messages are a list.** An inquiry holds one message today; the API returns it as a one-element
  `messages` array so vendor replies (KAN-17) can be appended without a contract change.

## API

Both behind `requireAuth` + `requireRole('ADMIN')` (401 / 403 otherwise).

| Route                          | Query / params                                    | Response                            |
| ------------------------------ | ------------------------------------------------- | ----------------------------------- |
| `GET /api/admin/inquiries`     | `clientQuery`, `status`, `from`, `to`, `page`     | `AdminInquiryListResponse`          |
| `GET /api/admin/inquiries/:id` | `id` (uuid; malformed or unknown → 404)           | `AdminInquiryDetailResponse`        |

Errors: `400 INVALID_QUERY`, `404 INQUIRY_NOT_FOUND`. Schemas live in
`packages/shared/src/admin-inquiry.ts`.

## Layout (`/admin/inquiries`)

Follows the admin vendors page: same header (with a new "Inquiries" link), one card.

```
[ Search client name or email ] [ Status ▾ ] [ From ] [ To ]  [Reset]
┌────────────────────────────────────────────────────────────────────┐
│ Date        Client               Placement        Vendor    Status │
│ 29 Oct 2026 Aziz (aziz@…)        Billboard, Tash. Reklama+  NEW    │
│ ...                                                                │
└────────────────────────────────────────────────────────────────────┘
               ‹ Prev   Page 2 of 7   Next ›
```

Clicking a row opens a detail sheet/dialog: client account and contact details, vendor, placement,
dates, status, and the message history in chronological order. Filters and page live in the URL
search params so a link to a filtered view can be shared. All strings in en/ru/uz under
`adminInquiries.*`.
