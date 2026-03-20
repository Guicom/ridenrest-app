import type { Metadata } from "next";
import { Montserrat } from "next/font/google";
import "./globals.css";

const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Ride'n'Rest — Find accommodation along your route",
  description: "Plan your bikepacking adventure. Find hotels, hostels and camping along your GPX route.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className={montserrat.variable}>
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
