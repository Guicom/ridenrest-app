import { redirect } from 'next/navigation'
import { getServerSession } from '@/lib/auth/server'
import { LoginForm } from './_components/login-form'

export const metadata = {
  title: "Connexion — Ride'n'Rest",
  description: "Connectez-vous à votre compte Ride'n'Rest",
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>
}) {
  // Already authenticated → go to adventures
  const session = await getServerSession()
  if (session) redirect('/adventures')

  const { redirect: redirectTo } = await searchParams
  // Security: only allow relative URLs to prevent open redirect
  const safeRedirectTo = redirectTo?.startsWith('/') ? redirectTo : '/adventures'

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-bold">Connexion</h1>
          <p className="text-muted-foreground text-sm">
            Pas encore de compte ?{' '}
            <a href="/register" className="text-primary underline-offset-4 hover:underline">
              Créer un compte
            </a>
          </p>
        </div>
        <LoginForm redirectTo={safeRedirectTo} />
      </div>
    </div>
  )
}
