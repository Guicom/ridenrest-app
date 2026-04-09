'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createSegment } from '@/lib/api-client'
import { MAX_GPX_FILE_SIZE_BYTES } from '@ridenrest/shared'
import { Button } from '@/components/ui/button'
import { DialogFooter } from '@/components/ui/dialog'
import { Upload, X, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface PendingFile {
  id: string
  file: File
  status: 'pending' | 'uploading' | 'success' | 'error'
  error?: string
}

interface Props {
  adventureId: string
  onSuccess?: () => void
  onPendingChange?: (pending: boolean) => void
}

function formatSize(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(2) + ' Mo'
}

function validateFile(file: File, existingNames: string[]): string | null {
  if (!file.name.toLowerCase().endsWith('.gpx')) {
    return 'Format invalide — seuls les fichiers .gpx sont acceptés'
  }
  if (file.size > MAX_GPX_FILE_SIZE_BYTES) {
    return 'Fichier trop volumineux (max 10 Mo)'
  }
  if (existingNames.includes(file.name)) {
    return 'Fichier déjà dans la liste'
  }
  return null
}

export function GpxUploadForm({ adventureId, onSuccess, onPendingChange }: Props) {
  const queryClient = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([])
  const [isDragOver, setIsDragOver] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [rejectedWarning, setRejectedWarning] = useState<string | null>(null)
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null)

  useEffect(() => {
    onPendingChange?.(isUploading)
  }, [isUploading, onPendingChange])

  const addFiles = useCallback((files: FileList | File[]) => {
    setRejectedWarning(null)
    const fileArray = Array.from(files)
    const existingNames = pendingFiles.map((p) => p.file.name)
    const rejectedNonGpx: string[] = []
    const newPending: PendingFile[] = []

    for (const file of fileArray) {
      // Filter non-GPX silently for drop, with warning
      if (!file.name.toLowerCase().endsWith('.gpx')) {
        rejectedNonGpx.push(file.name)
        continue
      }

      const error = validateFile(file, [...existingNames, ...newPending.map((p) => p.file.name)])
      if (error && error === 'Fichier déjà dans la liste') {
        // Skip duplicates silently
        continue
      }

      newPending.push({
        id: crypto.randomUUID(),
        file,
        status: error ? 'error' : 'pending',
        error: error ?? undefined,
      })
      if (!error) existingNames.push(file.name)
    }

    if (rejectedNonGpx.length > 0) {
      setRejectedWarning(
        `${rejectedNonGpx.length} fichier${rejectedNonGpx.length > 1 ? 's' : ''} rejeté${rejectedNonGpx.length > 1 ? 's' : ''} (format non-GPX)`
      )
    }

    if (newPending.length > 0) {
      setPendingFiles((prev) => [...prev, ...newPending])
    }
  }, [pendingFiles])

  const removeFile = useCallback((id: string) => {
    setPendingFiles((prev) => prev.filter((f) => f.id !== id))
  }, [])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(e.target.files)
    }
    // Reset input to allow re-selecting same files
    if (inputRef.current) inputRef.current.value = ''
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    if (e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files)
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }

  const handleDragLeave = () => {
    setIsDragOver(false)
  }

  const handleUploadAll = async () => {
    // Only upload pending files + files that failed during a previous upload attempt (not validation errors)
    const uploadable = pendingFiles.filter(
      (f) => f.status === 'pending' || (f.status === 'error' && f.error === "Échec de l'upload")
    )
    if (uploadable.length === 0) return

    setIsUploading(true)
    let successCount = pendingFiles.filter((f) => f.status === 'success').length
    const total = successCount + uploadable.length

    for (const pending of uploadable) {
      setPendingFiles((prev) =>
        prev.map((f) => (f.id === pending.id ? { ...f, status: 'uploading' as const, error: undefined } : f))
      )
      setUploadProgress({ current: successCount + 1, total })

      try {
        await createSegment(adventureId, pending.file)
        setPendingFiles((prev) =>
          prev.map((f) => (f.id === pending.id ? { ...f, status: 'success' as const } : f))
        )
        successCount++
      } catch {
        setPendingFiles((prev) =>
          prev.map((f) =>
            f.id === pending.id ? { ...f, status: 'error' as const, error: "Échec de l'upload" } : f
          )
        )
        // Invalidate cache if some files succeeded before the failure
        if (successCount > 0) {
          queryClient.invalidateQueries({ queryKey: ['adventures', adventureId, 'segments'] })
          queryClient.invalidateQueries({ queryKey: ['adventures', adventureId] })
        }
        setUploadProgress(null)
        setIsUploading(false)
        return // Pause — user decides to retry or cancel
      }
    }

    // All done
    setUploadProgress(null)
    setIsUploading(false)
    queryClient.invalidateQueries({ queryKey: ['adventures', adventureId, 'segments'] })
    queryClient.invalidateQueries({ queryKey: ['adventures', adventureId] })
    toast.success(`${successCount} segment${successCount > 1 ? 's' : ''} ajouté${successCount > 1 ? 's' : ''}`)
    onSuccess?.()
  }

  const validPendingCount = pendingFiles.filter((f) => f.status === 'pending').length
  const hasRetryable = pendingFiles.some((f) => f.status === 'error' && f.error === "Échec de l'upload")

  return (
    <>
      <div className="space-y-3">
        {/* Drop zone */}
        <div
          className={cn(
            'border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors',
            isDragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/25',
            isUploading && 'pointer-events-none opacity-50'
          )}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => !isUploading && inputRef.current?.click()}
        >
          <Upload className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">
            Glissez vos fichiers GPX ici ou cliquez pour sélectionner
          </p>
          <input
            ref={inputRef}
            type="file"
            accept=".gpx"
            multiple
            className="hidden"
            onChange={handleFileChange}
            disabled={isUploading}
          />
        </div>

        {/* Rejected files warning */}
        {rejectedWarning && (
          <p className="text-amber-600 text-xs flex items-center gap-1">
            <AlertCircle className="h-3 w-3 shrink-0" />
            {rejectedWarning}
          </p>
        )}

        {/* File list */}
        {pendingFiles.length > 0 && (
          <ul className="space-y-1.5 max-h-48 overflow-y-auto">
            {pendingFiles.map((pf) => (
              <li
                key={pf.id}
                className={cn(
                  'flex items-center gap-2 text-xs rounded-md px-2 py-1.5',
                  pf.status === 'error' && 'bg-destructive/10',
                  pf.status === 'success' && 'bg-green-500/10',
                  pf.status === 'uploading' && 'bg-primary/5'
                )}
              >
                {/* Status icon */}
                {pf.status === 'pending' && <div className="h-3 w-3 shrink-0" />}
                {pf.status === 'uploading' && <Loader2 className="h-3 w-3 shrink-0 animate-spin text-primary" />}
                {pf.status === 'success' && <CheckCircle2 className="h-3 w-3 shrink-0 text-green-600" />}
                {pf.status === 'error' && <AlertCircle className="h-3 w-3 shrink-0 text-destructive" />}

                {/* File info */}
                <span className="truncate flex-1">{pf.file.name}</span>
                <span className="text-muted-foreground shrink-0">{formatSize(pf.file.size)}</span>

                {/* Error message */}
                {pf.error && <span className="text-destructive shrink-0">{pf.error}</span>}

                {/* Remove button (only when not uploading/success) */}
                {pf.status !== 'uploading' && pf.status !== 'success' && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); removeFile(pf.id) }}
                    className="shrink-0 text-muted-foreground hover:text-foreground p-0.5"
                    aria-label={`Retirer ${pf.file.name}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {/* Upload progress */}
        {uploadProgress && (
          <p className="text-xs text-muted-foreground text-center">
            {uploadProgress.current} / {uploadProgress.total} fichiers envoyés
          </p>
        )}
      </div>

      <DialogFooter>
        <Button
          size="lg"
          onClick={handleUploadAll}
          disabled={(validPendingCount === 0 && !hasRetryable) || isUploading}
        >
          {isUploading
            ? `Upload en cours... (${uploadProgress?.current ?? 0}/${uploadProgress?.total ?? 0})`
            : hasRetryable
              ? 'Réessayer'
              : 'Envoyer'}
        </Button>
      </DialogFooter>
    </>
  )
}
