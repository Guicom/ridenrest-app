'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth/client'
import { Button } from '@/components/ui/button'

export function SignOutButton() {
  const router = useRouter()
  const [isPending, setIsPending] = useState(false)

  const handleSignOut = async () => {
    setIsPending(true)
    try {
      await authClient.signOut()
      router.push('/')
      router.refresh()
    } finally {
      setIsPending(false)
    }
  }

  return (
    <Button variant="outline" onClick={handleSignOut} disabled={isPending}>
      {isPending ? 'Déconnexion...' : 'Se déconnecter'}
    </Button>
  )
}
