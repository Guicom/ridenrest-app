'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { authClient } from '@/lib/auth/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ErrorMessage } from '@/components/shared/error-message'
import { GoogleSignInButton } from '@/components/shared/google-sign-in-button'

const loginSchema = z.object({
  email: z.string().email('Email invalide'),
  password: z.string().min(1, 'Mot de passe requis'),
})

type LoginValues = z.infer<typeof loginSchema>

interface LoginFormProps {
  redirectTo: string
}

export function LoginForm({ redirectTo }: LoginFormProps) {
  const router = useRouter()
  const [authError, setAuthError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
  })

  const onSubmit = async (values: LoginValues) => {
    setAuthError(null)

    const { data, error } = await authClient.signIn.email({
      email: values.email,
      password: values.password,
    })

    if (error) {
      // Better Auth error codes: 'INVALID_EMAIL_OR_PASSWORD' → French message
      setAuthError('Email ou mot de passe incorrect')
      return
    }

    if (data) {
      router.push(redirectTo)
      router.refresh() // Revalidate server components (clears cached session state)
    }
  }

  return (
    <div className="space-y-4">
      <GoogleSignInButton callbackURL={redirectTo} />

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-background px-2 text-muted-foreground">ou</span>
        </div>
      </div>

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

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Mot de passe</Label>
            <a
              href="/forgot-password"
              className="text-xs text-muted-foreground underline-offset-4 hover:underline"
            >
              Mot de passe oublié ?
            </a>
          </div>
          <Input
            id="password"
            type="password"
            placeholder="••••••••"
            autoComplete="current-password"
            {...register('password')}
          />
          {errors.password && <p className="text-destructive text-xs">{errors.password.message}</p>}
        </div>

        {authError && <ErrorMessage message={authError} />}

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? 'Connexion...' : 'Se connecter'}
        </Button>
      </form>
    </div>
  )
}
