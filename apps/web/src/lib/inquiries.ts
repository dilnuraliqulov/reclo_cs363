import type { InquiryStatus } from '@reclo/shared'

/**
 * Formats a stored E.164 number for display: "+998901234567" -> "+998 90 123 45 67".
 * The stored value stays canonical; this is presentation only.
 */
export function formatUzPhone(phone: string): string {
  const match = /^\+998(\d{2})(\d{3})(\d{2})(\d{2})$/.exec(phone)
  if (!match) return phone
  const [, operator, first, second, third] = match
  return `+998 ${operator} ${first} ${second} ${third}`
}

/** "26 Oct 2026", for naming the date an earlier inquiry was sent. */
export function formatInquiryDate(isoDate: string): string {
  const date = new Date(isoDate)
  if (Number.isNaN(date.getTime())) return isoDate
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

/**
 * Status is the vendor's workflow, shown read-only to the client. The labels are written from the
 * client's side rather than exposing the enum, and they carry the meaning on their own: the badge
 * variant is decoration, so a row still reads correctly without colour.
 *
 * `RESPONDED` is the one that needs care — the reply arrives by phone or email, not in Reclo — so
 * "Replied" says the vendor replied and stops there, rather than implying a message is waiting on
 * the platform.
 */
const INQUIRY_STATUS: Record<
  InquiryStatus,
  { label: string; variant: 'default' | 'secondary' | 'outline' }
> = {
  NEW: { label: 'Sent', variant: 'secondary' },
  READ: { label: 'Seen', variant: 'outline' },
  RESPONDED: { label: 'Replied', variant: 'default' },
  CLOSED: { label: 'Closed', variant: 'outline' },
}

export function inquiryStatusLabel(status: InquiryStatus): string {
  return INQUIRY_STATUS[status].label
}

export function inquiryStatusVariant(status: InquiryStatus) {
  return INQUIRY_STATUS[status].variant
}
