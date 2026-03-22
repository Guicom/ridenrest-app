import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: "Ride'n'Rest — Planifis tes nuits à vélo",
  description:
    "L'outil de navigation essentiel pour les cyclistes longue distance. Planifie tes nuits sans quitter ton itinéraire.",
  robots: { index: true, follow: true },
};

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
