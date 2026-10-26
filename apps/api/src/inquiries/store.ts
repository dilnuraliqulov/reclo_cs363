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
  /** The client's newest open (NEW or READ) inquiry for this placement created at or after `since`. */
  findOpenInquiry: (input: {
    clientId: string
    placementId: string
    since: Date
  }) => Promise<OpenInquiry | null>
  /** Throws `OpenInquiryExistsError` when an open inquiry already exists. */
  createInquiry: (input: CreateInquiryInput) => Promise<Inquiry>
}
