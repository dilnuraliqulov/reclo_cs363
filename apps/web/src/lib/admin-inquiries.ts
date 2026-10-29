import {
  adminInquiryDetailResponseSchema,
  adminInquiryListResponseSchema,
  type AdminInquiryDetail,
  type AdminInquiryListResponse,
  type AdminInquiryQueryInput,
} from '@reclo/shared'
import { request } from './api'

/** Admin only: one page of every client's inquiries, newest first (KAN-15). */
export async function fetchAdminInquiries(
  params: AdminInquiryQueryInput = {},
): Promise<AdminInquiryListResponse> {
  const searchParams = new URLSearchParams()
  if (params.clientQuery) searchParams.set('clientQuery', params.clientQuery)
  if (params.status) searchParams.set('status', params.status)
  if (params.from) searchParams.set('from', params.from)
  if (params.to) searchParams.set('to', params.to)
  if (params.page !== undefined) searchParams.set('page', String(params.page))

  const query = searchParams.toString()
  const response = await request(`/api/admin/inquiries${query ? `?${query}` : ''}`, {
    method: 'GET',
  })
  return adminInquiryListResponseSchema.parse(await response.json())
}

/** Admin only: one inquiry with its full contact record and message history. */
export async function fetchAdminInquiry(id: string): Promise<AdminInquiryDetail> {
  const response = await request(`/api/admin/inquiries/${encodeURIComponent(id)}`, {
    method: 'GET',
  })
  return adminInquiryDetailResponseSchema.parse(await response.json()).inquiry
}

export const adminInquiriesKey = (params: AdminInquiryQueryInput) =>
  ['admin', 'inquiries', params] as const
export const adminInquiryKey = (id: string) => ['admin', 'inquiry', id] as const
