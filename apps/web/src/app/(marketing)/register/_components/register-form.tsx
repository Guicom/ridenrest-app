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

const registerSchema = z
  .object({
    name: z.string().min(2, 'Nom requis (min 2 caractères)'),
    email: z.string().email('Email invalide'),
    password: z.string().min(8, 'Mot de passe : 8 caractères minimum'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Les mots de passe ne correspondent pas',
    path: ['confirmPassword'],
  })

type RegisterValues = z.infer<typeof registerSchema>

export function RegisterForm() {
  const router = useRouter()
  const [authError, setAuthError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
  })

  const onSubmit = async (values: RegisterValues) => {
    setAuthError(null)

    const { data, error } = await authClient.signUp.email({
      name: values.name,
      email: values.email,
      password: values.password,
    })

    if (error) {
      if (error.code === 'USER_ALREADY_EXISTS') {
        setAuthError('Un compte existe déjà avec cet email')
      } else {
        setAuthError(error.message ?? 'Une erreur est survenue. Réessayez.')
      }
      return
    }

    if (data) {
      router.push('/adventures')
      router.refresh()
    }
  }

  return (
    <div className="space-y-4">
      <GoogleSignInButton />

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
          <Label htmlFor="name">Nom d&apos;affichage</Label>
          <Input
            id="name"
            type="text"
            placeholder="Sophie Bikepacker"
            autoComplete="name"
            {...register('name')}
          />
          {errors.name && <p className="text-destructive text-xs">{errors.name.message}</p>}
        </div>

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
          <Label htmlFor="password">Mot de passe</Label>
          <Input
            id="password"
            type="password"
            placeholder="••••••••"
            autoComplete="new-password"
            {...register('password')}
          />
          {errors.password && <p className="text-destructive text-xs">{errors.password.message}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirmPassword">Confirmer le mot de passe</Label>
          <Input
            id="confirmPassword"
            type="password"
            placeholder="••••••••"
            autoComplete="new-password"
            {...register('confirmPassword')}
          />
          {errors.confirmPassword && (
            <p className="text-destructive text-xs">{errors.confirmPassword.message}</p>
          )}
        </div>

        {authError && <ErrorMessage message={authError} />}

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? 'Création...' : 'Créer mon compte'}
        </Button>
      </form>
    </div>
  )
}
