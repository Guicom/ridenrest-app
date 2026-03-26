import Image from 'next/image'
import { MarketingHeader } from './marketing-header'

export function AuthPageWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen flex flex-col">
      <Image
        src="/images/hero.webp"
        alt=""
        fill
        className="object-cover"
        priority
      />
      <div className="absolute inset-0 bg-black/50" />
      <MarketingHeader />
      <div className="relative z-10 flex flex-1 items-center justify-center p-4">
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm p-6 space-y-6">
          {children}
        </div>
      </div>
    </div>
  )
}
