'use client'
import { useState, useRef } from 'react'
import { MoreHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
  dragHandle?: React.ReactNode
}

export function SegmentCard({ segment, onRetry, onDelete, onReplace, onRename, isDeleting, dragHandle }: SegmentCardProps) {
  const { parseStatus, name, distanceKm, elevationGainM } = segment
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showRetryConfirm, setShowRetryConfirm] = useState(false)
  const [isRenaming, setIsRenaming] = useState(false)
  const [nameInput, setNameInput] = useState('')
  const renameSubmittedRef = useRef(false)
  const renameCancelledRef = useRef(false)

  const isPending = parseStatus === 'pending' || parseStatus === 'processing'
  const isError = parseStatus === 'error'
  const isDone = parseStatus === 'done'

  const distanceLabel = distanceKm != null ? `${distanceKm.toFixed(1)} km` : '— km'
  const elevationLabel = elevationGainM != null ? `${Math.round(elevationGainM)}m D+` : 'N/A'

  return (
    <div className="rounded-lg border p-4 flex items-center gap-3">
      {dragHandle && (
        <div className="shrink-0 text-muted-foreground">{dragHandle}</div>
      )}
      <div className="flex-1 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            {isDone && isRenaming ? (
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
                  if (e.key === 'Escape') {
                    renameCancelledRef.current = true
                    setIsRenaming(false)
                  }
                }}
                onBlur={() => {
                  if (!renameSubmittedRef.current && !renameCancelledRef.current && nameInput.trim() && nameInput.trim() !== segment.name) {
                    onRename?.(nameInput.trim())
                  }
                  renameSubmittedRef.current = false
                  renameCancelledRef.current = false
                  setIsRenaming(false)
                }}
                autoFocus
              />
            ) : (
              <p className="font-medium text-sm">{name ?? 'Segment sans nom'}</p>
            )}
            {isPending && (
              <span className="bg-density-medium text-white text-xs font-medium px-2 py-0.5 rounded-full animate-pulse">
                En cours...
              </span>
            )}
            {isError && (
              <span className="bg-density-low text-white text-xs font-medium px-2 py-0.5 rounded-full">
                Erreur
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {isDone && (
              <span className="bg-density-high text-white text-xs font-medium px-2 py-0.5 rounded-full">
                Prêt
              </span>
            )}
            {isError && (
              <Button variant="ghost" size="sm" onClick={() => setShowRetryConfirm(true)}>Réessayer</Button>
            )}
            <AlertDialog open={showRetryConfirm} onOpenChange={setShowRetryConfirm}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Remplacer &ldquo;{name ?? 'ce segment'}&rdquo; ?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Le segment actuel sera supprimé. Vous pourrez uploader un nouveau fichier GPX.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Annuler</AlertDialogCancel>
                  <AlertDialogAction onClick={onRetry}>Remplacer le fichier GPX</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
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
                    {onRename && isDone && (
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
        {isDone && (
          <div className="flex gap-4 text-xs text-muted-foreground">
            <span>{distanceLabel}</span>
            <span>{elevationLabel}</span>
            {segment.source === 'strava' && (
              <span className="flex items-center gap-1">
                <img src="/strava-logo.svg" alt="Strava" className="h-3 w-3" />
                Via Strava
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
