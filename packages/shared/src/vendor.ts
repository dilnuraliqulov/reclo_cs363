import { z } from 'zod'
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, emailSchema } from './auth'
import { VALIDATION_CODES } from './errors'

export const COMPANY_NAME_MAX_LENGTH = 120

/**
 * An admin creating a vendor account (KAN-13). There is deliberately no `role` here: the route
 * always writes VENDOR, as public sign-up always writes CLIENT.
 */
export const createVendorRequestSchema = z.object({
  email: emailSchema,
  companyName: z
    .string()
    .trim()
    .min(1, VALIDATION_CODES.companyNameRequired)
    .max(COMPANY_NAME_MAX_LENGTH, VALIDATION_CODES.companyNameTooLong),
  // The same policy as a client's password, so a vendor account is no weaker.
  password: z
    .string()
    .min(PASSWORD_MIN_LENGTH, VALIDATION_CODES.passwordTooShort)
    .max(PASSWORD_MAX_LENGTH, VALIDATION_CODES.passwordTooLong),
})
export type CreateVendorRequest = z.infer<typeof createVendorRequestSchema>

export const vendorSummarySchema = z.object({
  id: z.string(),
  email: z.string(),
  companyName: z.string(),
  createdAt: z.iso.datetime(),
})
export type VendorSummary = z.infer<typeof vendorSummarySchema>

export const createVendorResponseSchema = z.object({ vendor: vendorSummarySchema })
export type CreateVendorResponse = z.infer<typeof createVendorResponseSchema>

export const vendorListResponseSchema = z.object({ vendors: z.array(vendorSummarySchema) })
export type VendorListResponse = z.infer<typeof vendorListResponseSchema>
