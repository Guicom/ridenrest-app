import Image from 'next/image';
import { CheckCircle } from 'lucide-react';

export function FeatureStepOne() {
  return (
    <div id="concept" className="grid md:grid-cols-12 min-h-0 md:h-[60vh] md:min-h-[500px] border-b border-earth-dark/5 bg-white">
      {/* Visual Side */}
      <div className="md:col-span-7 relative min-h-[320px] sm:min-h-[380px] md:min-h-0 md:h-auto overflow-hidden bg-[#f7f9f8] flex items-center justify-center group order-2 md:order-none">
        <div className="absolute inset-0 bg-[#4A7C44]/5 z-10 pointer-events-none" />
        <div className="w-full h-full flex items-center justify-center p-6 sm:p-8 md:p-12 transition-transform duration-700 group-hover:scale-105">
          <div className="inline-block rounded-[2rem] sm:rounded-[2.5rem] shadow-2xl ring-4 sm:ring-[6px] ring-earth-dark bg-white overflow-hidden max-w-full">
            <Image
              src="/images/feature-step-one-phone.svg"
              alt="Écran app Ride'n'Rest - dépôt GPX"
              width={300}
              height={460}
              className="block w-auto h-auto max-h-[320px] sm:max-h-[380px] md:max-h-[420px] lg:max-h-[460px] max-w-full"
              unoptimized
            />
          </div>
        </div>
      </div>

      {/* Content Side */}
      <div className="md:col-span-5 flex flex-col justify-center p-6 sm:p-8 md:p-20 bg-white order-1 md:order-none">
        <div className="inline-flex items-center gap-4 text-marketing-yellow font-semibold text-[10px] uppercase tracking-[0.4em] mb-8">
          <span className="h-px w-10 bg-marketing-yellow" /> Étape 01
        </div>
        <h2 className="text-3xl sm:text-4xl md:text-5xl font-light mb-6 sm:mb-8 leading-tight tracking-tight text-[#4A7C44] uppercase">
          Créé ton <br /> aventure
        </h2>
        <p className="text-base sm:text-lg text-sage font-light mb-8 sm:mb-10 leading-relaxed break-words">
          Importe ta trace GPX en un clic, depuis le site internet ou l&apos;application Ride&apos;n&apos;Rest et créé ton aventure.
        </p>
        <div className="space-y-6">
          <div className="flex items-center gap-4 group cursor-default">
            <CheckCircle className="text-[#4A7C44]/60 group-hover:text-[#4A7C44] transition-colors shrink-0" size={24} strokeWidth={1.5} />
            <p className="text-[11px] font-semibold uppercase tracking-widest text-earth-dark group-hover:translate-x-1 transition-transform">
              Compatible Strava
            </p>
          </div>
          <div className="flex items-center gap-4 group cursor-default">
            <CheckCircle className="text-[#4A7C44]/60 group-hover:text-[#4A7C44] transition-colors shrink-0" size={24} strokeWidth={1.5} />
            <p className="text-[11px] font-semibold uppercase tracking-widest text-earth-dark group-hover:translate-x-1 transition-transform">
              Analyse de relief instantanée
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
