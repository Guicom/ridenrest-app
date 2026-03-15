'use client'
import { useState, useRef } from 'react'
import { AlertCircle, MapPin, MoreHorizontal } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import type { AdventureSegmentResponse } from '@ridenrest/shared'

export interface SegmentCardProps {
  segment: AdventureSegmentResponse
  onRetry: () => void
  onDelete?: () => void
  onReplace?: () => void
  onRename?: (name: string) => void
  isDeleting?: boolean
}

export function SegmentCard({ segment, onRetry, onDelete, onReplace, onRename, isDeleting }: SegmentCardProps) {
  const { parseStatus, name, distanceKm, elevationGainM } = segment
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [isRenaming, setIsRenaming] = useState(false)
  const [nameInput, setNameInput] = useState('')
  const renameSubmittedRef = useRef(false)

  if (parseStatus === 'pending' || parseStatus === 'processing') {
    return (
      <div className="rounded-lg border p-4 space-y-2">
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-3 w-1/3" />
        <p className="text-xs text-muted-foreground">
          {parseStatus === 'pending' ? "En attente d'analyse..." : 'Analyse en cours...'}
        </p>
      </div>
    )
  }

  if (parseStatus === 'error') {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4 space-y-2">
        <div className="flex items-center gap-2 text-destructive">
          <AlertCircle className="h-4 w-4" />
          <span className="text-sm font-medium">{name ?? 'Segment sans nom'}</span>
        </div>
        <p className="text-xs text-destructive">
          Parsing échoué — vérifiez le format du fichier GPX
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onRetry}>
            Réessayer
          </Button>
          {onDelete && (
            <Button variant="outline" size="sm" onClick={onDelete} disabled={isDeleting}>
              Supprimer
            </Button>
          )}
        </div>
      </div>
    )
  }

  // parseStatus === 'done'
  const distanceLabel = distanceKm != null ? `${distanceKm.toFixed(1)} km` : '— km'
  const elevationLabel = elevationGainM != null ? `${Math.round(elevationGainM)}m D+` : 'N/A'

  return (
    <div className="rounded-lg border p-4 space-y-2">
      <div className="flex items-center justify-between">
        {isRenaming ? (
          <input
            className="font-medium text-sm bg-transparent border-b border-primary outline-none"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && nameInput.trim()) {
                renameSubmittedRef.current = true
                onRename?.(nameInput.trim())
                setIsRenaming(false)
              }
              if (e.key === 'Escape') setIsRenaming(false)
            }}
            onBlur={() => {
              if (!renameSubmittedRef.current && nameInput.trim() && nameInput.trim() !== segment.name) {
                onRename?.(nameInput.trim())
              }
              renameSubmittedRef.current = false
              setIsRenaming(false)
            }}
            autoFocus
          />
        ) : (
          <p className="font-medium text-sm">{name ?? 'Segment sans nom'}</p>
        )}
        <div className="flex items-center gap-2">
          <Badge variant="secondary">Analysé</Badge>
          {(onDelete || onReplace || onRename) && (
            <>
              <DropdownMenu>
                <DropdownMenuTrigger
                  className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  aria-label="Options du segment"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {onRename && (
                    <DropdownMenuItem
                      onClick={() => {
                        setNameInput(segment.name ?? '')
                        setIsRenaming(true)
                      }}
                    >
                      Renommer
                    </DropdownMenuItem>
                  )}
                  {onReplace && (
                    <DropdownMenuItem onClick={onReplace}>
                      Remplacer
                    </DropdownMenuItem>
                  )}
                  {onDelete && (
                    <DropdownMenuItem onClick={() => setShowDeleteDialog(true)}>
                      Supprimer
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              {onDelete && (
                <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Supprimer &ldquo;{name ?? 'ce segment'}&rdquo; ?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Cette action est irréversible. Le fichier GPX sera définitivement supprimé.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Annuler</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={onDelete}
                        disabled={isDeleting}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        {isDeleting ? 'Suppression...' : 'Supprimer'}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </>
          )}
        </div>
      </div>
      <div className="flex gap-4 text-xs text-muted-foreground">
        <span>{distanceLabel}</span>
        <span>{elevationLabel}</span>
      </div>
      <Button
        variant="outline"
        size="sm"
        disabled
        title="Disponible dans la version carte"
      >
        <MapPin className="h-3 w-3 mr-1" />
        Afficher sur la carte
      </Button>
    </div>
  )
}
