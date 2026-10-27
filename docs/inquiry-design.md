# Vendor inquiry form: design (KAN-8 / KAN-34)

## Decisions

- A client sends one inquiry about one placement. The inquiry carries a message plus the campaign
  details a vendor needs to quote: desired start date and duration in months.
- **Authentication required.** `POST /api/inquiries` sits behind `requireAuth` from the auth task
  (KAN-16). Guest inquiries are not accepted: KAN-9 ("clients view their inquiry history") needs a
  stable owner for every row, and an unauthenticated sender has none. An unauthenticated visitor who
  opens the form is prompted to sign in and returned to the placement afterwards.
- **`clientId` and `vendorId` both live on the row.** `vendorId` is denormalised from the placement at
  insert time so the vendor inbox (KAN-17, KAN-15) can query without joining through `Placement`, and
  so re-assigning a placement to another vendor later cannot silently move old inquiries.
- **Contact details are captured per inquiry**, not read from the user profile. The account email is
  where Reclo reaches the client; the phone number is how the vendor does, and in this market that is
  usually Telegram. The form pre-fills `contactEmail` from the session and lets the client change it.
- **Phone is required and validated for Uzbekistan** (`+998` plus nine digits). Vendors follow up by
  phone far more than by email, so an inquiry without a reachable number is not useful to them.
- **Status is vendor-facing workflow**, not client-facing: `NEW → READ → RESPONDED → CLOSED`. The client
  sees it read-only in their history (KAN-9). Transitions belong to the vendor inbox task, not here.
- **Duplicate suppression, with an expiry.** A second inquiry from the same client on the same
  placement while an earlier one is still open (`NEW` or `READ`) is rejected with `409`. The block
  lifts after 14 days: a vendor who opens an inquiry and never replies must not lock the client out of
  that placement permanently, which a status-only rule would do.
- **Rate limiting** on `POST /api/inquiries`, same approach as the auth routes.
- The message is stored and returned as plain text. Nothing in the inquiry pipeline renders it as HTML.

## Data model (Prisma)

```prisma
enum InquiryStatus {
  NEW
  READ
  RESPONDED
  CLOSED
}

model Inquiry {
  id               String        @id @default(uuid())
  placementId      String
  placement        Placement     @relation(fields: [placementId], references: [id], onDelete: Cascade)
  clientId         String
  client           User          @relation("ClientInquiries", fields: [clientId], references: [id], onDelete: Cascade)
  vendorId         String        // denormalised from placement.vendorId at insert time
  vendor           User          @relation("VendorInquiries", fields: [vendorId], references: [id], onDelete: Cascade)
  status           InquiryStatus @default(NEW)
  message          String
  contactName      String
  contactPhone     String        // E.164, +998XXXXXXXXX
  contactEmail     String
  desiredStartDate DateTime?     // date only; time component unused
  durationMonths   Int?
  createdAt        DateTime      @default(now())
  updatedAt        DateTime      @updatedAt

  @@index([clientId, createdAt])
  @@index([vendorId, status])
  @@index([placementId])
}
```

`User` gains two back-relations (`clientInquiries`, `vendorInquiries`) and `Placement` gains
`inquiries`. Both named relations are required because `Inquiry` points at `User` twice.

The `@@index([clientId, createdAt])` index serves the client history list (KAN-9), which reads
newest-first for one client. `@@index([vendorId, status])` serves the vendor inbox counting unread.

Duplicate suppression needs a partial unique index, which Prisma's schema language cannot express, so
the migration adds it as raw SQL:

```sql
CREATE UNIQUE INDEX "Inquiry_open_per_client_placement"
  ON "Inquiry" ("clientId", "placementId")
  WHERE "status" IN ('NEW', 'READ');
```

Without it, two submits racing past the application-level check both insert.

The index cannot carry the 14-day term: a Postgres index predicate must be `IMMUTABLE`, so it cannot
mention `now()`. A status-only index on its own would therefore defeat the expiry above — a stale
`NEW` row would keep rejecting the insert forever. The window lives in the route instead, which
closes an open inquiry older than 14 days (`status -> CLOSED`) before inserting the replacement. That
is also what frees the index to accept it. Closing the stale row is the one status transition this
task performs; the rest belong to the vendor inbox (KAN-15).

