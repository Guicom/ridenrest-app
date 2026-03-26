import Link from 'next/link';

export function MarketingFooter() {
  return (
    <footer className="py-10 sm:py-12 md:py-16 bg-earth-dark text-earth-light border-t border-white/5">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8 md:gap-10 border-b border-white/5 pb-10 md:pb-16">
          <div className="flex items-center gap-4">
            <span className="text-xl font-medium uppercase tracking-tight text-white">
              Ride&apos;n&apos;Rest
            </span>
          </div>
          <div className="flex flex-wrap gap-x-8 gap-y-3 sm:gap-x-10 sm:gap-y-4 text-[10px] font-semibold uppercase tracking-[0.2em]">
            <Link
              href="/contact"
              className="hover:text-accent transition-colors hover:underline decoration-accent underline-offset-4"
            >
              Contact
            </Link>
            <Link
              href="/mentions-legales"
              className="hover:text-accent transition-colors hover:underline decoration-accent underline-offset-4"
            >
              Mentions légales
            </Link>
          </div>
        </div>
        <div className="mt-10 flex flex-col md:flex-row justify-between items-center gap-4">
          <span className="text-[10px] font-medium text-earth-light/30 uppercase tracking-[0.2em]">
            Ride&apos;n&apos;Rest © 2026
          </span>
          <span className="text-[10px] font-medium text-earth-light/30 uppercase tracking-[0.2em]">
            Fabriqué pour l&apos;aventure
          </span>
        </div>
      </div>
    </footer>
  );
}
