import { MarketingHeader } from '../_components/marketing-header';
import { MarketingFooter } from '../_components/marketing-footer';
import { ContactForm } from './_components/contact-form';

export const metadata = {
  title: "Contact — Ride'n'Rest",
};

export default function ContactPage() {
  return (
    <div className="min-h-screen flex flex-col font-sans bg-earth-light text-earth-dark antialiased">
      <MarketingHeader />
      <main className="flex-grow">
        <ContactForm />
      </main>
      <MarketingFooter />
    </div>
  );
}
