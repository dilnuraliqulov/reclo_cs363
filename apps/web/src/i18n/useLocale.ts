import type { InquiryStatus } from '@reclo/shared'
import { useContext } from 'react'
import type { MessageKey } from './catalog'
import { LocaleContext, type LocaleContextValue } from './context'

export function useLocale(): LocaleContextValue {
  return useContext(LocaleContext)
}

/** The lookup bound to the active locale: `t('auth.signIn')`, `t('inquiry.months', { count: 3 })`. */
export function useT(): LocaleContextValue['t'] {
  return useContext(LocaleContext).t
}

/**
 * The catalog key for a status, so the status labels live with every other string instead of in a
 * map of their own. Typed, so adding a status to the enum without a label does not compile.
 */
export function statusKey(status: InquiryStatus): MessageKey {
  return `inquiry.status.${status}`
}
