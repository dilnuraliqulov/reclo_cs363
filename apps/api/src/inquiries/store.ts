import type { Inquiry } from '@reclo/shared'

/** The placement fields the inquiry routes need to accept a submission. */
export interface InquiryPlacement {
  id: string
  vendorId: string
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
}
