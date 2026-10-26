import { Route, Routes } from 'react-router'
import { AuthProvider } from '@/auth/AuthProvider'
import { GuestOnly } from '@/auth/GuestOnly'
import { Toaster } from '@/components/ui/sonner'
import { PlacementsDiscoveryPage } from '@/pages/PlacementsDiscoveryPage'
import { SignInPage } from '@/pages/SignInPage'
import { SignUpPage } from '@/pages/SignUpPage'

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<PlacementsDiscoveryPage />} />
        <Route path="/placements" element={<PlacementsDiscoveryPage />} />
        <Route element={<GuestOnly />}>
          <Route path="/sign-in" element={<SignInPage />} />
          <Route path="/sign-up" element={<SignUpPage />} />
        </Route>
      </Routes>
      <Toaster />
    </AuthProvider>
  )
}