## Shared Zod schemas (`packages/shared/src/inquiry.ts`)

```ts
inquiryStatusSchema = z.enum(['NEW', 'READ', 'RESPONDED', 'CLOSED'])

uzPhoneSchema = z
  .string()
  .trim()
  .transform((value) => {
    const digits = value.replace(/[\s()\-.]/g, '').replace(/^\+/, '')
    // Accept the three forms people actually type: +998901234567, 998901234567,
    // and the bare national number 901234567. Normalise all to E.164.
    if (/^00998\d{9}$/.test(digits)) return `+${digits.slice(2)}`
    if (/^998\d{9}$/.test(digits)) return `+${digits}`
    if (/^\d{9}$/.test(digits)) return `+998${digits}`
    return value
  })
  .pipe(z.string().regex(/^\+998\d{9}$/, 'Enter a valid Uzbek number, e.g. +998 90 123 45 67'))

createInquiryRequestSchema = z.object({
  placementId: z.string().uuid(),
  message: z.string().trim().min(10).max(2000),
  contactName: z.string().trim().min(2).max(120),
  contactPhone: uzPhoneSchema,
  contactEmail: z.string().trim().toLowerCase().pipe(z.email()),
  desiredStartDate: z.string().date().optional(),
  durationMonths: z.coerce.number().int().min(1).max(24).optional(),
})

inquirySchema = z.object({
  id: z.string().uuid(),
  placementId: z.string().uuid(),
  status: inquiryStatusSchema,
  message: z.string(),
  contactName: z.string(),
  contactPhone: z.string(),
  contactEmail: z.string(),
  desiredStartDate: z.string().nullable(),
  durationMonths: z.number().int().nullable(),
  createdAt: z.string(),
})

inquiryResponseSchema = z.object({ inquiry: inquirySchema })
```

The display formatter `formatUzPhone('+998901234567') -> '+998 90 123 45 67'` lives in
`apps/web/src/lib/inquiries.ts` next to the existing `formatPrice` helpers, not in the schema: the
stored value stays canonical E.164.

`durationMonths` is capped at 24 because the pricing matrix in KAN-11 tops out at a two-year term.
`desiredStartDate` is a plain `YYYY-MM-DD` string over the wire; the API parses it to a `DateTime` at
midnight UTC. The client is not asked for a time, so no timezone question arises.

Unknown keys are stripped, so a `status`, `clientId` or `vendorId` in the request body has no effect —
all three are set server-side.

## API contract

Routes under `/api/inquiries`, JSON in and out, called with `credentials: 'include'`.

