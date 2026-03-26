'use client';

import { useForm, ValidationError } from '@formspree/react';

const FORMSPREE_ID = 'xlgwbojy';

const inputClass =
  'w-full px-4 py-3 bg-white border border-earth-dark/10 rounded-lg text-earth-dark placeholder-earth-dark/40 focus:outline-none focus:ring-2 focus:ring-[#4A7C44] focus:border-transparent transition-shadow';
const labelClass =
  'block text-[10px] font-semibold uppercase tracking-[0.2em] text-earth-dark mb-2';

export function ContactForm() {
  const [state, handleSubmit] = useForm(FORMSPREE_ID);

  if (state.succeeded) {
    return (
      <article className="max-w-2xl mx-auto px-4 sm:px-6 py-12 sm:py-16 md:py-24">
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-light text-earth-dark uppercase tracking-tight mb-4">
          Contact
        </h1>
        <p className="text-sage mb-12">
          Une question, un partenariat ou besoin d&apos;aide pour planifier tes nuits à vélo ? Envoyez-nous un message.
        </p>
        <div className="bg-[#4A7C44]/10 border border-[#4A7C44]/30 text-[#4A7C44] rounded-xl p-8 text-center">
          <p className="font-semibold uppercase tracking-wider mb-2">Message envoyé</p>
          <p className="text-sage text-sm">
            Merci pour votre message. Nous vous répondrons dans les meilleurs délais.
          </p>
        </div>
      </article>
    );
  }

  return (
    <article className="max-w-2xl mx-auto px-4 sm:px-6 py-12 sm:py-16 md:py-24">
      <h1 className="text-3xl sm:text-4xl md:text-5xl font-light text-earth-dark uppercase tracking-tight mb-4">
        Contact
      </h1>
      <p className="text-sage mb-12">
        Une question, un partenariat ou besoin d&apos;aide pour planifier tes nuits à vélo ? Envoyez-nous un message.
      </p>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label htmlFor="name" className={labelClass}>
            Nom
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            className={inputClass}
            placeholder="Votre nom"
          />
        </div>

        <div>
          <label htmlFor="email" className={labelClass}>
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            className={inputClass}
            placeholder="votre@email.fr"
          />
          <ValidationError
            prefix="Email"
            field="email"
            errors={state.errors}
            className="mt-1 text-sm text-red-600"
          />
        </div>

        <div>
          <label htmlFor="subject" className={labelClass}>
            Sujet
          </label>
          <select id="subject" name="subject" required className={inputClass}>
            <option value="">Choisir un sujet</option>
            <option value="question">Question sur le service</option>
            <option value="partenariat">Partenariat</option>
            <option value="bug">Signaler un problème</option>
            <option value="autre">Autre</option>
          </select>
        </div>

        <div>
          <label htmlFor="message" className={labelClass}>
            Message
          </label>
          <textarea
            id="message"
            name="message"
            required
            rows={5}
            className={`${inputClass} resize-y min-h-[120px]`}
            placeholder="Votre message..."
          />
          <ValidationError
            prefix="Message"
            field="message"
            errors={state.errors}
            className="mt-1 text-sm text-red-600"
          />
        </div>

        <button
          type="submit"
          disabled={state.submitting}
          className="w-full md:w-auto px-10 py-4 bg-[#4A7C44] text-white font-semibold text-[10px] uppercase tracking-[0.2em] rounded-lg hover:bg-earth-dark transition-colors focus:outline-none focus:ring-2 focus:ring-[#4A7C44] focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {state.submitting ? 'Envoi...' : 'Envoyer'}
        </button>
      </form>
    </article>
  );
}
