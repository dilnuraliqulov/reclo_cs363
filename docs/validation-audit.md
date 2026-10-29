# Server-side validation audit (KAN-20 / KAN-80)

Every route that changes state was checked for: a Zod schema from `@reclo/shared`, path and query
validation, size limits, content-type handling, malformed input, rate limiting and error shape.
`apps/api/src/write-routes.test.ts` keeps the table below honest: it compares its own route list with
the routes registered on the Express app, so a new `POST`/`PUT`/`PATCH`/`DELETE` fails the suite until
it is added there.

## What every write route gets

| Concern             | Rule                                                                                                                                                                                                                                    |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Body size           | `express.json({ limit: '16kb' })` (`JSON_BODY_LIMIT` in `apps/api/src/http.ts`). The largest legitimate body is a 2000-character message, about 4 KB. Over it: `413 PAYLOAD_TOO_LARGE`.                                                 |
| Content type        | A `POST`/`PUT`/`PATCH`/`DELETE` that carries a body must be `application/json`; `multipart/form-data` is accepted only on the photo upload. Anything else: `415 UNSUPPORTED_MEDIA_TYPE`. Routes that read no body ignore an absent one. |
| Malformed JSON      | `400 MALFORMED_JSON`. Strict JSON parsing, so a bare `"text"`, `42` or `null` is also a 400.                                                                                                                                            |
| Unknown keys        | **Stripped**, never rejected (the schemas are plain `z.object`). `role`, `status`, `vendorId`, `clientId` and the like in a body reach no store: ownership and role come from the session, status from the state machine.               |
| NUL characters      | A `U+0000` anywhere in a body is `400 INVALID_INPUT` (`_form: validation.invalid`). Postgres text cannot store it and would otherwise answer 500.                                                                                       |
| Error shape         | `{ error, code, fieldErrors? }`. `code` is a member of `errorCodeSchema`; `fieldErrors` values are `validation.*` codes only, never sentences. Non-field errors travel under `_form`.                                                   |
| Unknown route       | `404 NOT_FOUND` in the same shape (it used to be Express's HTML page).                                                                                                                                                                  |
| Unexpected failures | `500 INTERNAL`, a fixed body; the cause is logged, never sent.                                                                                                                                                                          |
| Path params         | `:id` is checked as a UUID by `router.param` (`400 INVALID_PLACEMENT_ID`); `:file` must match `PHOTO_FILE_PATTERN` (`404 PHOTO_NOT_FOUND`).                                                                                             |
| Query               | No write route reads the query string. (The `GET` routes validate theirs: `INVALID_QUERY`.)                                                                                                                                             |
| Text content        | See "HTML and script in text fields" below.                                                                                                                                                                                             |

## Write endpoints

Rate limits are per IP per 15 minutes, answering `429 RATE_LIMITED`. Defaults are the `createApp`
arguments; the production values are the same.

| Endpoint                                         | Auth   | Body schema (`@reclo/shared`)   | Limits worth knowing                                                                                                                         | Error codes                                                                                                                                           | Rate limit               |
| ------------------------------------------------ | ------ | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| `POST /api/auth/register`                        | none   | `registerRequestSchema`         | email trimmed, lowercased, valid; password 8 to 128 characters                                                                               | `INVALID_INPUT` (`validation.email.invalid`, `validation.password.tooShort`/`tooLong`), `EMAIL_TAKEN` 409                                             | 20, shared with login    |
| `POST /api/auth/login`                           | none   | `loginRequestSchema`            | same email rule; password 1 to 128 characters                                                                                                | `INVALID_INPUT`, `INVALID_CREDENTIALS` 401                                                                                                            | 20, shared with register |
| `POST /api/auth/logout`                          | none   | none                            | idempotent                                                                                                                                   |                                                                                                                                                       | 20, its own counter      |
| `POST /api/inquiries`                            | CLIENT | `createInquiryRequestSchema`    | message 10 to 2000; name 2 to 120; Uzbek phone; email; duration 1 to 24 months; date `YYYY-MM-DD`                                            | `INVALID_INPUT`, `PLACEMENT_NOT_FOUND` 404, `DUPLICATE_INQUIRY` 409                                                                                   | 20                       |
| `POST /api/vendor/placements`                    | VENDOR | `createPlacementRequestSchema`  | title 5 to 120; description at most 2000; address 3 to 200; city 2 to 80; price 100 000 to 10^9; Uzbekistan bounding box; size at most 100 m | `INVALID_INPUT` (LED values on a non-LED type: `validation.led.typeOnly`)                                                                             | 120, all vendor writes   |
| `PATCH /api/vendor/placements/:id`               | VENDOR | `updatePlacementRequestSchema`  | same field limits; at least one field (`validation.update.empty` under `_form`)                                                              | `INVALID_INPUT`, `INVALID_PLACEMENT_ID`, `PLACEMENT_NOT_FOUND`, `LISTING_STATE_INVALID` 409                                                           | same                     |
| `POST /api/vendor/placements/:id/archive`        | VENDOR | none                            | state checked in the store                                                                                                                   | `INVALID_PLACEMENT_ID`, `PLACEMENT_NOT_FOUND`, `LISTING_STATE_INVALID`                                                                                | same                     |
| `POST /api/vendor/placements/:id/restore`        | VENDOR | none                            | "                                                                                                                                            | "                                                                                                                                                     | same                     |
| `POST /api/vendor/placements/:id/pause`          | VENDOR | none                            | "                                                                                                                                            | "                                                                                                                                                     | same                     |
| `POST /api/vendor/placements/:id/resume`         | VENDOR | none                            | "                                                                                                                                            | "                                                                                                                                                     | same                     |
| `POST /api/vendor/placements/:id/photos`         | VENDOR | multipart, field `photo`        | 1 file of at most 5 MB, at most 4 other text fields (ignored), 6 parts; type sniffed from the bytes, 8 photos per listing                    | `PHOTO_REQUIRED` 400, `PHOTO_TOO_LARGE` 413, `PHOTO_TYPE_INVALID` 415, `PHOTO_LIMIT` 409, `INVALID_INPUT` (broken multipart), `LISTING_STATE_INVALID` | same                     |
| `DELETE /api/vendor/placements/:id/photos/:file` | VENDOR | none                            | `:file` is `<uuid>.<jpg\|png\|webp>`                                                                                                         | `PHOTO_NOT_FOUND` 404, `PLACEMENT_NOT_FOUND`                                                                                                          | same                     |
| `POST /api/admin/placements/:id/approve`         | ADMIN  | `approvePlacementRequestSchema` | `expectedUpdatedAt` an ISO datetime                                                                                                          | `INVALID_INPUT`, `PLACEMENT_NOT_FOUND`, `PLACEMENT_NOT_PENDING`/`PLACEMENT_CHANGED`/`PLACEMENT_NO_PHOTOS` 409                                         | 120, shared with reject  |
| `POST /api/admin/placements/:id/reject`          | ADMIN  | `rejectPlacementRequestSchema`  | as above, plus `reason` trimmed, 10 to 500                                                                                                   | `INVALID_INPUT` (`validation.reason.tooShort`/`tooLong`), the same 404/409 codes                                                                      | same                     |

Authentication and role checks run per router (`requireAuth`, `requireRole`) and answer `401
NOT_AUTHENTICATED` / `403 FORBIDDEN`. Because the body parser runs first, a malformed or oversized
body is answered before authentication; that is deliberate, since the parser has no way to know the
caller.

Email and password rules are shared: `emailSchema` is one schema used by register, login and the
inquiry contact email (the inquiry form's address is also trimmed and lowercased). Register and login
both cap the password at 128 characters, because argon2 hashing time grows with input length and the
cap is what keeps `POST` bodies from becoming a CPU lever. Login does not enforce the minimum, so a
user whose password predates a stricter rule can still sign in.

## HTML and script in text fields

Every free-text field (`title`, `description`, `address`, `city`, `message`, `contactName`, `reason`)
is **stored exactly as typed, as plain text, and never interpreted**. The API does not strip, escape
or rewrite markup, and does not need to: it only ever answers with `application/json`, and the web
renders these values as React text nodes (no `dangerouslySetInnerHTML` anywhere), which escape them.
`<script>alert(1)</script>` in a title is a title that contains those characters. Uploaded files are
never served as HTML: photos are sniffed to JPEG, PNG or WebP, named by the server, and served with
`X-Content-Type-Options: nosniff`. Any future consumer that is not React text (an e-mail template, a
CSV export, a map popup built from strings) must escape for its own context.

## Gaps found and fixed (KAN-80)

1. **Oversized body answered 500.** `entity.too.large` fell through the error handler. Now `413
PAYLOAD_TOO_LARGE`, with an explicit 16 KB limit instead of the implicit 100 KB.
2. **Non-JSON body answered a confusing 400** (the parser skipped it and the schema saw
   `undefined`). Now `415 UNSUPPORTED_MEDIA_TYPE`, and any other client error from the parser maps to
   a 4xx in the standard shape.
3. **Zod's English sentences in `fieldErrors`.** A missing key or wrong type produced "Invalid input:
   expected string, received undefined", which the web then showed verbatim in every language. The
   shared package now sets a default Zod error (`z.config`) that yields `validation.required` or
   `validation.invalid`, and a few `.max()` calls that had no code (login password, contact name) got
   one.
4. **Body that is not an object lost its error.** Register, login and inquiries dropped the
   root-level error, returning `fieldErrors: {}`. All routes now share `sendValidationError`, which
   reports it under `_form`. The three routers had three copies of the helper; they are one now.
5. **`U+0000` in a string reached Postgres** and would have been a 500. Rejected as a 400 for every
   route by `rejectNulBytes`.
6. **`POST /api/auth/logout` had no rate limit.** It has its own limiter, separate from the
   register/login budget so signing out never uses up sign-in attempts.
7. **Unknown routes answered an HTML page.** Now `404 NOT_FOUND` JSON.
8. **Multipart parser had no field or part limits**, only the file size. Added `fields: 4`, `parts: 6`.
9. New error codes `PAYLOAD_TOO_LARGE`, `UNSUPPORTED_MEDIA_TYPE`, `NOT_FOUND` and validation code
   `validation.invalid`, with en/uz/ru strings.

**Documented behaviour changed:** none. `MALFORMED_JSON` and the photo codes behave as in
`docs/listing-design.md` and `docs/i18n-design.md`; the 415 for non-JSON bodies and the 404 shape are
new codes, not changed ones.

## Known gaps, not fixed

- **No `helmet`-style headers** (CSP, `X-Content-Type-Options` outside `/uploads`, HSTS). Out of scope
  for validation; worth a ticket before production.
- **Rate limits are in-memory and per process**, so they reset on restart and do not add up across
  several instances. A shared store (Redis) is needed once there is more than one API process.
- **Rate limiting is per IP only.** Behind a proxy `trust proxy` must be set correctly or everyone
  shares one bucket; this is not configured yet.
- **Rate limit runs after the body parser** on the auth routes, so a flood of bodies up to 16 KB is
  still read before being counted. Bounded by the size limit; moving the limiter earlier would also
  count requests that never reach a route.
- **No per-account lockout** on login; only the per-IP limit and the constant-time failure path.
- **Photo bytes are not decoded or re-encoded.** The type is sniffed from magic bytes, so a file with
  a valid header and a hostile body is stored as is. It is only ever served as an image with
  `nosniff`.
- **Text is not normalised** (Unicode form, control characters other than NUL, bidirectional
  overrides). Plain text is stored as typed.
- **`desiredStartDate` may be in the past**; the inquiry design does not say it must not be.

## Forms in the web app (KAN-81)

Five forms take input: sign-in, sign-up, the inquiry dialog, the listing editor and the reject
dialog. All five parse with a shared schema through `zodResolver`, show the localized message under
the field (`FieldError` with an id, referenced by the input's `aria-describedby`, plus `aria-invalid`),
and disable submit while the request runs.

`useFormFailure` (`apps/web/src/hooks/useFormFailure.ts`) is the one place a failed request is placed:
the server's `fieldErrors` codes go to their fields (the first takes focus); anything else (`_form`, an
unknown field, 401 credentials, 429, 5xx, no connection) becomes a persistent `FormError` alert above
the buttons, replacing the toasts the sign-in, sign-up, inquiry and listing forms used before. A
rejected-listing failure shows inside the dialog, which stays open for a retry.

The text always comes from the catalogs: a code maps to its `error.*` key; a response without a code
maps by status (no response: `error.NETWORK`, 429: `error.RATE_LIMITED`, 5xx: `error.INTERNAL`). One
deliberate exception, from KAN-79: a well-formed error body whose `code` this build does not know
(a newer server) shows its `error` sentence, since it is the only description available. A field
message that is not a known `validation.*` code reads as `validation.invalid`.
