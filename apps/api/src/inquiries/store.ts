import type { Inquiry, InquiryHistoryItem, InquiryStatus, PlacementType } from '@reclo/shared'
import type { InquiryCursor } from './cursor'

/** The placement fields the inquiry routes need to accept a submission and email the vendor. */
export interface InquiryPlacement {
  id: string
  vendorId: string
  title: string
  address: string
  city: string
  type: PlacementType
  /** Who the new-inquiry email goes to (KAN-17). Never sent to the client. */
  vendor: { email: string; companyName: string | null }
}

export interface OpenInquiry {
  id: string
  createdAt: Date
}

export interface CreateInquiryInput {
  placementId: string
  clientId: string
  vendorId: string
  message: string
  contactName: string
  contactPhone: string
  contactEmail: string
  desiredStartDate: Date | null
  durationMonths: number | null
}

export interface ListClientInquiriesInput {
  clientId: string
  status?: InquiryStatus
  /** Rows strictly older than this, by `(createdAt, id)` descending. */
  cursor?: InquiryCursor
  limit: number
}

/** Thrown by `createInquiry` when the partial unique index rejects a second open inquiry. */
export class OpenInquiryExistsError extends Error {
  constructor() {
    super('You already have an open inquiry for this placement')
  }
}

/** Persistence needed by the inquiry routes. Injected into `createApp` so tests need no database. */
export interface InquiryStore {
  /** Resolves null unless the placement exists and is ACTIVE. */
  findActivePlacement: (id: string) => Promise<InquiryPlacement | null>
  /**
   * The client's newest open (NEW or READ) inquiry for this placement, whatever its age. The route
   * applies the 14-day window, because the partial unique index cannot: a Postgres index predicate
   * must be IMMUTABLE, so it cannot mention `now()`.
   */
  findOpenInquiry: (input: { clientId: string; placementId: string }) => Promise<OpenInquiry | null>
  /**
   * Closes an inquiry a vendor left open past the window, so the client is not locked out of the
   * placement for good. Returns false when the row was no longer open, which means a vendor or a
   * racing request got there first.
   */
  closeStaleInquiry: (id: string) => Promise<boolean>
  /** Throws `OpenInquiryExistsError` when an open inquiry already exists. */
  createInquiry: (input: CreateInquiryInput) => Promise<Inquiry>
  /**
   * One client's inquiries, newest first, for the history page. The cursor arrives already
   * decoded, so cursor encoding stays in the route and this stays a plain query.
   *
   * Returns up to `limit` rows; the route asks for one more than the page size and trims, which is
   * how it learns whether another page exists without a second count query.
   */
  listClientInquiries: (input: ListClientInquiriesInput) => Promise<InquiryHistoryItem[]>
}
