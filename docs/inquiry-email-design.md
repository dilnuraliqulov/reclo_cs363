# New-inquiry vendor email: design (KAN-17 / KAN-70)

A client can send an inquiry (KAN-8), but nothing tells the vendor it arrived: there is no vendor
inbox yet (KAN-15), so today an inquiry sits in the database where only an admin with Prisma Studio
can see it. This task sends the vendor an email for every new inquiry. Until the inbox exists, that
email is the vendor's **only** view of the inquiry, which drives most of the decisions below.

## Decisions

- **One email per inquiry the API accepts.** It goes out only after `store.createInquiry` resolves,
  i.e. on the `201` path. A `400`, `404` or `409` sends nothing. Closing a stale inquiry past the
  14-day window sends nothing either; the replacement inquiry gets its own email.
- **The email never blocks or fails the client's request.** The route sends the `201` first and then
  hands the email to the mailer without awaiting it. A slow or unreachable SMTP server must not turn a
  saved inquiry into a client-facing error: the client would retry and hit the duplicate `409`.
- **Best effort, one attempt, logged.** A failed send is logged with the inquiry id and the vendor id,
  never with the message or contact details (personal data does not belong in logs). There is no
  retry queue: the inquiry is already saved, and the vendor inbox (KAN-15) will show it regardless.
  A durable outbox is listed under open questions.
- **The recipient is the vendor's account email** (`User.email` of `placement.vendorId`), loaded in
  the query the route already makes. `findActivePlacement` returns the vendor's email and company name
  and the placement's title, address, city and type, so the email costs no extra database round trip.
- **Reply-To is the client's contact email.** The vendor answers by pressing Reply, and the address
  Reclo sends from (`MAIL_FROM`) never receives a reply meant for the client. `contactEmail` has
  already passed the shared email schema, so it is safe to put in a header.
- **Everything the vendor needs to quote is in the body.** That means the placement, the client's
  name, phone, email, desired start date, duration and message, plus the inquiry id for support.
  The body links to the listing (`/vendor/placements/<id>/edit`). It does not link to an inbox that
  does not exist yet. Phone numbers get a `tel:` link and a Telegram link (`https://t.me/+998…`),
  since vendors in this market usually reply on Telegram (see `inquiry-design.md`).
- **Uzbek and Russian in one email, Uzbek first.** The i18n design (KAN-76) notes that a vendor email
  should follow the recipient's locale, which needs a `User.locale` column. Vendors have no screen to
  set it, and the vendor UI is not localized, so the column would be `uz` for everyone and silently
  wrong for every Russian-speaking vendor. A bilingual email is the common practice for Uzbek business
  mail and reaches every vendor today. English is not included: the vendor is in Uzbekistan, and a
  third copy of every line makes the email harder to read. When `User.locale` exists, the renderer
  already takes a locale per block, so switching to one language is a one-line change in the caller.
- **Plain text and HTML, built from a pure function.** `renderNewInquiryEmail(data)` returns
  `{ subject, text, html }` and does no I/O, so the template is unit-tested without a mailer. The HTML
  is a single table-based layout with inline styles and no images or external CSS, because email
  clients strip both.
- **Client-supplied text is escaped, never trusted.** `message`, `contactName` and the vendor-authored
  title and address are HTML-escaped before interpolation. The message keeps its line breaks, which
  are turned into `<br>` after escaping, never before. CR and LF are stripped from the subject, so a
  title cannot inject a header (nodemailer also encodes headers; this is belt and braces). The only
  links in the body are built from validated values: the E.164 phone, the schema-checked email and
  the placement UUID.
- **Dates are shown in Tashkent time, as `DD.MM.YYYY`.** That format reads the same in Uzbek and
  Russian. `desiredStartDate` is a date with no time, so it is formatted from its `YYYY-MM-DD` parts.
  The received-at time is converted to `Asia/Tashkent`, which is UTC+5 with no daylight saving.
  Durations use the same plural rule the web catalog uses: `3 oy` in Uzbek, and `1 месяц`,
  `3 месяца`, `5 месяцев` in Russian.
