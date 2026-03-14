import { redirect } from 'next/navigation'
import { getServerSession } from '@/lib/auth/server'
import { ForgotPasswordForm } from './_components/forgot-password-form'

export const metadata = {
  title: "Mot de passe oublié — Ride'n'Rest",
}

export default async function ForgotPasswordPage() {
  const session = await getServerSession()
  if (session) redirect('/adventures')

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-bold">Mot de passe oublié</h1>
          <p className="text-muted-foreground text-sm">
            Entrez votre email pour recevoir un lien de réinitialisation.
          </p>
        </div>
        <ForgotPasswordForm />
      </div>
    </div>
  )
}
