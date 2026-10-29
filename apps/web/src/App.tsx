import { Route, Routes } from 'react-router'
import { AuthProvider } from '@/auth/AuthProvider'
import { GuestOnly } from '@/auth/GuestOnly'
import { RequireAuth } from '@/auth/RequireAuth'
import { CartProvider } from '@/components/cart/CartProvider'
import { Toaster } from '@/components/ui/sonner'
import { LocaleProvider } from '@/i18n/LocaleProvider'
import { InquiryHistoryPage } from '@/pages/InquiryHistoryPage'
import { PlacementsDiscoveryPage } from '@/pages/PlacementsDiscoveryPage'
import { SignInPage } from '@/pages/SignInPage'
import { SignUpPage } from '@/pages/SignUpPage'

export default function App() {
  return (
    <LocaleProvider>
      <AuthProvider>
        <CartProvider>
          <Routes>
            <Route path="/" element={<PlacementsDiscoveryPage />} />
            <Route path="/placements" element={<PlacementsDiscoveryPage />} />
            <Route element={<RequireAuth />}>
              <Route path="/inquiries" element={<InquiryHistoryPage />} />
            </Route>
            <Route element={<GuestOnly />}>
              <Route path="/sign-in" element={<SignInPage />} />
              <Route path="/sign-up" element={<SignUpPage />} />
            </Route>
          </Routes>
          <Toaster />
        </CartProvider>
      </AuthProvider>
    </LocaleProvider>
  )
}
