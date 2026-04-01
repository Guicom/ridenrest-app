import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: "Aide — Ride'n'Rest",
  description:
    "Guide d'utilisation de Ride'n'Rest : créez vos aventures, importez des GPX, planifiez vos étapes et gérez votre bivouac.",
}

const sections = [
  {
    id: 'auth',
    title: 'Connexion & Compte',
    description:
      "Ride'n'Rest supporte plusieurs méthodes de connexion : email/mot de passe, Google OAuth et Strava OAuth. Vous pouvez réinitialiser votre mot de passe depuis la page de connexion. Votre compte vous permet de gérer vos préférences et vos aventures.",
    tips: [
      "Connectez-vous avec Strava pour importer directement vos activités GPS.",
      "La réinitialisation du mot de passe se fait par email — vérifiez vos spams.",
      "Votre profil est accessible depuis \"Mon compte\" dans la navigation.",
    ],
  },
  {
    id: 'adventures',
    title: 'Aventures & Import GPX',
    description:
      "Une aventure regroupe plusieurs segments GPX représentant votre itinéraire complet. Vous pouvez importer des fichiers GPX depuis votre ordinateur ou depuis vos activités Strava. Les segments sont ordonnables par glisser-déposer.",
    tips: [
      "Créez une aventure depuis la page \"Mes aventures\" avec le bouton +.",
      "Importez plusieurs segments GPX pour un itinéraire multi-jours.",
      "Réordonnez vos segments par glisser-déposer pour ajuster l'itinéraire.",
      "Importez depuis Strava en sélectionnant plusieurs activités à la fois.",
    ],
  },
  {
    id: 'planning',
    title: 'Mode Planning (Carte)',
    description:
      "Le mode Planning vous permet de visualiser votre trace GPX sur une carte interactive. Recherchez des points d'intérêt (hébergements, restaurants, ravitaillement, vélo) dans un corridor autour de votre trace. Choisissez votre plage kilométrique et lancez la recherche.",
    tips: [
      "Cliquez sur la trace pour centrer la recherche autour d'un point précis.",
      "Activez ou désactivez les couches (hébergement, nourriture, vélo) selon vos besoins.",
      "La météo par étape est visible dans le panneau latéral après une recherche.",
      "Le zoom s'ajuste automatiquement après chaque recherche de POIs.",
    ],
  },
  {
    id: 'density',
    title: 'Analyse de densité',
    description:
      "L'analyse de densité colore votre trace GPX selon la densité des hébergements disponibles le long de l'itinéraire. Les zones rouges indiquent peu d'options, les zones vertes en ont davantage. Lancez l'analyse depuis le panneau latéral.",
    tips: [
      "Sélectionnez les catégories d'hébergement à analyser avant de lancer.",
      "Les zones rouges (faible densité) nécessitent une planification anticipée.",
      "Re-lancez l'analyse après avoir ajouté ou retiré des segments.",
    ],
  },
  {
    id: 'weather',
    title: 'Météo',
    description:
      "Les prévisions météo sont calculées via Open-Meteo sur 16 jours pour chaque étape de votre aventure. La météo tient compte de l'heure de départ estimée et de votre vitesse moyenne pour afficher les conditions au moment de votre passage.",
    tips: [
      "Configurez votre heure de départ et votre vitesse dans le panneau météo.",
      "Les prévisions sont disponibles jusqu'à 16 jours à l'avance.",
      "La météo est recalculée automatiquement en changeant les paramètres de vitesse.",
    ],
  },
  {
    id: 'live',
    title: 'Mode Live',
    description:
      "Le mode Live active la géolocalisation GPS de votre appareil pour afficher les points d'intérêt à proximité de votre position en temps réel. Votre position GPS ne quitte jamais votre appareil — tout est calculé en local.",
    tips: [
      "Activez le mode Live depuis la page de votre aventure.",
      "Acceptez la demande de géolocalisation pour démarrer le suivi.",
      "Ajustez le rayon de recherche autour de votre position avec le curseur.",
    ],
  },
  {
    id: 'stages',
    title: 'Étapes',
    description:
      "Les étapes vous permettent de découper votre aventure en journées. Placez une étape en cliquant sur la trace ou le profil d'altitude, et déplacez-la en faisant glisser son marqueur. Chaque étape affiche sa distance, son dénivelé positif et sa météo dédiée.",
    tips: [
      "Cliquez sur la trace GPX pour créer une étape à cet endroit.",
      "Glissez un marqueur d'étape pour l'ajuster précisément.",
      "La météo de chaque étape est calculée selon l'heure d'arrivée estimée.",
      "Le dénivelé positif (D+) est affiché si vos fichiers GPX contiennent des données d'altitude.",
    ],
  },
]

export default function HelpPage() {
  return (
    <main className="max-w-3xl mx-auto w-full px-4 py-10 space-y-12">
      <div>
        <h1 className="text-3xl font-bold text-text-primary mb-3">Aide</h1>
        <p className="text-text-secondary text-base">
          Bienvenue dans le guide d&apos;utilisation de Ride&apos;n&apos;Rest. Retrouvez ci-dessous
          les explications pour chaque fonctionnalité de l&apos;application.
        </p>

        {/* Anchor nav */}
        <nav className="mt-6 flex flex-wrap gap-2" aria-label="Navigation par section">
          {sections.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="text-xs font-medium px-3 py-1.5 rounded-full border border-[--border] text-text-secondary hover:text-text-primary hover:border-accent hover:bg-accent/5 transition-colors"
            >
              {s.title}
            </a>
          ))}
        </nav>
      </div>

      {sections.map((s) => (
        <section key={s.id} id={s.id} className="scroll-mt-20">
          <h2 className="text-xl font-semibold text-text-primary mb-2">{s.title}</h2>
          <p className="text-text-secondary text-sm leading-relaxed mb-4">{s.description}</p>
          <ul className="space-y-2">
            {s.tips.map((tip, i) => (
              <li key={i} className="flex gap-2 text-sm text-text-primary">
                <span className="text-text-secondary mt-0.5 shrink-0">–</span>
                <span>{tip}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <div className="border-t border-[--border] pt-8 text-sm text-text-secondary">
        <p>
          Un problème ou une question ?{' '}
          <Link href="/contact" className="text-accent hover:underline">
            Contactez-nous
          </Link>{' '}
          ou utilisez le bouton <strong>Feedback</strong> dans la navigation.
        </p>
      </div>
    </main>
  )
}
