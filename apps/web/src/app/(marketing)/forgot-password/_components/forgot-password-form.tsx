'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { authClient } from '@/lib/auth/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ErrorMessage } from '@/components/shared/error-message'

const schema = z.object({
  email: z.string().email('Email invalide'),
})

type Values = z.infer<typeof schema>

export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) })

  const onSubmit = async (values: Values) => {
    setAuthError(null)
    const { error } = await authClient.requestPasswordReset({
      email: values.email,
      redirectTo: `${window.location.origin}/reset-password`,
    })
    if (error) {
      setAuthError('Une erreur est survenue. Réessayez.')
      return
    }
    setSent(true)
  }

  if (sent) {
    return (
      <div className="rounded-lg border p-4 text-center space-y-2">
        <p className="font-medium">Email envoyé !</p>
        <p className="text-sm text-muted-foreground">
          Vérifiez votre boîte email pour le lien de réinitialisation.
        </p>
        <p className="text-xs text-muted-foreground">
          Pas reçu ?{' '}
          <button
            type="button"
            className="text-primary underline-offset-4 hover:underline"
            onClick={() => setSent(false)}
          >
            Renvoyer
          </button>
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          placeholder="votre@email.com"
          autoComplete="email"
          {...register('email')}
        />
        {errors.email && <p className="text-destructive text-xs">{errors.email.message}</p>}
      </div>

      {authError && <ErrorMessage message={authError} />}

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? 'Envoi...' : 'Envoyer le lien'}
      </Button>

      <p className="text-center text-sm">
        <a href="/login" className="text-primary underline-offset-4 hover:underline">
          Retour à la connexion
        </a>
      </p>
    </form>
  )
}
