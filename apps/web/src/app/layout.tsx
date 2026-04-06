import type { Metadata, Viewport } from "next";
import { Montserrat } from "next/font/google";
import PlausibleProvider from "next-plausible";
import "./globals.css";

const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Ride'n'Rest — Find accommodation along your route",
  description: "Plan your bikepacking adventure. Find hotels, hostels and camping along your GPX route.",
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
          src={`${process.env.NEXT_PUBLIC_PLAUSIBLE_HOST || "https://stats.ridenrest.app"}/js/script.outbound-links.pageview-props.tagged-events.js`}
          init={{ endpoint: `${process.env.NEXT_PUBLIC_PLAUSIBLE_HOST || "https://stats.ridenrest.app"}/api/event` }}
          scriptProps={{ "data-domain": process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN || "ridenrest.app" } as React.DetailedHTMLProps<React.ScriptHTMLAttributes<HTMLScriptElement>, HTMLScriptElement>}
        />
      </head>
      <body className="antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
