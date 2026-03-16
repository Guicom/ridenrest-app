'use client'
import { useCallback } from 'react'
import { Slider } from '@/components/ui/slider'
import { useMapStore } from '@/stores/map.store'
import { MAX_SEARCH_RANGE_KM } from '@ridenrest/shared'

interface SearchRangeSliderProps {
  totalDistanceKm: number
}

export function SearchRangeSlider({ totalDistanceKm }: SearchRangeSliderProps) {
  const { fromKm, toKm, setSearchRange } = useMapStore()

  const handleValueChange = useCallback(
    (values: number | readonly number[]) => {
      if (typeof values === 'number') return
      let [from, to] = values as [number, number]

      // Enforce 30km max range (AC #2)
      if (to - from > MAX_SEARCH_RANGE_KM) {
        // Anchor the thumb that didn't move
        if (from !== fromKm) {
          // fromKm moved → adjust toKm
          to = Math.min(from + MAX_SEARCH_RANGE_KM, totalDistanceKm)
        } else {
          // toKm moved → adjust fromKm
          from = Math.max(to - MAX_SEARCH_RANGE_KM, 0)
        }
      }

      setSearchRange(from, to)
    },
    [fromKm, setSearchRange, totalDistanceKm],
  )

  const rangeKm = toKm - fromKm
  const isAtMax = rangeKm >= MAX_SEARCH_RANGE_KM

  return (
    <div className="bg-white/90 dark:bg-zinc-900/90 backdrop-blur rounded-xl shadow-md p-3 w-64">
      <div className="flex justify-between items-center mb-2">
        <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
          Plage de recherche
        </span>
        <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
          {Math.round(fromKm)} – {Math.round(toKm)} km
        </span>
      </div>

      <Slider
        min={0}
        max={totalDistanceKm}
        step={1}
        value={[fromKm, toKm]}
        onValueChange={handleValueChange}
        className="w-full"
      />

      {isAtMax && (
        <p className="mt-1.5 text-[10px] text-amber-600 dark:text-amber-400">
          Plage maximale : {MAX_SEARCH_RANGE_KM} km
        </p>
      )}

      <div className="flex justify-between mt-1">
        <span className="text-[10px] text-zinc-400">0 km</span>
        <span className="text-[10px] text-zinc-400">{Math.round(totalDistanceKm)} km</span>
      </div>
    </div>
  )
}
