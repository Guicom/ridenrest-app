export function Hero() {
  return (
    <section className="relative w-full h-[50vh] min-h-[280px] sm:min-h-[340px] md:min-h-[380px] flex items-center justify-center overflow-hidden">
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/45 to-black/65 z-10" />
        <div
          className="w-full h-full bg-cover bg-center animate-ken-burns"
          style={{ backgroundImage: "url('/images/hero.webp')" }}
        />
      </div>

      <div className="relative z-20 w-full max-w-[min(1400px,92vw)] px-4 sm:px-6 md:px-10 text-center text-white mt-6 sm:mt-10">
        <h1 className="text-4xl sm:text-5xl md:text-7xl lg:text-8xl font-light leading-[1.1] tracking-tight mb-6 sm:mb-8 uppercase [text-shadow:0_2px_8px_rgba(0,0,0,0.7),0_4px_20px_rgba(0,0,0,0.5)]">
          Trouves où dormir <br className="hidden md:block" /> le long de ta trace
        </h1>
        <p className="text-base sm:text-lg md:text-xl font-light mb-8 sm:mb-12 text-white max-w-3xl md:max-w-4xl lg:max-w-5xl mx-auto leading-relaxed px-2 sm:px-0 [text-shadow:0_1px_4px_rgba(0,0,0,0.8),0_2px_12px_rgba(0,0,0,0.6)]">
          L&apos;outil de navigation essentiel pour les cyclistes longue distance. Planifie tes nuits sans quitter ton itinéraire.
        </p>
      </div>
    </section>
  );
}
