import 'maplibre-gl/dist/maplibre-gl.css'
import { Suspense } from 'react'
import { MapView } from './_components/map-view'
import { Skeleton } from '@/components/ui/skeleton'

interface MapPageProps {
  params: Promise<{ id: string }>
}

export default async function MapPage({ params }: MapPageProps) {
  const { id } = await params
  return (
    <div className="relative h-[calc(100vh-4rem)] w-full">
      <Suspense fallback={<Skeleton className="h-full w-full" />}>
        <MapView adventureId={id} />
      </Suspense>
    </div>
  )
}
