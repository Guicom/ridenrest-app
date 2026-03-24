'use client'
import { Layers } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { usePrefsStore } from '@/stores/prefs.store'
import { MAP_STYLES } from '@/lib/map-styles'

export function MapStylePicker() {
  const { mapStyle, setMapStyle } = usePrefsStore()

  return (
    <Popover>
      <PopoverTrigger
        aria-label="Choisir le style de carte"
        className="absolute bottom-6 right-4 z-30 bg-white border border-[--border] rounded-xl shadow-sm p-2 w-10 h-10 flex items-center justify-center"
      >
        <Layers className="h-4 w-4 text-foreground" />
      </PopoverTrigger>
      <PopoverContent side="top" align="end" className="w-44 p-1">
        {MAP_STYLES.map((style) => (
          <button
            key={style.id}
            onClick={() => setMapStyle(style.id)}
            className={cn(
              'w-full text-left px-3 py-2 rounded-lg text-sm',
              mapStyle === style.id
                ? 'bg-primary text-primary-foreground'
                : 'hover:bg-[--surface] text-foreground',
            )}
          >
            <div className="font-medium">{style.label}</div>
            <div className={cn('text-xs', mapStyle === style.id ? 'text-primary-foreground/70' : 'text-[--text-secondary]')}>
              {style.description}
            </div>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  )
}
