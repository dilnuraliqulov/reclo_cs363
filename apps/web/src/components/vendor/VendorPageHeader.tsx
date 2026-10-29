import type { ReactNode } from 'react'
import { AuthControls } from '@/components/auth/AuthControls'
import { LanguageSwitcher } from '@/components/i18n/LanguageSwitcher'

/** The top bar both vendor screens share: the page title on the left, language and account on the right. */
export function VendorPageHeader({ children }: { children: ReactNode }) {
  return (
    <header className="flex items-center justify-between gap-3 border-b border-border/80 bg-background px-4 py-3">
      <div className="min-w-0">{children}</div>
      <div className="flex shrink-0 items-center gap-2">
        <LanguageSwitcher />
        <AuthControls />
      </div>
    </header>
  )
}
