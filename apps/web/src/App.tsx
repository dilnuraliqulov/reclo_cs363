import { Route, Routes } from 'react-router'
import { AuthProvider } from '@/auth/AuthProvider'
import { GuestOnly } from '@/auth/GuestOnly'
import { RequireAuth } from '@/auth/RequireAuth'
import { RequireRole } from '@/auth/RequireRole'
import { Toaster } from '@/components/ui/sonner'
import { LocaleProvider } from '@/i18n/LocaleProvider'
import { InquiryHistoryPage } from '@/pages/InquiryHistoryPage'
import { ModerationPage } from '@/pages/ModerationPage'
import { PlacementsDiscoveryPage } from '@/pages/PlacementsDiscoveryPage'
import { SignInPage } from '@/pages/SignInPage'
import { SignUpPage } from '@/pages/SignUpPage'

export default function App() {
  return (
    <LocaleProvider>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<PlacementsDiscoveryPage />} />
          <Route path="/placements" element={<PlacementsDiscoveryPage />} />
          <Route element={<RequireAuth />}>
            <Route path="/inquiries" element={<InquiryHistoryPage />} />
          </Route>
          <Route element={<RequireRole role="ADMIN" />}>
            <Route path="/admin/moderation/:id?" element={<ModerationPage />} />
          </Route>
          <Route element={<GuestOnly />}>
            <Route path="/sign-in" element={<SignInPage />} />
            <Route path="/sign-up" element={<SignUpPage />} />
          </Route>
        </Routes>
        <Toaster />
      </AuthProvider>
    </LocaleProvider>
  )
}
