'use client';

import Image from 'next/image';
import { CheckCircle } from 'lucide-react';
import Link from 'next/link';
import { useSession } from '@/lib/auth/client';

export function FeatureStepTwo() {
  const { data: session } = useSession();
  const isAuthenticated = !!session?.user;
  const ctaLabel = isAuthenticated ? 'Mes aventures' : 'Se connecter';
  return (
    <div className="relative min-h-0 lg:h-[70vh] py-10 sm:py-14 lg:py-0 flex items-center overflow-hidden bg-[#b4c9b1]">
      <div className="mx-auto px-4 sm:px-6 lg:pl-6 lg:pr-0 relative z-10 w-full lg:h-full">
        <div className="grid lg:grid-cols-[0.85fr_1.15fr] gap-6 sm:gap-8 lg:gap-10 xl:gap-12 items-center lg:items-stretch lg:h-full">
          <div className="bg-white/95 backdrop-blur-md sm:border sm:border-white/40 sm:shadow-xl p-6 sm:p-8 lg:p-12 sm:border-l-4 sm:border-accent shrink-0 min-w-0 lg:self-center">
            <div className="inline-flex items-center gap-4 text-[#4A7C44] font-semibold text-[10px] uppercase tracking-[0.4em] mb-8">
              <span className="h-px w-10 bg-[#4A7C44]" /> Étape 02
            </div>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-light mb-6 sm:mb-8 leading-tight tracking-tight text-earth-dark uppercase">
              Prépare ton aventure
            </h2>
            <p className="text-base sm:text-lg text-sage font-light mb-8 sm:mb-10 leading-relaxed break-words">
              Sur ton ordinateur utilise le mode planning pour organiser ton aventure en créant des étapes et en cherchant les hébergements disponibles.
            </p>
            <div className="space-y-6">
              <div className="flex items-center gap-4 group cursor-default">
                <CheckCircle className="text-[#4A7C44]/60 group-hover:text-[#4A7C44] transition-colors shrink-0" size={24} strokeWidth={1.5} />
                <p className="text-[11px] font-semibold uppercase tracking-widest text-earth-dark group-hover:translate-x-1 transition-transform">
                  Visualise les hébergements disponibles
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
          <div className="flex justify-center lg:justify-end items-center lg:items-stretch w-full min-w-0 h-[50vh] sm:h-auto lg:h-full lg:py-6 lg:pr-6 overflow-hidden">
            <Image
              src="/images/feature-step-two-desktop.svg"
              alt="Interface Ride'n'Rest - visualisation des hébergements sur la trace"
              width={2537}
              height={1631}
              className="w-full h-auto lg:h-full max-w-full object-contain lg:object-right"
              unoptimized
            />
          </div>
        </div>
      </div>
    </div>
  );
}
