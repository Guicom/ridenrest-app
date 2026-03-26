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
  onRename?: (name: string) => void
  isDeleting?: boolean
}

export function SortableSegmentCard({ segment, onDelete, onReplace, onRename, isDeleting }: SortableSegmentCardProps) {
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
    <div
      ref={setNodeRef}
      style={style}
      className="cursor-grab active:cursor-grabbing"
      {...attributes}
      {...listeners}
    >
      <SegmentCard
        segment={segment}
        onDelete={onDelete}
        onReplace={onReplace}
        onRename={onRename}
        onRetry={onReplace}
        isDeleting={isDeleting}
        dragHandle={<GripVertical className="h-4 w-4" />}
      />
    </div>
  )
}
