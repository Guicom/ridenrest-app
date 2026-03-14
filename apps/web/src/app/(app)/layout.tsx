import { type ReactNode } from 'react'
import { QueryProvider } from '@/components/providers/query-provider'

export default function AppLayout({ children }: { children: ReactNode }) {
  return <QueryProvider>{children}</QueryProvider>
}
