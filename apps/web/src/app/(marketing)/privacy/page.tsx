import { MarketingHeader } from '../_components/marketing-header';
import { MarketingFooter } from '../_components/marketing-footer';

export const metadata = {
  title: "Politique de confidentialité — Ride'n'Rest",
  description:
    "Comment Ride'n'Rest (site web et application mobile) collecte et traite vos données personnelles, conformément au RGPD.",
};

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen flex flex-col font-sans bg-earth-light text-earth-dark antialiased">
      <MarketingHeader />
      <main className="flex-grow">
        <article className="max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-16 md:py-24">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-light text-earth-dark uppercase tracking-tight mb-4">
            Politique de confidentialité
          </h1>
          <p className="text-sage text-sm mb-12">
            La présente politique décrit les données personnelles que Ride&apos;n&apos;Rest — le site
            <span> </span>
            <strong className="text-earth-dark">ridenrest.app</strong> et l&apos;application mobile — collecte et
            traite, conformément au Règlement général sur la protection des données (RGPD). Elle complète nos{' '}
            <a href="/mentions-legales" className="text-[#4A7C44] hover:underline font-medium">
              mentions légales
            </a>
            .
          </p>

          <div className="space-y-10 sm:space-y-12 text-earth-dark break-words">
            <section>
              <h2 className="text-xl font-semibold text-[#4A7C44] uppercase tracking-wider mb-4">
                1. Responsable du traitement
              </h2>
              <p className="text-sage leading-relaxed">
                Le responsable du traitement est :<br />
                <strong className="text-earth-dark">Guillaume Essoltani</strong>
                <br />
                Auto-entrepreneur — 1b rue des Aigles, 67810 Holtzheim
                <br />
                Contact :{' '}
                <a href="mailto:contact@ridenrest.app" className="text-[#4A7C44] hover:underline font-medium">
                  contact@ridenrest.app
                </a>
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-[#4A7C44] uppercase tracking-wider mb-4">
                2. Données que nous traitons
              </h2>
              <div className="text-sage leading-relaxed space-y-3">
                <p>
                  <strong className="text-earth-dark">Compte et identité :</strong> adresse email et identifiant de
                  compte, créés via email/mot de passe ou connexion Google / Strava (OAuth). Finalité : authentification
                  et gestion de votre compte. Base légale : exécution du service.
                </p>
                <p>
                  <strong className="text-earth-dark">Géolocalisation (application mobile) :</strong> votre position GPS
                  est utilisée pendant le mode « Live » pour vous situer sur votre trace. Elle{' '}
                  <strong className="text-earth-dark">
                    reste exclusivement sur votre appareil et n&apos;est jamais transmise ni stockée sur nos serveurs
                  </strong>{' '}
                  (voir §3).
                </p>
                <p>
                  <strong className="text-earth-dark">Mesure d&apos;usage (analytics) :</strong> avec votre consentement,
                  évènements d&apos;interaction et pages vues, via PostHog Cloud EU (voir §4).
                </p>
                <p>
                  <strong className="text-earth-dark">Diagnostics et rapports d&apos;erreur :</strong> journaux de plantage
                  et de performance techniques, via Sentry (région EU), sans données personnelles identifiantes (voir §6).
                </p>
              </div>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-[#4A7C44] uppercase tracking-wider mb-4">
                3. Géolocalisation — votre position ne quitte jamais votre appareil
              </h2>
              <div className="text-sage leading-relaxed space-y-3">
                <p>
                  L&apos;application mobile utilise la localisation (y compris en arrière-plan pendant le mode « Live »)
                  pour vous positionner sur votre itinéraire et calculer les points d&apos;intérêt à venir. Ce traitement
                  est réalisé <strong className="text-earth-dark">intégralement sur votre appareil</strong>.
                </p>
                <p>
                  <strong className="text-earth-dark">Aucune coordonnée GPS n&apos;est envoyée, journalisée ou stockée sur
                  nos serveurs.</strong> Les recherches de points d&apos;intérêt s&apos;effectuent à partir de distances
                  relatives le long de votre trace, jamais de votre position exacte. Les rapports de diagnostic sont
                  expurgés de toute donnée de position avant envoi.
                </p>
              </div>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-[#4A7C44] uppercase tracking-wider mb-4">
                4. Mesure d&apos;audience et d&apos;usage (PostHog)
              </h2>
              <div className="text-sage leading-relaxed space-y-3">
                <p>
                  <strong className="text-earth-dark">Sur le site web,</strong> avec votre consentement explicite
                  uniquement, nous utilisons PostHog Cloud EU (PostHog Inc., données hébergées exclusivement à Francfort,
                  Allemagne — sous-traitant au sens du RGPD) pour mesurer l&apos;usage du produit : pages vues, évènements
                  d&apos;interaction (recherche de points d&apos;intérêt, clics de réservation…) et enregistrement de
                  session. Aucune donnée n&apos;est collectée avant votre accord, ni après un refus.
                </p>
                <p>
                  <strong className="text-earth-dark">Dans l&apos;application mobile,</strong> la mesure d&apos;usage
                  fonctionne sans cookie, avec un identifiant anonyme stocké localement, <strong className="text-earth-dark">sans
                  identifiant publicitaire (IDFA) et sans aucun suivi entre applications</strong> — les données ne sont
                  jamais utilisées à des fins de « tracking » publicitaire.
                </p>
              </div>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-[#4A7C44] uppercase tracking-wider mb-4">
                5. Enregistrements de session et masquage
              </h2>
              <p className="text-sage leading-relaxed">
                Lorsqu&apos;ils sont activés (site web, avec consentement), les enregistrements de session rejouent
                l&apos;interface avec un masquage strict : <strong className="text-earth-dark">les vues cartographiques
                sont exclues</strong> (votre position, vos traces et zones de recherche n&apos;apparaissent dans aucun
                enregistrement), tous les champs de formulaire sont masqués, ainsi que votre adresse email.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-[#4A7C44] uppercase tracking-wider mb-4">
                6. Diagnostics et rapports d&apos;erreur (Sentry)
              </h2>
              <p className="text-sage leading-relaxed">
                Nous utilisons Sentry (région EU) pour recevoir les rapports de plantage et de performance et corriger les
                anomalies. Ces rapports sont techniques, ne contiennent pas de données personnelles identifiantes
                (<code>sendDefaultPii</code> désactivé) et sont expurgés de toute donnée de position.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-[#4A7C44] uppercase tracking-wider mb-4">
                7. Cookies et stockage local
              </h2>
              <div className="text-sage leading-relaxed space-y-3">
                <p>
                  <strong className="text-earth-dark">Fonctionnement du service (exempté de consentement) :</strong> cookie
                  de session d&apos;authentification (Better Auth), préférences d&apos;interface, et la clé{' '}
                  <code>rnr_analytics_consent</code> qui mémorise votre choix de consentement.
                </p>
                <p>
                  <strong className="text-earth-dark">Mesure d&apos;audience PostHog (soumise à consentement) :</strong>{' '}
                  déposée uniquement après acceptation — entrées préfixées <code>ph_</code>. En cas de refus ou de retrait,
                  aucun élément <code>ph_</code> n&apos;est déposé. L&apos;application mobile n&apos;utilise{' '}
                  <strong className="text-earth-dark">aucun cookie</strong>.
                </p>
              </div>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-[#4A7C44] uppercase tracking-wider mb-4">
                8. Données Strava
              </h2>
              <div className="text-sage leading-relaxed space-y-3">
                <p>
                  <strong className="text-earth-dark">Données :</strong> routes GPS (tracés GPX) importées depuis votre
                  compte Strava, via OAuth 2.0 en lecture seule (<code>read,read_all</code>), à votre initiative uniquement.
                </p>
                <p>
                  <strong className="text-earth-dark">Déconnexion :</strong> Paramètres &gt; Déconnecter Strava — supprime
                  le token et révoque l&apos;accès auprès de Strava. Vos données Strava ne sont jamais partagées avec des
                  tiers.
                </p>
              </div>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-[#4A7C44] uppercase tracking-wider mb-4">
                9. Durée de conservation
              </h2>
              <p className="text-sage leading-relaxed">
                Les données de compte et vos aventures sont conservées tant que votre compte est actif. Les enregistrements
                de session sont conservés au maximum 30 jours. La suppression de votre compte (depuis les paramètres de
                l&apos;application ou du site) entraîne l&apos;effacement définitif de vos aventures et segments.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-[#4A7C44] uppercase tracking-wider mb-4">
                10. Vos droits
              </h2>
              <p className="text-sage leading-relaxed">
                Conformément au RGPD, vous disposez d&apos;un droit d&apos;accès, de rectification, d&apos;effacement, de
                portabilité et d&apos;opposition, ainsi que du droit de retirer votre consentement à tout moment (via la
                bannière de consentement du site ou en ne l&apos;accordant pas). Vous pouvez supprimer vous-même votre
                compte et vos données depuis les paramètres. Pour exercer vos droits :{' '}
                <a href="mailto:contact@ridenrest.app" className="text-[#4A7C44] hover:underline font-medium">
                  contact@ridenrest.app
                </a>
                .
              </p>
            </section>
          </div>

          <p className="mt-16 text-sage text-sm">Dernière mise à jour : juillet 2026</p>
        </article>
      </main>
      <MarketingFooter />
    </div>
  );
}
