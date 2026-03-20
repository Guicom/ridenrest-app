import { Suspense } from 'react'
import { AdventureList, AdventureListSkeleton } from './_components/adventure-list'
import { CreateAdventureButton } from './_components/create-adventure-button'

export const metadata = {
  title: "Mes aventures — Ride'n'Rest",
}

export default function AdventuresPage() {
  return (
    <main className="min-h-screen bg-background-page">
      <div className="max-w-3xl mx-auto px-4 py-6 lg:bg-white lg:rounded-2xl lg:shadow-sm lg:p-8">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-text-primary">Mes aventures</h1>
          <CreateAdventureButton />
        </div>
        <div className="rounded-xl p-4 bg-background-intro mb-6 text-sm text-[--text-primary]">
          <p><span className="font-semibold">Planning</span> — Prépare ton itinéraire : hébergements, densité, météo sur chaque tronçon.</p>
          <p className="mt-1"><span className="font-semibold">Live</span> — Sur le vélo : visualise les options dans les prochains kilomètres devant toi.</p>
        </div>
        <Suspense fallback={<AdventureListSkeleton />}>
          <AdventureList />
        </Suspense>
      </div>
    </main>
  )
}
