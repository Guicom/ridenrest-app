'use client'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface GeolocationConsentProps {
  open: boolean
  onConsent: () => void
  onDismiss: () => void
}

export function GeolocationConsent({ open, onConsent, onDismiss }: GeolocationConsentProps) {
  return (
    <Dialog open={open} onOpenChange={() => { /* RGPD gate — ignore backdrop/escape dismissal */ }}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Activer la géolocalisation</DialogTitle>
          <DialogDescription>
            Vos données GPS sont utilisées uniquement sur votre appareil pour afficher votre position sur la carte.
            Aucune coordonnée n&apos;est envoyée ni stockée sur nos serveurs.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={onDismiss}>
            Annuler
          </Button>
          <Button onClick={onConsent}>
            Activer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
