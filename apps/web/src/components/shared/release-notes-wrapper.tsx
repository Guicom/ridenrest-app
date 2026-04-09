'use client'

import { useEffect } from 'react'
import { useReleaseNotes } from '@/hooks/use-release-notes'
import { ReleaseNotesDialog } from '@/components/shared/release-notes-dialog'
import { currentRelease } from '@/lib/changelog'

export function ReleaseNotesWrapper() {
  const { showReleaseNotes, dismissReleaseNotes } = useReleaseNotes()

  // Si aucune release note n'est disponible pour cette version, on dismiss
  // silencieusement pour éviter un état showReleaseNotes=true sans UI de fermeture.
  useEffect(() => {
    if (showReleaseNotes && !currentRelease) {
      dismissReleaseNotes()
    }
  }, [showReleaseNotes, dismissReleaseNotes])

  return (
    <ReleaseNotesDialog
      open={showReleaseNotes}
      onOpenChange={(open) => {
        if (!open) dismissReleaseNotes()
      }}
    />
  )
}
