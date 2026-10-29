import type { Inquiry } from '@reclo/shared'
import type { Mailer } from '../email/mailer'
import { renderNewInquiryEmail } from '../email/new-inquiry'
import type { InquiryPlacement } from './store'

export interface NotifyVendorInput {
  mailer: Mailer
  inquiry: Inquiry
  placement: InquiryPlacement
  webPublicUrl: string
  logError?: (message: string, context: object, error: unknown) => void
}

/**
 * Emails the vendor about a new inquiry. Never rejects: the inquiry is already saved and the client
 * already has its 201, so a failure is logged and goes no further.
 */
export async function notifyVendorOfInquiry({
  mailer,
  inquiry,
  placement,
  webPublicUrl,
  logError = console.error,
}: NotifyVendorInput): Promise<void> {
  try {
    const email = renderNewInquiryEmail({
      inquiry,
      placement,
      vendorCompanyName: placement.vendor.companyName,
      webPublicUrl,
    })
    await mailer.send({
      to: placement.vendor.email,
      // The vendor answers by pressing Reply; Reclo's own address never receives it.
      replyTo: inquiry.contactEmail,
      ...email,
    })
  } catch (error) {
    // Ids only: the message and contact details are personal data and stay out of the logs.
    logError(
      'Failed to send new-inquiry email',
      { inquiryId: inquiry.id, vendorId: placement.vendorId },
      error,
    )
  }
}
