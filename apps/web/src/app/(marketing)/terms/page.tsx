import { MarketingHeader } from '../_components/marketing-header';
import { MarketingFooter } from '../_components/marketing-footer';

export const metadata = {
  title: "Conditions générales d'utilisation — Ride'n'Rest",
  description:
    "Conditions générales d'utilisation du service Ride'n'Rest (site web et application mobile).",
};

export default function TermsPage() {
  return (
    <div className="min-h-screen flex flex-col font-sans bg-earth-light text-earth-dark antialiased">
      <MarketingHeader />
      <main className="flex-grow">
        <article className="max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-16 md:py-24">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-light text-earth-dark uppercase tracking-tight mb-4">
            Conditions générales d&apos;utilisation
          </h1>
          <p className="text-sage text-sm mb-12">
            Les présentes conditions générales d&apos;utilisation (« CGU ») régissent l&apos;accès et l&apos;utilisation du
            service Ride&apos;n&apos;Rest, accessible via le site <strong className="text-earth-dark">ridenrest.app</strong>{' '}
            et l&apos;application mobile (ci-après « le Service »).
          </p>

          <div className="space-y-10 sm:space-y-12 text-earth-dark break-words">
            <section>
              <h2 className="text-xl font-semibold text-[#4A7C44] uppercase tracking-wider mb-4">
                1. Objet
              </h2>
              <p className="text-sage leading-relaxed">
                Ride&apos;n&apos;Rest est un outil de <strong className="text-earth-dark">planification d&apos;itinéraires
                de bikepacking</strong> : import de traces GPX, visualisation cartographique, recherche de points
                d&apos;intérêt (hébergements, ravitaillement…), analyse de dénivelé et de météo. Les présentes CGU
                définissent les conditions dans lesquelles l&apos;utilisateur peut accéder au Service et l&apos;utiliser.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-[#4A7C44] uppercase tracking-wider mb-4">
                2. Acceptation des CGU
              </h2>
              <p className="text-sage leading-relaxed">
                L&apos;utilisation du Service implique l&apos;acceptation pleine et entière des présentes CGU. Si vous
                n&apos;acceptez pas ces conditions, vous devez renoncer à utiliser le Service. L&apos;éditeur se réserve le
                droit de modifier les CGU à tout moment ; la version applicable est celle en vigueur à la date de votre
                utilisation.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-[#4A7C44] uppercase tracking-wider mb-4">
                3. Compte utilisateur
              </h2>
              <div className="text-sage leading-relaxed space-y-3">
                <p>
                  L&apos;accès aux fonctionnalités nécessite la création d&apos;un compte (email/mot de passe ou connexion
                  Google / Strava). Vous êtes responsable de l&apos;exactitude des informations fournies et de la
                  confidentialité de vos identifiants.
                </p>
                <p>
                  Vous pouvez supprimer votre compte à tout moment depuis les paramètres ; cette action est irréversible et
                  entraîne la suppression de vos aventures et segments.
                </p>
              </div>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-[#4A7C44] uppercase tracking-wider mb-4">
                4. Utilisation acceptable
              </h2>
              <p className="text-sage leading-relaxed">
                Vous vous engagez à utiliser le Service conformément à la loi et aux présentes CGU, à ne pas en perturber le
                fonctionnement, à ne pas tenter d&apos;y accéder de manière non autorisée, et à n&apos;importer que des
                contenus (traces GPX notamment) dont vous détenez les droits.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-[#4A7C44] uppercase tracking-wider mb-4">
                5. Propriété intellectuelle
              </h2>
              <p className="text-sage leading-relaxed">
                Le Service, sa marque, son logo et ses contenus sont protégés par le droit de la propriété intellectuelle.
                Vous conservez la propriété des traces et données que vous importez ; vous accordez à l&apos;éditeur une
                licence limitée strictement nécessaire à la fourniture du Service (stockage, affichage, traitement pour
                votre seul usage). Les fonds de carte sont fournis par OpenFreeMap / OpenStreetMap (licence ODbL,
                attribution affichée).
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-[#4A7C44] uppercase tracking-wider mb-4">
                6. Sécurité — outil indicatif, pas un dispositif de navigation
              </h2>
              <div className="text-sage leading-relaxed space-y-3">
                <p>
                  <strong className="text-earth-dark">
                    Ride&apos;n&apos;Rest est un outil d&apos;aide à la planification à titre indicatif. Ce n&apos;est pas un
                    dispositif de navigation ni de sécurité.
                  </strong>{' '}
                  Les itinéraires, distances, dénivelés, temps estimés, points d&apos;intérêt et prévisions météo sont
                  fournis à titre informatif et peuvent comporter des imprécisions.
                </p>
                <p>
                  Vous restez seul responsable de vos déplacements : vérification de l&apos;itinéraire et des conditions,
                  respect du code de la route et de la réglementation locale, choix de votre équipement et évaluation des
                  risques. L&apos;éditeur ne saurait être tenu responsable d&apos;un incident survenu lors de
                  l&apos;utilisation d&apos;un itinéraire planifié avec le Service.
                </p>
              </div>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-[#4A7C44] uppercase tracking-wider mb-4">
                7. Données personnelles
              </h2>
              <p className="text-sage leading-relaxed">
                Le traitement de vos données personnelles est décrit dans notre{' '}
                <a href="/privacy" className="text-[#4A7C44] hover:underline font-medium">
                  politique de confidentialité
                </a>{' '}
                et nos{' '}
                <a href="/mentions-legales" className="text-[#4A7C44] hover:underline font-medium">
                  mentions légales
                </a>
                . Votre position GPS reste sur votre appareil et n&apos;est jamais transmise à nos serveurs.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-[#4A7C44] uppercase tracking-wider mb-4">
                8. Disponibilité et évolutions
              </h2>
              <p className="text-sage leading-relaxed">
                Le Service est fourni « en l&apos;état » et « selon disponibilité ». L&apos;éditeur s&apos;efforce
                d&apos;assurer sa disponibilité et son bon fonctionnement, sans garantie d&apos;absence d&apos;interruption
                ou d&apos;erreur, et peut faire évoluer, suspendre ou interrompre tout ou partie du Service.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-[#4A7C44] uppercase tracking-wider mb-4">
                9. Limitation de responsabilité
              </h2>
              <p className="text-sage leading-relaxed">
                Dans les limites autorisées par la loi, l&apos;éditeur ne saurait être tenu responsable des dommages
                indirects résultant de l&apos;utilisation ou de l&apos;impossibilité d&apos;utiliser le Service, ni des
                données fournies par des services tiers (cartographie, météo, points d&apos;intérêt, Strava).
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-[#4A7C44] uppercase tracking-wider mb-4">
                10. Résiliation
              </h2>
              <p className="text-sage leading-relaxed">
                Vous pouvez cesser d&apos;utiliser le Service et supprimer votre compte à tout moment. L&apos;éditeur peut
                suspendre ou résilier l&apos;accès en cas de manquement aux présentes CGU.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-[#4A7C44] uppercase tracking-wider mb-4">
                11. Droit applicable
              </h2>
              <p className="text-sage leading-relaxed">
                Les présentes CGU sont régies par le droit français. À défaut de résolution amiable, tout litige relève de
                la compétence des tribunaux français.
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
