import { MarketingHeader } from '../_components/marketing-header';
import { MarketingFooter } from '../_components/marketing-footer';

export const metadata = {
  title: "Mentions légales — Ride'n'Rest",
};

export default function MentionsLegalesPage() {
  return (
    <div className="min-h-screen flex flex-col font-sans bg-earth-light text-earth-dark antialiased">
      <MarketingHeader />
      <main className="flex-grow">
        <article className="max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-16 md:py-24">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-light text-earth-dark uppercase tracking-tight mb-4">
            Mentions légales
          </h1>
          <p className="text-sage text-sm mb-12">
            Conformément aux dispositions des articles 6-III et 19 de la Loi n° 2004-575 du 21 juin 2004 pour la Confiance dans
            l&apos;économie numérique, dite L.C.E.N., les présentes mentions légales s&apos;appliquent au site Ride&apos;n&apos;Rest.
          </p>

          <div className="space-y-10 sm:space-y-12 text-earth-dark break-words">
            <section>
              <h2 className="text-xl font-semibold text-[#4A7C44] uppercase tracking-wider mb-4">
                1. Éditeur du site
              </h2>
              <p className="text-sage leading-relaxed">
                Le site Ride&apos;n&apos;Rest est édité par :<br />
                <strong className="text-earth-dark">Guillaume Essoltani</strong>
                <br />
                Auto-entrepreneur
                <br />
                1b rue des Aigles 67810 Holtzheim
                <br />
                80167874900012
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-[#4A7C44] uppercase tracking-wider mb-4">
                2. Directeur de la publication
              </h2>
              <p className="text-sage leading-relaxed">
                Le directeur de la publication est :{' '}
                <strong className="text-earth-dark">Guillaume Essoltani</strong>.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-[#4A7C44] uppercase tracking-wider mb-4">
                3. Hébergement
              </h2>
              <p className="text-sage leading-relaxed">
                Le site est hébergé par :<br />
                <strong className="text-earth-dark">Hostinger International Ltd.</strong>
                <br />
                61 Lordou Vironos Street
                <br />
                6023 Larnaca, Chypre
                <br />
                <a href="https://www.hostinger.com" target="_blank" rel="noopener noreferrer" className="text-[#4A7C44] hover:underline font-medium">
                  https://www.hostinger.com
                </a>
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-[#4A7C44] uppercase tracking-wider mb-4">
                4. Contact
              </h2>
              <p className="text-sage leading-relaxed">
                Pour toute question relative aux présentes mentions légales ou au site, vous pouvez nous contacter à :{' '}
                <a href="mailto:contact@ridenrest.com" className="text-[#4A7C44] hover:underline font-medium">
                  contact@ridenrest.com
                </a>
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-[#4A7C44] uppercase tracking-wider mb-4">
                5. Propriété intellectuelle
              </h2>
              <p className="text-sage leading-relaxed">
                L&apos;ensemble du contenu du site Ride&apos;n&apos;Rest (textes, images, graphismes, logo, icônes, etc.) est protégé
                par le droit d&apos;auteur et le droit des marques. Toute reproduction, représentation ou exploitation, totale ou
                partielle, sans autorisation préalable écrite de l&apos;éditeur est interdite et constitutive d&apos;une contrefaçon.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-[#4A7C44] uppercase tracking-wider mb-4">
                6. Données personnelles
              </h2>
              <p className="text-sage leading-relaxed">
                Les informations recueillies sur ce site sont enregistrées dans un fichier informatisé pour la gestion des demandes de
                contact et de la relation utilisateur. Conformément à la loi « informatique et libertés » et au RGPD, vous pouvez
                exercer votre droit d&apos;accès, de rectification, de suppression et de portabilité de vos données en nous contactant
                à l&apos;adresse indiquée ci-dessus.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-[#4A7C44] uppercase tracking-wider mb-4">
                7. Cookies
              </h2>
              <p className="text-sage leading-relaxed">
                Le site Ride&apos;n&apos;Rest peut être amené à utiliser des cookies pour le bon fonctionnement des services. Vous
                pouvez configurer votre navigateur pour refuser les cookies ou être informé de leur dépôt.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-[#4A7C44] uppercase tracking-wider mb-4">
                8. Limitation de responsabilité
              </h2>
              <p className="text-sage leading-relaxed">
                L&apos;éditeur s&apos;efforce d&apos;assurer l&apos;exactitude et la mise à jour des informations diffusées sur le
                site. Toutefois, l&apos;éditeur ne peut garantir l&apos;exactitude, la précision ou l&apos;exhaustivité des
                informations mises à disposition. En conséquence, l&apos;éditeur décline toute responsabilité pour toute imprécision ou
                omission portant sur des informations disponibles sur ce site.
              </p>
            </section>
          </div>

          <p className="mt-16 text-sage text-sm">Dernière mise à jour : mars 2026</p>
        </article>
      </main>
      <MarketingFooter />
    </div>
  );
}
