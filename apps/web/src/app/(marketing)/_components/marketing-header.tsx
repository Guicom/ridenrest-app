'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Logo } from '@/components/ui/logo';
import { Skeleton } from '@/components/ui/skeleton';
import { useSession } from '@/lib/auth/client';

const navLinkClass =
  'text-[10px] font-semibold tracking-[0.2em] uppercase hover:text-[#4A7C44] transition-colors relative after:content-[\'\'] after:absolute after:w-full after:scale-x-0 after:h-0.5 after:bottom-[-4px] after:left-0 after:bg-[#4A7C44] after:origin-bottom-right after:transition-transform after:duration-300 hover:after:scale-x-100 hover:after:origin-bottom-left block py-2 md:py-0';

export function MarketingHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { data: session, isPending } = useSession();
  const isAuthenticated = !!session?.user;
  const ctaLabel = isAuthenticated ? 'Mes aventures' : 'Se connecter';

  return (
    <header className="sticky top-0 z-50 w-full bg-earth-light/95 backdrop-blur-md border-b border-earth-dark/5">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 h-16 sm:h-20 flex items-center justify-between">
        <Link
          href="/"
          className="flex items-center h-10 sm:h-12 max-w-[200px] sm:max-w-none cursor-pointer group transition-transform duration-300 hover:scale-105 shrink-0"
        >
          <Logo className="h-full w-auto" />
        </Link>

        <nav className="hidden md:flex items-center gap-10">
          <Link className={navLinkClass} href="/#concept">
            Le Concept
          </Link>
          <Link className={navLinkClass} href="/#pour-qui">
            Pour qui?
          </Link>
          {isPending ? (
            <Skeleton data-testid="cta-skeleton" className="h-9 w-28 rounded-lg" />
          ) : (
            <Link
              href="/adventures"
              className="px-5 py-2 bg-[#4A7C44] text-white text-[10px] font-semibold tracking-[0.2em] uppercase rounded-lg hover:bg-[#3D6B39] transition-colors focus:outline-none focus:ring-2 focus:ring-[#4A7C44]/40"
            >
              {ctaLabel}
            </Link>
          )}
        </nav>

        {/* Mobile menu button */}
        <button
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          className="md:hidden p-2 rounded-lg text-earth-dark hover:bg-earth-dark/5 focus:outline-none focus:ring-2 focus:ring-[#4A7C44]/30"
          aria-expanded={menuOpen}
          aria-label="Menu"
        >
          <span className="sr-only">{menuOpen ? 'Fermer' : 'Ouvrir'} le menu</span>
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            {menuOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>

      {/* Mobile menu panel */}
      <div
        className={`md:hidden overflow-hidden transition-[max-height] duration-300 ease-out ${
          menuOpen ? 'max-h-52' : 'max-h-0'
        }`}
      >
        <nav className="px-4 sm:px-6 pb-4 pt-2 border-t border-earth-dark/5 bg-earth-light flex flex-col gap-1">
          <Link className={navLinkClass} href="/#concept" onClick={() => setMenuOpen(false)}>
            Le Concept
          </Link>
          <Link className={navLinkClass} href="/#pour-qui" onClick={() => setMenuOpen(false)}>
            Pour qui?
          </Link>
          {isPending ? (
            <Skeleton data-testid="cta-skeleton" className="mt-2 h-11 w-full rounded-lg" />
          ) : (
            <Link
              href="/adventures"
              onClick={() => setMenuOpen(false)}
              className="mt-2 px-5 py-3 bg-[#4A7C44] text-white text-[10px] font-semibold tracking-[0.2em] uppercase rounded-lg hover:bg-[#3D6B39] transition-colors text-center"
            >
              {ctaLabel}
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