| Route                 | Body                         | Success           | Errors                                                                                                                                                                        |
| --------------------- | ---------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/inquiries` | `createInquiryRequestSchema` | `201 { inquiry }` | `400` validation `{ error, fieldErrors }`; `401` not authenticated; `403` not a `CLIENT`; `404` placement not found or not `ACTIVE`; `409` open inquiry already exists; `429` |

Server-side rules on `POST`:

1. `requireAuth`, then `requireRole('CLIENT')`. A vendor or admin cannot send an inquiry.
2. Load the placement. A missing placement and one that is not `ACTIVE` both return the same `404`
   `{ error: "Placement not found" }` — a client has no business learning that an archived or
   pending-review placement exists.
3. Load the client's newest open (`NEW` or `READ`) inquiry for this placement, whatever its age.
   Reject with `409 { error: "You already have an open inquiry for this placement" }` when it is less
   than 14 days old; the body also carries `existingInquiryCreatedAt`, so the form can name the date.
   When it is older, close it (`status -> CLOSED`) and carry on: the vendor had its window and the
   client must not stay locked out. The check is advisory either way — two concurrent submits can both
   pass it, so the partial unique index holds the real rule and a unique-violation on insert is caught
   and returned as the same `409`.
4. Insert with `clientId` from the session and `vendorId` from `placement.vendorId`.
5. Return the inquiry as the client sees it. The vendor's identity is not in the response: the client
   deals with Reclo, not with the vendor's account.

`GET /api/inquiries` (client history) is KAN-9 and is deliberately absent here. The vendor inbox and the
notification email are KAN-15 and KAN-17.

## Screens and layout

The form is a `Dialog`, opened from the existing **Inquire / Reserve** button in
`PlacementDetailModal`, which today shows a "coming soon" toast. The dialog replaces that toast and
stacks over the detail modal rather than navigating away, so the client keeps the placement in view.
Strings live in a `copy` object at the top of the component file, ready for KAN-19.

```
InquiryFormDialog (Dialog, sm:max-w-lg)
├─ DialogHeader
│   ├─ DialogTitle "Send an inquiry"
│   └─ DialogDescription "<placement title> · <address>"
├─ <form> (React Hook Form + zodResolver(createInquiryRequestSchema))
│   └─ FieldGroup
│       ├─ Field : FieldLabel "Your name"   + Input autoComplete=name              + FieldError
│       ├─ Field : FieldLabel "Phone"       + Input type=tel autoComplete=tel
│       │          + FieldDescription "Vendors usually reply on Telegram"          + FieldError
│       ├─ Field : FieldLabel "Email"       + Input type=email autoComplete=email  + FieldError
│       ├─ Row (grid sm:grid-cols-2 gap-3)
│       │   ├─ Field : FieldLabel "Preferred start" + Input type=date              + FieldError
│       │   └─ Field : FieldLabel "Duration"        + Select 1/3/6/12/24 months    + FieldError
│       └─ Field : FieldLabel "Message" + Textarea rows=4
│                  + FieldDescription "<n>/2000"                                   + FieldError
└─ DialogFooter: Button variant=outline "Cancel" · Button type=submit "Send inquiry"
```

`textarea` is the one shadcn/ui component this task adds:
`pnpm dlx shadcn@latest add textarea`, run from `apps/web`.

### States

- **Not signed in**: the dialog body is replaced by a short prompt — _"Sign in to send an inquiry"_ — and
  a "Sign in" button linking to `/sign-in?next=/placements/<id>`. No form fields render.
- **Idle**: name and email pre-filled from the session, phone and message empty, submit enabled.
- **Client validation**: on submit, then on change, via the shared schema. Messages render in
  `FieldError`; `Input` gets `aria-invalid`.
- **Loading**: submit disabled and reads "Sending…"; all inputs disabled.
- **Server field errors** (`400`): mapped onto the matching field with `setError`.
- **Success** (`201`): dialog closes, `sonner` toast _"Inquiry sent. The vendor will contact you
  shortly."_, and the detail modal stays open.
- **Duplicate** (`409`): dialog stays open with an inline message _"You already have an open inquiry for
  this placement"_ and the submit button disabled, so a client cannot keep retrying a request that
  cannot succeed. The message names the date the earlier inquiry was sent, so the 14-day expiry is
  visible rather than mysterious.
- **Other errors** (`401`, `403`, `429`, `5xx`, network): `sonner` toast with the server message. A `401`
  mid-session swaps the body to the signed-out prompt rather than discarding what was typed.

### Accessibility

The dialog takes focus on open and returns it to the **Inquire / Reserve** button on close. Submitting an
invalid form moves focus to the first field in error. The character counter is `aria-live="polite"` and
announces only on approach to the limit, not on every keystroke.

## Testing notes (KAN-37)

- Schema unit tests: phone normalisation of all three accepted forms plus separators, rejection of a
  non-Uzbek number and of too few or too many digits, message trimming and both length bounds,
  `durationMonths` coercion and range, `desiredStartDate` rejecting a non-date string, unknown keys
  stripped.
- Route tests via Supertest against `createApp` with a stub store: the happy path, each error row in the
  table above, a check that `clientId`/`vendorId` in the body are ignored, a store that raises a
  unique-violation still returning `409`, and an open inquiry older than 14 days being allowed through.
- Component tests: the signed-out prompt, validation messages, a successful submit calling the API once
  with normalised values, the `409` inline state, and focus return on close.

## Out of scope

- Vendor notification email on each new inquiry (KAN-17).
- Client inquiry history page and its `GET /api/inquiries` route (KAN-9).
- Vendor inbox, status transitions, and the admin dispute view (KAN-15).
- Multi-placement media-plan cart and checkout (KAN-7, KAN-18).
- Term × duration pricing matrix and VAT (KAN-11): this form asks for a duration but quotes nothing.
- Uzbek and Russian translations (KAN-19 / KAN-76..79).
