# Admin-created vendor accounts: design (KAN-13 / KAN-54)

Public sign-up already creates `CLIENT` accounts only (KAN-66), and nothing in the app can create a
`VENDOR`. This task adds the one sanctioned way to get one: an admin creates it. It also has to answer
a question nobody has needed to ask yet — where the first admin comes from.

## Decisions

- **A vendor is a `User` with `role = VENDOR`, not a separate table.** Sessions, `requireAuth`,
  `requireRole` and `Placement.vendorId` already key on `User`, and a vendor signs in through the same
  `/sign-in` page as a client. A `Vendor` table would split login in two for no gain.
- **The admin sets an initial password and hands it over out of band.** There is no email service yet
  (KAN-17 sends inquiry emails, not invitations) and no password reset (out of scope in KAN-66), so an
  invitation link has nowhere to go. The screen offers a "Generate" button so the admin is not
  tempted to type `password123`. Forcing a change on first sign-in needs a change-password flow that
  does not exist; it is listed under open questions rather than half-built here.
- **Vendors carry a company name.** `User.companyName String?`, required by the schema when an admin
  creates a vendor and `null` for clients. Inquiries and listings will need something better than an
  email address to show for "who is this vendor", and the admin creating the account is the one
  person who knows it.
- **Who created the account is recorded.** `User.createdById String?` points at the admin. "Only
  admins can create vendor accounts" is an access rule; the column is what lets anyone check later
  that it held. It is `null` for self-registered clients and for the bootstrap admin.
- **Role is fixed by the route, never by the body.** `POST /api/admin/vendors` always writes `VENDOR`,
  just as `/api/auth/register` always writes `CLIENT`. The request schema has no `role` key, and
  unknown keys are stripped, so `{ "role": "ADMIN" }` in the body does nothing.
- **An existing email is a conflict, not a promotion.** If a client already registered with the
  vendor's email, the route returns `409 EMAIL_TAKEN`. Silently turning a client into a vendor would
  hand their inquiry history to a different kind of account; changing a role is a separate,
  deliberate action and is out of scope.
- **The first admin comes from a CLI script, not the API.** `pnpm --filter @reclo/api admin:create`
  reads an email and password from environment variables and creates (or refuses to overwrite) an
  `ADMIN`. Any HTTP route that can create an admin is a route that has to be locked down forever; a
  script that needs database credentials is already locked down.
- **Admin screens are English only.** The i18n design (KAN-76) scopes translation to the client-facing
  UI. Strings still go in a `copy` object at the top of the page so they can move into the catalogs
  later, as the client pages did.

## Data model (Prisma)

```prisma
model User {
  // ...existing fields
  companyName    String?  // set for VENDOR accounts, null otherwise
  createdById    String?  // the ADMIN who created this account; null for self-registered users
  createdBy      User?    @relation("CreatedUsers", fields: [createdById], references: [id], onDelete: SetNull)
  createdUsers   User[]   @relation("CreatedUsers")

  @@index([role, createdAt])
}
```

`onDelete: SetNull`: deleting an admin must not delete the vendors they created. The
`[role, createdAt]` index serves the vendor list below. One migration, `add_vendor_account_fields`;
both new columns are nullable, so existing rows need no backfill.

## Shared Zod schemas (`packages/shared/src/vendor.ts`)

```ts
export const COMPANY_NAME_MAX_LENGTH = 120

export const createVendorRequestSchema = z.object({
  email: emailSchema,
  companyName: z
    .string()
    .trim()
    .min(1, VALIDATION_CODES.companyNameRequired)
    .max(COMPANY_NAME_MAX_LENGTH, VALIDATION_CODES.companyNameTooLong),
  password: z
    .string()
    .min(PASSWORD_MIN_LENGTH, VALIDATION_CODES.passwordTooShort)
    .max(PASSWORD_MAX_LENGTH, VALIDATION_CODES.passwordTooLong),
})

export const vendorSummarySchema = z.object({
  id: z.string(),
  email: z.string(),
  companyName: z.string(),
  createdAt: z.iso.datetime(),
})

export const createVendorResponseSchema = z.object({ vendor: vendorSummarySchema })
export const vendorListResponseSchema = z.object({ vendors: z.array(vendorSummarySchema) })
```

`emailSchema` and the password limits are reused from `auth.ts` so a vendor's password follows the
same policy as a client's. Two new validation codes join `VALIDATION_CODES`:
`validation.companyName.required` and `validation.companyName.tooLong`. No new `ErrorCode` is
needed: every failure below maps to an existing one.

## API contract

A new router mounted at `/api/admin`, with `requireAuth` and `requireRole('ADMIN')` applied to the
whole router so a future admin route cannot forget them.

