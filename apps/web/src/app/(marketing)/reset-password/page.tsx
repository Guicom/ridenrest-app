import { redirect } from 'next/navigation'
import { getServerSession } from '@/lib/auth/server'
import { AuthPageWrapper } from '../_components/auth-page-wrapper'
import { ResetPasswordForm } from './_components/reset-password-form'

export const metadata = {
  title: "Nouveau mot de passe — Ride'n'Rest",
}

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>
}) {
  const session = await getServerSession()
  if (session) redirect('/adventures')

  const { token, error } = await searchParams

  if (!token) redirect('/forgot-password')

  return (
    <AuthPageWrapper>
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-bold">Nouveau mot de passe</h1>
        <p className="text-muted-foreground text-sm">
          Choisissez un nouveau mot de passe pour votre compte.
        </p>
      </div>
      {error === 'INVALID_TOKEN' && (
        <p className="text-destructive text-sm text-center">
          Ce lien a expiré ou est invalide.{' '}
          <a href="/forgot-password" className="underline">
            Demander un nouveau lien
          </a>
        </p>
      )}
      <ResetPasswordForm token={token} />
    </AuthPageWrapper>
  )
}
