import { type ReactNode } from 'react'
import { QueryProvider } from '@/components/providers/query-provider'
import { Toaster } from '@/components/ui/sonner'

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <QueryProvider>
      {children}
      <Toaster />
    </QueryProvider>
  )
}
