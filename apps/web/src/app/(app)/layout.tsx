import 'maplibre-gl/dist/maplibre-gl.css'
import { type ReactNode } from 'react'
import { QueryProvider } from '@/components/providers/query-provider'
import { Toaster } from '@/components/ui/sonner'
import { AppHeader } from '@/components/layout/app-header'

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <QueryProvider>
      <AppHeader />
      {children}
      <Toaster />
    </QueryProvider>
  )
}
