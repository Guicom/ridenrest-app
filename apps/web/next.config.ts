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
  fallbacks: {
    document: "/offline.html",
  },
  workboxOptions: {
    skipWaiting: true,
    clientsClaim: true,
    // Exclude marketing/auth routes from precache — only (app)/* routes are precached
    exclude: [
      /^\/?$/,
      /^\/login(\/|$)/,
      /^\/register(\/|$)/,
      /^\/forgot-password(\/|$)/,
      /^\/reset-password(\/|$)/,
      /^\/contact(\/|$)/,
      /^\/mentions-legales(\/|$)/,
    ],
    runtimeCaching: [
      // ── Plausible analytics — never cache ──
      // Note: patterns without ^ anchor — Workbox matches against full URL, not pathname
      {
        urlPattern: /\/js\/script.*\.js$/,
        handler: "NetworkOnly",
      },
      {
        urlPattern: /\/api\/event$/,
        handler: "NetworkOnly",
      },
      // ── OpenFreeMap tiles (PBF vector tiles) — SWR for offline map ──
      {
        urlPattern:
          /^https:\/\/tiles\.openfreemap\.org\/.*\.(pbf|png|jpg)(\?.*)?$/,
        handler: "StaleWhileRevalidate",
        options: {
          cacheName: "map-tiles-v1",
          expiration: {
            maxEntries: 2000,
            maxAgeSeconds: 7 * 24 * 60 * 60,
          },
        },
      },
      // ── OpenFreeMap style JSON ──
      {
        urlPattern: /^https:\/\/tiles\.openfreemap\.org\/styles\/.*/,
        handler: "StaleWhileRevalidate",
        options: {
          cacheName: "map-styles-v1",
          expiration: {
            maxEntries: 10,
            maxAgeSeconds: 7 * 24 * 60 * 60,
          },
        },
      },
      // ── API: adventure map data (GPX trace + segments) — network-first with offline fallback ──
      {
        urlPattern: /\/api\/adventures\/[^/]+\/map(\?.*)?$/,
        handler: "NetworkFirst",
        options: {
          cacheName: "adventure-map-data-v1",
          expiration: {
            maxEntries: 20,
            maxAgeSeconds: 24 * 60 * 60,
          },
        },
      },
      // ── API: POI search results ──
      {
        urlPattern: /\/api\/pois(\?.*)?$/,
        handler: "NetworkFirst",
        options: {
          cacheName: "poi-data-v1",
          expiration: {
            maxEntries: 50,
            maxAgeSeconds: 24 * 60 * 60,
          },
        },
      },
      // ── API: adventure stages ──
      {
        urlPattern: /\/api\/adventures\/[^/]+\/stages(\?.*)?$/,
        handler: "NetworkFirst",
        options: {
          cacheName: "stage-data-v1",
          expiration: {
            maxEntries: 20,
            maxAgeSeconds: 24 * 60 * 60,
          },
        },
      },
      // ── API: weather data (short TTL) ──
      {
        urlPattern: /\/api\/weather(\?.*)?$/,
        handler: "NetworkFirst",
        options: {
          cacheName: "weather-data-v1",
          expiration: {
            maxEntries: 30,
            maxAgeSeconds: 60 * 60,
          },
        },
      },
      // ── Static assets (JS/CSS/fonts/images) — cache-first ──
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
