import { Suspense } from 'react'
import { AdventureList } from './_components/adventure-list'

export const metadata = {
  title: "Mes aventures — Ride'n'Rest",
}

export default function AdventuresPage() {
  return (
    <main className="container mx-auto max-w-4xl p-4">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Mes aventures</h1>
      </div>
      <Suspense fallback={<div className="animate-pulse h-32 bg-muted rounded-lg" />}>
        <AdventureList />
      </Suspense>
    </main>
  )
}
