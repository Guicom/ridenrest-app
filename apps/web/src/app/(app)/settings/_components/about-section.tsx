'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ReleaseNotesDialog } from '@/components/shared/release-notes-dialog'
import { currentRelease } from '@/lib/changelog'

export function AboutSection() {
  const [showReleaseNotes, setShowReleaseNotes] = useState(false)

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide px-1">
        À propos
      </h2>
      <Card>
        <CardContent className="flex items-center justify-between py-4">
          <span className="text-sm text-muted-foreground">
            Version {process.env.NEXT_PUBLIC_APP_VERSION ?? '0.0.0'}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowReleaseNotes(true)}
            disabled={!currentRelease}
          >
            Voir les notes de version
          </Button>
        </CardContent>
      </Card>
      <ReleaseNotesDialog open={showReleaseNotes} onOpenChange={setShowReleaseNotes} />
    </section>
  )
}