| Route                     | Body                               | Success           | Errors                                                                                                  |
| ------------------------- | ---------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------- |
| `POST /api/admin/vendors` | `{ email, companyName, password }` | `201 { vendor }`  | `400 INVALID_INPUT` with `fieldErrors`; `401`; `403 FORBIDDEN`; `409 EMAIL_TAKEN` + `fieldErrors.email` |
| `GET /api/admin/vendors`  | none                               | `200 { vendors }` | `401`; `403`                                                                                            |

Server-side rules:

1. Parse the body with `createVendorRequestSchema`; on failure respond as the auth routes do.
2. Hash the password with argon2id, as registration does.
3. Insert with `role: 'VENDOR'`, `companyName`, and `createdById: req.user.id`. A unique-violation on
   `email` (`P2002`) becomes `EmailTakenError` and a `409`.
4. Do **not** start a session. The admin stays signed in as themselves; the vendor signs in later
   with the password they were given.
5. The response never includes the password or its hash.

`GET` returns vendors newest first, capped at 200. There is no pagination: the number of vendors on
an OOH marketplace in one country is in the tens, and the cap is a guard, not a page size.
Pagination can be added the same way inquiry history did it if that stops being true.

`AuthStore` gains `createVendor` and `listVendors`, implemented in `prisma-store.ts`, so route tests
keep passing stubs and need no database.

## Bootstrap admin script

`apps/api/scripts/create-admin.ts`, run as `pnpm --filter @reclo/api admin:create` with
`ADMIN_EMAIL` and `ADMIN_PASSWORD` set. It validates both with the shared schemas, hashes the
password, and creates an `ADMIN`. If the email already exists it exits non-zero without changing the
row — re-running the script must not reset a live admin's password or promote a client. The README
gets one line on how to use it.

## Screen (`/admin/vendors`)

Reachable only by admins: a `RequireRole role="ADMIN"` layout route wraps it, built like
`RequireAuth`. A signed-out visitor goes to `/sign-in?next=/admin/vendors`; a signed-in non-admin is
sent to `/`. `AuthControls` shows a "Vendors" link only when `user.role === 'ADMIN'`. The server
check is the real guard; the client-side one only avoids showing a page that would fail.

```
┌──────────────────────────────────────────────────────────────────┐
│ Vendors                                              AuthControls │
│ Create accounts for billboard and LED screen owners.             │
├──────────────────────────────────────────────────────────────────┤
│ Card: New vendor account                                         │
│   Company name  [______________________]                          │
│   Email         [______________________]                          │
│   Password      [______________]  [Generate]                      │
│                 At least 8 characters. Share it with the vendor.  │
│                                         [Create vendor account]   │
├──────────────────────────────────────────────────────────────────┤
│ Card: Vendor accounts (3)                                        │
│   Company           Email                   Created              │
│   Reklama Plus      sales@reklama.uz        28 Oct 2026          │
│   ...                                                            │
└──────────────────────────────────────────────────────────────────┘
```

- Built from `card`, `field`, `input`, `button` and `sonner`, all already vendored, plus `table`,
  added with the shadcn CLI. React Hook Form with `zodResolver(createVendorRequestSchema)`, using
  `Controller` and the `Field` components as the existing forms do.
- **Generate** fills the password field with 16 characters from `crypto.getRandomValues` and switches
  the input to `type="text"` so the admin can copy it. Typing a password keeps it masked.

### States

- **Loading the list**: `Skeleton` rows. **Empty list**: "No vendor accounts yet."
- **Submitting**: inputs and button disabled, button reads "Creating…".
- **Field errors** (client or `400`): under the field via `FieldError`, mapped from `fieldErrors`.
- **`409`**: "An account with this email already exists" under the email field.
- **`401` / `403`**: the session changed underneath the page; refetch `me`, and the route guard
  redirects.
- **Success**: a toast "Vendor account created for {email}", the form resets, the list query is
  invalidated so the new row appears at the top. The password is cleared from the form; the admin
  copies it before submitting.

## Testing notes (KAN-57)

- `POST` as an admin creates a `VENDOR` with `createdById` set and returns no password field.
- `POST` and `GET` as a client and as a vendor return `403`; signed out return `401`.
- A `role` key in the body is ignored. A duplicate email returns `409` with `fieldErrors.email`.
- Invalid email, empty company name and short password return `400` with the matching codes.
- The new vendor can sign in through `/api/auth/login`; the admin's own session is unchanged.
- Web: the page redirects non-admins; validation messages render; Generate fills a 16-character
  password; a `409` marks the email field; success resets the form and shows the new row.
- The bootstrap script refuses an existing email and does not modify it.

## Out of scope

Editing, suspending or deleting vendors; changing a user's role; invitation emails; password reset
and forced password change; vendor profile pages; translating the admin UI.

## Open questions

- **Should a vendor be forced to change the admin-chosen password on first sign-in?** It is the right
  default, but it needs a change-password route and screen that nothing else needs yet. Worth a
  follow-up task once password reset is planned.
- **Is company name enough vendor profile?** A phone number and a legal entity (INN) are likely
  wanted for invoicing; both are additive columns when that requirement arrives.
