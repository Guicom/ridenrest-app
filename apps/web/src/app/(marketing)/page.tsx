import { MarketingHeader } from './_components/marketing-header';
import { Hero } from './_components/hero';
import { FeatureStepOne } from './_components/feature-step-one';
import { FeatureStepTwo } from './_components/feature-step-two';
import { Testimonials } from './_components/testimonials';
import { MarketingFooter } from './_components/marketing-footer';

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col font-sans bg-earth-light text-earth-dark antialiased">
      <MarketingHeader />
      <main className="flex-grow">
        <Hero />
        <FeatureStepOne />
        <FeatureStepTwo />
        <Testimonials />
      </main>
      <MarketingFooter />
    </div>
  );
}
