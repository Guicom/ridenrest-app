import Image from 'next/image';

export function FeatureStepTwo() {
  return (
    <div className="relative min-h-0 md:min-h-[70vh] py-10 sm:py-14 md:py-20 flex items-center overflow-hidden bg-[#b4c9b1]">
      <div className="container mx-auto px-4 sm:px-6 relative z-10 w-full">
        <div className="grid md:grid-cols-[0.85fr_1.15fr] gap-6 sm:gap-8 md:gap-10 lg:gap-12 items-center">
          <div className="bg-white/95 backdrop-blur-md sm:border sm:border-white/40 sm:shadow-xl p-6 sm:p-8 md:p-12 sm:border-l-4 sm:border-accent shrink-0 min-w-0">
            <div className="inline-flex items-center gap-4 text-[#4A7C44] font-semibold text-[10px] uppercase tracking-[0.4em] mb-8">
              <span className="h-px w-10 bg-[#4A7C44]" /> Étape 02
            </div>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-light mb-6 sm:mb-8 leading-tight tracking-tight text-earth-dark uppercase">
              Décides en roulant
            </h2>
            <p className="text-base sm:text-lg text-sage font-light mb-8 sm:mb-10 leading-relaxed break-words">
              Il est 15h, tu es en train de rouler et tu sais que tu peux rouler encore 3h ou 4h de plus. Visualise les options de
              logements disponibles en temps réel directement sur ton itinéraire et modifie ta recherche selon le nombre d&apos;occupants,
              de chambres ou le style de lit.
              <br />
              Sélectionne l&apos;option qui te plaît, fais une réservation sur Booking en un clin d&apos;œil et poursuis ta route
              l&apos;esprit serein jusqu&apos;à la destination.
            </p>
          </div>
          <div className="flex justify-center md:justify-end items-center min-h-[50vh] sm:min-h-[320px] md:min-h-[450px] lg:min-h-[520px] w-full min-w-0">
            <Image
              src="/images/step2.gif"
              alt="Interface Ride'n'Rest - visualisation des hébergements sur la trace"
              width={640}
              height={480}
              className="max-w-full w-full md:w-auto md:max-w-[min(100%,640px)] h-auto max-h-[70vh] sm:max-h-[55vh] md:max-h-[70vh] lg:max-h-[80vh] rounded-xl sm:rounded-2xl sm:shadow-2xl sm:border sm:border-white/20 object-contain"
              unoptimized
            />
          </div>
        </div>
      </div>
    </div>
  );
}
