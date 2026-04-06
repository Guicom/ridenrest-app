'use client';

import Image from 'next/image';
import { CheckCircle } from 'lucide-react';
import Link from 'next/link';
import { useSession } from '@/lib/auth/client';

export function FeatureStepThree() {
  const { data: session } = useSession();
  const isAuthenticated = !!session?.user;
  const ctaLabel = isAuthenticated ? 'Mes aventures' : 'Se connecter';

  return (
    <div id="concept" className="grid lg:grid-cols-12 min-h-0 lg:h-[60vh] lg:min-h-[500px] border-b border-earth-dark/5 bg-white">
      {/* Visual Side */}
      <div className="lg:col-span-7 relative min-h-[320px] sm:min-h-[380px] lg:min-h-0 lg:h-auto overflow-hidden bg-[#f7f9f8] flex items-center justify-center group order-2 lg:order-none">
        <div className="absolute inset-0 bg-[#4A7C44]/5 z-10 pointer-events-none" />
        <div className="w-full h-full flex items-center justify-center p-6 sm:p-8 lg:p-12 transition-transform duration-700 group-hover:scale-105">
            <Image
              src="/images/feature-step-three-phone.svg"
              alt="Écran app Ride'n'Rest - décide en roulant"
              width={360}
              height={560}
              className="block w-auto h-auto max-h-[360px] sm:max-h-[420px] lg:max-h-[500px] xl:max-h-[560px] max-w-full"
              unoptimized
            />
        </div>
      </div>

      {/* Content Side */}
      <div className="lg:col-span-5 flex flex-col justify-center p-6 sm:p-8 lg:p-20 bg-white order-1 lg:order-none">
        <div className="inline-flex items-center gap-4 text-marketing-yellow font-semibold text-[10px] uppercase tracking-[0.4em] mb-8">
          <span className="h-px w-10 bg-marketing-yellow" /> Étape 03
        </div>
        <h2 className="text-3xl sm:text-4xl lg:text-5xl font-light mb-6 sm:mb-8 leading-tight tracking-tight text-[#4A7C44] uppercase">
          Décide en roulant
        </h2>
        <p className="text-base sm:text-lg text-sage font-light mb-8 sm:mb-10 leading-relaxed break-words">
        Il est 15h, tu es en train de rouler et tu sais que tu peux rouler encore 3h ou 4h de plus. Utilise le mode live pour visualiser les options de logements disponibles en temps réel directement sur ton itinéraire et lance une recherche sur Booking ou Airbnb.
        </p>
        <div className="space-y-6">
          <div className="flex items-center gap-4 group cursor-default">
            <CheckCircle className="text-[#4A7C44]/60 group-hover:text-[#4A7C44] transition-colors shrink-0" size={24} strokeWidth={1.5} />
            <p className="text-[11px] font-semibold uppercase tracking-widest text-earth-dark group-hover:translate-x-1 transition-transform">
              Visualise les options de logements disponibles en temps réel directement sur ton itinéraire
            </p>
          </div>
          <div className="flex items-center gap-4 group cursor-default">
            <CheckCircle className="text-[#4A7C44]/60 group-hover:text-[#4A7C44] transition-colors shrink-0" size={24} strokeWidth={1.5} />
            <p className="text-[11px] font-semibold uppercase tracking-widest text-earth-dark group-hover:translate-x-1 transition-transform">
              Trouve un restaurant ou un point de ravitaillement
            </p>
          </div>
          <div className="flex items-center gap-4 group cursor-default">
            <CheckCircle className="text-[#4A7C44]/60 group-hover:text-[#4A7C44] transition-colors shrink-0" size={24} strokeWidth={1.5} />
            <p className="text-[11px] font-semibold uppercase tracking-widest text-earth-dark group-hover:translate-x-1 transition-transform">
              Regarde la météo étapes par étapes
            </p>
          </div>
        </div>
        <Link
              href="/adventures"
              className="mt-8 sm:mt-10 inline-flex items-center justify-center px-5 py-3 bg-[#4A7C44] text-white text-[10px] font-semibold tracking-[0.2em] uppercase rounded-lg hover:bg-[#3D6B39] transition-colors text-center w-fit self-center lg:self-start"
            >
              {ctaLabel}
            </Link>
      </div>
    </div>
  );
}