- **The mailer is injected, like the stores.** `createApp` takes an optional `mailer: Mailer`. The
  route tests pass a recording fake and need neither SMTP nor a network. Without a mailer the route
  simply sends no email, the same way an absent store leaves its routes unmounted.
- **SMTP via nodemailer in real runs, the console when unconfigured.** `SMTP_URL` selects
  `SmtpMailer`. When it is unset, `ConsoleMailer` prints the email to stdout and the API warns once at
  startup, so a fresh clone works with no mail setup. For local testing, `docker-compose.yml` gains
  [Mailpit](https://mailpit.axllent.org/), which catches everything sent to `smtp://localhost:1026`
  and shows it at `http://localhost:8026` (one above Mailpit's default ports, so it does not clash
  with another project's Mailpit, the same reasoning as Postgres on 5435). nodemailer has no install script, so `allowBuilds` does
  not change.
- **Spam is bounded by rules that already exist.** A vendor gets at most one email per open inquiry
  per client per placement (the 14-day duplicate rule), and the inquiry rate limiter caps any one IP
  at 20 submissions per 15 minutes. No email-specific limit is added.

## Where the data comes from

```ts
// apps/api/src/inquiries/store.ts
export interface InquiryPlacement {
  id: string
  vendorId: string
  // New for KAN-17: what the notification email shows.
  title: string
  address: string
  city: string
  type: PlacementType
  vendor: { email: string; companyName: string | null }
}
```

The Prisma store selects these in the existing `findActivePlacement` query:

```ts
select: {
  id: true, vendorId: true, title: true, address: true, city: true, type: true,
  vendor: { select: { email: true, companyName: true } },
}
```

None of it reaches the client: the route still returns only the `Inquiry` (the vendor's identity is
not in the response, per `inquiry-design.md`).

## Mailer interface (`apps/api/src/email/mailer.ts`)

```ts
export interface MailMessage {
  to: string
  replyTo?: string
  subject: string
  text: string
  html: string
}

/** Sends one email. Rejects when delivery to the transport fails. */
export interface Mailer {
  send: (message: MailMessage) => Promise<void>
}
```

- `SmtpMailer(url, from)` wraps a nodemailer transport created from `SMTP_URL`, with 10-second
  connection, greeting and socket timeouts, so a hung server cannot hold sockets open indefinitely.
- `ConsoleMailer` logs the recipient, subject and text part.

## Environment (`apps/api/.env.example`)

| Variable         | Default                     | Meaning                                                      |
| ---------------- | --------------------------- | ------------------------------------------------------------ |
| `SMTP_URL`       | unset (console mailer)      | e.g. `smtp://localhost:1026` (Mailpit), `smtps://user:pass@` |
| `MAIL_FROM`      | `Reclo <no-reply@reclo.uz>` | The From header                                              |
| `WEB_PUBLIC_URL` | `CORS_ORIGIN`               | Origin of the web app, for links in the email                |

## The email

Subject (CR/LF stripped, title cut to 80 characters with `…`):

```
Yangi so'rov / Новый запрос: <placement title>
```

Body, plain-text part (the HTML part has the same content, with each language block under a
heading and the contact details in a two-column table):

```
Yangi so'rov: <title>
<address>, <city> · Bilbord

Mijoz:            Aziza Karimova
Telefon:          +998 90 123 45 67 (Telegram: https://t.me/+998901234567)
Email:            aziza@example.com
Boshlanish sanasi: 01.12.2026
Muddat:           3 oy

Xabar:
<message, line breaks kept>

Javob berish uchun ushbu xatga javob yozing — u to'g'ridan-to'g'ri mijozga boradi.
E'lon: <WEB_PUBLIC_URL>/vendor/placements/<id>/edit

────────────────────────────────

Новый запрос: <title>
<address>, <city> · Билборд

Клиент:           Aziza Karimova
Телефон:          +998 90 123 45 67 (Telegram: https://t.me/+998901234567)
Email:            aziza@example.com
Дата начала:      01.12.2026
Срок:             3 месяца

Сообщение:
<message>

Чтобы ответить, просто ответьте на это письмо — оно уйдёт напрямую клиенту.
Объявление: <WEB_PUBLIC_URL>/vendor/placements/<id>/edit

────────────────────────────────
Reclo · so'rov / запрос <inquiry id> · 29.10.2026 14:05 (Toshkent)
```

Optional rows (start date, duration) are left out when the client did not give them, rather than
shown as "—". Each block opens with a greeting: `Assalomu alaykum, <companyName>!` /
`Здравствуйте, <companyName>!`, or without the name when the vendor has none. `Уважаемый` is
avoided because Russian would make it agree with a gender the account does not record.

Placement type labels: `BILLBOARD` is `Bilbord` / `Билборд`, `LED_SCREEN` is `LED ekran` /
`LED-экран`.

## Flow in `POST /api/inquiries`

1. Steps 1–4 of `inquiry-design.md` are unchanged.
2. `res.status(201).json({ inquiry })`.
3. `void notifyVendor(...)`: render the email, then call `mailer.send` with `to` set to the vendor
   email and `replyTo` set to `inquiry.contactEmail`. Rendering and sending sit in one
   `try/catch`; a failure is logged as
   `Failed to send new-inquiry email { inquiryId, vendorId }` together with the error.

## Testing notes (KAN-72)

- **Template, as a pure function:** both language blocks are present, Uzbek before Russian. The
  subject strips CR/LF and truncates. `<script>`, `&` and quotes in the message, name, title and
  address come out escaped in HTML and verbatim in text. Message line breaks become `<br>` in HTML.
  Optional rows are omitted when null. Russian duration plurals cover 1, 3, 5, 11, 21 and 22, and
  Uzbek is invariant. The date renders as `DD.MM.YYYY`, and the received time is UTC+5, including
  across midnight. The phone is formatted, and the `tel:` and `t.me` links use E.164. The company
  greeting appears only when a company name is set.
- **Route, with a recording fake mailer:** a `201` sends exactly one email to the vendor's address
  with `replyTo` set to the normalized client email. `400`, `401`, `403`, `404` and both `409` paths
  send none. A mailer that rejects, or never resolves, still yields the `201` with the same body, and
  the failure is logged without the message text. No mailer configured means no email and no error.
  Inquiry ids and vendor ids in the request body cannot redirect the email.
- **Prisma store:** `findActivePlacement` selects the vendor's email and company name and still
  filters on `status: 'ACTIVE'`.
- **Mailer selection:** `SMTP_URL` set gives `SmtpMailer`, unset gives `ConsoleMailer`.
  `SmtpMailer.send` passes `from`, `to`, `replyTo`, `subject`, `text` and `html` through to the
  transport, and rejects when the transport does.

## Out of scope

- The vendor inbox, read/responded status changes and in-app notifications (KAN-15).
- Per-user language for emails (`User.locale`) and a vendor settings screen to choose it.
- Retries and a durable outbox (`InquiryNotification` rows plus a worker), and bounce handling.
- Emails to the client (a "we sent your inquiry" receipt) and any email to admins.
- Unsubscribe or notification preferences: the email is transactional, and a vendor who stops
  receiving it stops learning about inquiries.

## Open questions

- **Outbox.** If the API process restarts between the `201` and the SMTP handoff, that one email is
  lost. Acceptable while the inbox (KAN-15) is the backstop. Before then, an `Inquiry.notifiedAt`
  column plus a sweep for rows with `notifiedAt IS NULL` would close the gap.
- **Production sender.** `MAIL_FROM` needs a domain with SPF/DKIM set up, or vendors' mail providers
  will file these as spam. That is a deployment task, not a code one.
