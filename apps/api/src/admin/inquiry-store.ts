import type { AdminInquiryDetail, AdminInquirySummary, InquiryStatus } from '@reclo/shared'

export interface ListAdminInquiriesInput {
  /** Case-insensitive substring of the client's email or the inquiry's contact name/email. */
  clientQuery?: string
  status?: InquiryStatus
  /** Inclusive lower bound on `createdAt` (UTC midnight of the `from` date). */
  createdFrom?: Date
  /** Exclusive upper bound on `createdAt` (UTC midnight of the day after the `to` date). */
  createdBefore?: Date
  skip: number
  take: number
}

export interface AdminInquiryPage {
  inquiries: AdminInquirySummary[]
  total: number
}

/** Persistence for the admin inquiry history (KAN-15). Read-only. */
export interface AdminInquiryStore {
  /** Newest first, by `(createdAt, id)` descending, with the total across all pages. */
  listInquiries: (input: ListAdminInquiriesInput) => Promise<AdminInquiryPage>
  /** Resolves null when no inquiry has this id. */
  findInquiry: (id: string) => Promise<AdminInquiryDetail | null>
}
