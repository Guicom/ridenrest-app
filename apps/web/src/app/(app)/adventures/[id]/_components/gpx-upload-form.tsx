'use client'

import { useState, useRef, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createSegment } from '@/lib/api-client'
import { MAX_GPX_FILE_SIZE_BYTES } from '@ridenrest/shared'
import { Button } from '@/components/ui/button'
import { DialogFooter } from '@/components/ui/dialog'

interface Props {
  adventureId: string
  onSuccess?: () => void
  onPendingChange?: (pending: boolean) => void
}

export function GpxUploadForm({ adventureId, onSuccess, onPendingChange }: Props) {
  const queryClient = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)

  const uploadMutation = useMutation({
    mutationFn: (file: File) => createSegment(adventureId, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adventures', adventureId, 'segments'] })
      queryClient.invalidateQueries({ queryKey: ['adventures', adventureId] })
      setSelectedFile(null)
      if (inputRef.current) inputRef.current.value = ''
      onSuccess?.()
    },
  })

  useEffect(() => {
    onPendingChange?.(uploadMutation.isPending)
  }, [uploadMutation.isPending, onPendingChange])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFileError(null)
    const file = e.target.files?.[0]
    if (!file) { setSelectedFile(null); return }

    // Client-side size validation (AC #7)
    if (file.size > MAX_GPX_FILE_SIZE_BYTES) {
      setFileError('Fichier trop volumineux (max 10 MB)')
      setSelectedFile(null)
      e.target.value = ''
      return
    }

    if (!file.name.toLowerCase().endsWith('.gpx')) {
      setFileError('Format invalide — seuls les fichiers .gpx sont acceptés')
      setSelectedFile(null)
      e.target.value = ''
      return
    }

    setSelectedFile(file)
  }

  const handleUpload = () => {
    if (!selectedFile) return
    uploadMutation.mutate(selectedFile)
  }

  return (
    <>
      <div className="space-y-3">
        <div>
          <input
            ref={inputRef}
            type="file"
            accept=".gpx"
            onChange={handleFileChange}
            className="block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary file:text-primary-foreground hover:file:cursor-pointer"
            disabled={uploadMutation.isPending}
          />
          {fileError && <p className="text-destructive text-xs mt-1">{fileError}</p>}
          {selectedFile && (
            <p className="text-xs text-muted-foreground mt-1">
              {selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
            </p>
          )}
        </div>

        {uploadMutation.isError && (
          <p className="text-destructive text-xs">
            Échec de l&apos;upload. Réessayez.
          </p>
        )}
      </div>

      <DialogFooter>
        <Button
          size="lg"
          onClick={handleUpload}
          disabled={!selectedFile || uploadMutation.isPending}
        >
          {uploadMutation.isPending ? 'Upload en cours...' : 'Uploader le segment'}
        </Button>
      </DialogFooter>
    </>
  )
}
