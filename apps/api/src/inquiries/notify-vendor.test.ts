import type { Inquiry } from '@reclo/shared'
import { describe, expect, it, vi } from 'vitest'
import type { Mailer } from '../email/mailer'
import { notifyVendorOfInquiry } from './notify-vendor'
import type { InquiryPlacement } from './store'

const placement: InquiryPlacement = {
  id: 'b1e0696a-54c3-4d40-84c4-f2a89326e680',
  vendorId: 'vendor-123',
  title: 'Amir Temur Billboard',
  address: 'Amir Temur shoh ko‘chasi 1',
  city: 'Tashkent',
  type: 'BILLBOARD',
  vendor: { email: 'vendor@example.com', companyName: null },
}

const inquiry: Inquiry = {
  id: '8f1e2bb6-6ad8-4a2e-9f6e-1c2f6f2a31aa',
  placementId: placement.id,
  status: 'NEW',
  message: 'Private campaign details the logs must never see.',
  contactName: 'Aziza Karimova',
  contactPhone: '+998901234567',
  contactEmail: 'aziza@example.com',
  desiredStartDate: null,
  durationMonths: null,
  createdAt: '2026-10-26T10:00:00.000Z',
}

describe('notifyVendorOfInquiry', () => {
  it('sends to the vendor account, never to an address in the inquiry', async () => {
    const mailer: Mailer = { send: vi.fn().mockResolvedValue(undefined) }

    await notifyVendorOfInquiry({
      mailer,
      inquiry,
      placement,
      webPublicUrl: 'https://reclo.example',
    })

    expect(mailer.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'vendor@example.com', replyTo: 'aziza@example.com' }),
    )
  })

  it('resolves, logging ids and the error, when the mailer rejects', async () => {
    const failure = new Error('SMTP down')
    const logError = vi.fn()
    const mailer: Mailer = { send: vi.fn().mockRejectedValue(failure) }

    await expect(
      notifyVendorOfInquiry({ mailer, inquiry, placement, webPublicUrl: '', logError }),
    ).resolves.toBeUndefined()

    expect(logError).toHaveBeenCalledWith(
      'Failed to send new-inquiry email',
      { inquiryId: inquiry.id, vendorId: 'vendor-123' },
      failure,
    )
  })

  it('resolves when the mailer throws synchronously', async () => {
    const logError = vi.fn()
    const mailer: Mailer = {
      send: () => {
        throw new Error('bad config')
      },
    }

    await expect(
      notifyVendorOfInquiry({ mailer, inquiry, placement, webPublicUrl: '', logError }),
    ).resolves.toBeUndefined()
    expect(logError).toHaveBeenCalledTimes(1)
  })

  it('keeps the message and contact details out of the log', async () => {
    const logError = vi.fn()
    const mailer: Mailer = { send: vi.fn().mockRejectedValue(new Error('SMTP down')) }

    await notifyVendorOfInquiry({ mailer, inquiry, placement, webPublicUrl: '', logError })

    const logged = JSON.stringify(logError.mock.calls[0]!.slice(0, 2))
    for (const secret of [
      inquiry.message,
      inquiry.contactName,
      inquiry.contactPhone,
      inquiry.contactEmail,
    ]) {
      expect(logged).not.toContain(secret)
    }
  })
})
