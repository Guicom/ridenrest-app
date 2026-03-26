'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Eye, EyeOff } from 'lucide-react'
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
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

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
          <span className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-white px-2 text-foreground font-medium">ou</span>
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
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••"
              autoComplete="new-password"
              {...register('password')}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {errors.password && <p className="text-destructive text-xs">{errors.password.message}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirmPassword">Confirmer le mot de passe</Label>
          <div className="relative">
            <Input
              id="confirmPassword"
              type={showConfirmPassword ? 'text' : 'password'}
              placeholder="••••••••"
              autoComplete="new-password"
              {...register('confirmPassword')}
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label={showConfirmPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
            >
              {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {errors.confirmPassword && (
            <p className="text-destructive text-xs">{errors.confirmPassword.message}</p>
          )}
        </div>

        {authError && <ErrorMessage message={authError} />}

        <Button type="submit" className="w-full py-6" disabled={isSubmitting}>
          {isSubmitting ? 'Création...' : 'Créer mon compte'}
        </Button>
      </form>
    </div>
  )
}
