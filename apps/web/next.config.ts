import type { NextConfig } from "next";
import withPWA from "@ducanh2912/next-pwa";

const nextConfig: NextConfig = {
  output: "standalone",
};

export default withPWA({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  cacheStartUrl: false,
  dynamicStartUrl: false,
  // SW minimal pour story 12.1 — cache statique seulement, pas de tiles MapLibre (→ 12.2)
  workboxOptions: {
    skipWaiting: true,
    clientsClaim: true,
    // Exclude marketing/auth routes from precache — only (app)/* routes are precached
    exclude: [
      /^\/?$/,
      /\/login/,
      /\/register/,
      /\/forgot-password/,
      /\/reset-password/,
      /\/contact/,
      /\/mentions-legales/,
    ],
    runtimeCaching: [
      {
        urlPattern: /\.(js|css|png|jpg|jpeg|svg|woff2|ico)$/,
        handler: "CacheFirst",
        options: {
          cacheName: "static-assets-v2",
          expiration: { maxEntries: 60, maxAgeSeconds: 30 * 24 * 60 * 60 },
        },
      },
    ],
  },
})(nextConfig);
