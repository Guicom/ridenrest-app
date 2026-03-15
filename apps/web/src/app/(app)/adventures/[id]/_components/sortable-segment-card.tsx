'use client'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'
import { SegmentCard } from './segment-card'
import type { AdventureSegmentResponse } from '@ridenrest/shared'

interface SortableSegmentCardProps {
  segment: AdventureSegmentResponse
  onDelete: () => void
  onReplace: () => void
  isDeleting?: boolean
}

export function SortableSegmentCard({ segment, onDelete, onReplace, isDeleting }: SortableSegmentCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: segment.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div ref={setNodeRef} style={style} className="flex items-start gap-2">
      <button
        className="mt-3 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground p-1"
        aria-label="Réordonner le segment"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="flex-1">
        <SegmentCard segment={segment} onDelete={onDelete} onReplace={onReplace} onRetry={onReplace} isDeleting={isDeleting} />
      </div>
    </div>
  )
}
