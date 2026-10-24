import { Route, Routes } from 'react-router'
import { Toaster } from '@/components/ui/sonner'
import { PlacementsDiscoveryPage } from '@/pages/PlacementsDiscoveryPage'

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<PlacementsDiscoveryPage />} />
        <Route path="/placements" element={<PlacementsDiscoveryPage />} />
      </Routes>
      <Toaster />
    </>
  )
}
