import { redirect } from 'next/navigation'
import { getServerSession } from '@/lib/auth/server'
import { RegisterForm } from './_components/register-form'

export const metadata = {
  title: "Créer un compte — Ride'n'Rest",
  description: "Créez votre compte Ride'n'Rest pour planifier vos aventures",
}

export default async function RegisterPage() {
  // Already authenticated → go to adventures
  const session = await getServerSession()
  if (session) redirect('/adventures')

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-bold">Créer un compte</h1>
          <p className="text-muted-foreground text-sm">
            Déjà un compte ?{' '}
            <a href="/login" className="text-primary underline-offset-4 hover:underline">
              Se connecter
            </a>
          </p>
        </div>
        <RegisterForm />
      </div>
    </div>
  )
}
