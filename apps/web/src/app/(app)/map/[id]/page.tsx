import 'maplibre-gl/dist/maplibre-gl.css'
import { Suspense } from 'react'
import { MapView } from './_components/map-view'
import { Skeleton } from '@/components/ui/skeleton'
import { PlanningMobileToast } from './_components/planning-mobile-toast'

interface MapPageProps {
  params: Promise<{ id: string }>
}

export default async function MapPage({ params }: MapPageProps) {
  const { id } = await params
  return (
    // h-14 header from Story 8.9 — update when AppHeader is added to (app)/layout.tsx
    <div className="relative h-[calc(100dvh-3.5rem)] w-full">
      <PlanningMobileToast />
      <Suspense fallback={<Skeleton className="h-full w-full" />}>
        <MapView adventureId={id} />
      </Suspense>
    </div>
  )
}
