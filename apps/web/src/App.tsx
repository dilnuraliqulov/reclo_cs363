import { Route, Routes } from 'react-router'
import { AuthProvider } from '@/auth/AuthProvider'
import { GuestOnly } from '@/auth/GuestOnly'
import { RequireAuth } from '@/auth/RequireAuth'
import { RequireRole } from '@/auth/RequireRole'
import { CartProvider } from '@/components/cart/CartProvider'
import { Toaster } from '@/components/ui/sonner'
import { LocaleProvider } from '@/i18n/LocaleProvider'
import { AdminVendorsPage } from '@/pages/AdminVendorsPage'
import { InquiryHistoryPage } from '@/pages/InquiryHistoryPage'
import { ModerationPage } from '@/pages/ModerationPage'
import { PlacementsDiscoveryPage } from '@/pages/PlacementsDiscoveryPage'
import { SignInPage } from '@/pages/SignInPage'
import { SignUpPage } from '@/pages/SignUpPage'
import { ListingEditorPage } from '@/pages/ListingEditorPage'
import { VendorListingsPage } from '@/pages/VendorListingsPage'

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
              <Route element={<RequireRole role="VENDOR" />}>
                <Route path="/vendor/placements" element={<VendorListingsPage />} />
                <Route path="/vendor/placements/new" element={<ListingEditorPage />} />
                <Route path="/vendor/placements/:id/edit" element={<ListingEditorPage />} />
              </Route>
            </Route>
            <Route element={<RequireRole role="ADMIN" />}>
              <Route path="/admin/moderation/:id?" element={<ModerationPage />} />
              <Route path="/admin/vendors" element={<AdminVendorsPage />} />
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
