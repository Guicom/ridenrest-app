export function Testimonials() {
  return (
    <section className="py-14 sm:py-20 md:py-24 bg-earth-light" id="pour-qui">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6">
        <div className="mb-12 sm:mb-16 md:mb-20 text-center">
          <div className="inline-block px-4 py-1 border-y border-sage/30 mb-6">
            <p className="text-[9px] font-bold uppercase tracking-[0.5em] text-sage">La Communauté</p>
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-light text-[#4A7C44] tracking-tight uppercase">
            Pensé par des cyclistes
          </h2>
        </div>

        <div className="grid md:grid-cols-1 gap-8 md:gap-12">
          <div className="p-6 sm:p-8 md:p-10 bg-white border border-earth-dark/5 shadow-sm hover:shadow-xl hover:-translate-y-2 transition-all duration-300 group">
            <p className="text-sm sm:text-base text-sage font-light leading-relaxed italic break-words text-center">
              Ride&apos;n&apos;Rest est né d&apos;un besoin très simple : en longue distance ou en voyage, trouver un endroit pour dormir
              ne devrait pas être une source de stress. Au fur et à mesure que la journée progresse, que la fatigue s&apos;intensifie et
              que le vent prend les rênes, il te faut avant tout de la clarté.
              <br />
              L&apos;application a été conçue dans ce sens. Trouver rapidement un logement le long de ton itinéraire, sans faire de
              détours inutiles et sans multiplier les recherches. C&apos;est à toi de décider combien de chemin tu peux encore parcourir,
              d&apos;anticiper les alternatives qui s&apos;offrent à toi, et de faire ton choix en toute tranquillité.
              <br />
              Moins d&apos;incertitude, plus de sérénité. L&apos;essentiel pour continuer à avancer sans souci.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
