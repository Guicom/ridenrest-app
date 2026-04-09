import type { Metadata, Viewport } from "next";
import { Montserrat } from "next/font/google";
import PlausibleProvider from "next-plausible";
import "./globals.css";

const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Ride'n'Rest — Planifis tes nuits à vélo",
  description:
    "L'outil de navigation essentiel pour les cyclistes longue distance. Planifie tes nuits sans quitter ton itinéraire.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover", // Required for iOS safe-area-inset support in standalone mode
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className={montserrat.variable}>
      <head>
        <PlausibleProvider
          src="/js/script.outbound-links.pageview-props.tagged-events.js"
          init={{ endpoint: "/api/event" }}
          scriptProps={{ "data-domain": process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN || "ridenrest.app" } as React.DetailedHTMLProps<React.ScriptHTMLAttributes<HTMLScriptElement>, HTMLScriptElement>}
        />
      </head>
      <body className="antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
