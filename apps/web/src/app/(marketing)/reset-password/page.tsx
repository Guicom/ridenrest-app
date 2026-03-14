import { redirect } from 'next/navigation'
import { ResetPasswordForm } from './_components/reset-password-form'

export const metadata = {
  title: "Nouveau mot de passe — Ride'n'Rest",
}

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>
}) {
  const { token, error } = await searchParams

  if (!token) redirect('/forgot-password')

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-6">
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
      </div>
    </div>
  )
}
