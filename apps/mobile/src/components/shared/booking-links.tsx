import { trackBookingClick, type UserTier } from '@ridenrest/analytics';
import type { Poi } from '@ridenrest/shared';
import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import {
  ChevronDownIcon,
  ChevronUpIcon,
  ExternalLinkIcon,
} from '@/components/ui/icon';
import {
  buildAirbnbSearchUrl,
  buildBookingCoordUrl,
  buildBookingSearchUrl,
  openExternalUrl,
} from '@/lib/external-links';
import { useTranslation } from '@/lib/i18n';

// Bloc deep links de réservation (MOB-4.5 / AC1, 2, 3) — slot **hébergements** de la fiche
// détail (`poi-popup.tsx` ne le monte que si `poi.category ∈ accommodations`, parité web).
//
// UX **parité web** (`search-on-dropdown.tsx`, variant `action`) : un **seul CTA**
// « Rechercher sur » (bouton brand vert plein) qui **déploie** au press un menu avec deux
// entrées — **Booking.com** (`#003580`) + **Airbnb** (`#FF5A5F`), couleurs de marque **inline**.
// Liens de **recherche publics** — aucun identifiant affilié (parité web, décision produit).
//
// Au press d'une entrée : `trackBookingClick` (try/catch — non bloquant, no-op safe avant
// l'injection PostHog RN en MOB-6.1) **puis** `openExternalUrl`. Un échec d'ouverture
// affiche un message i18n inline (AC2). Le tracking n'empêche jamais l'ouverture (AC3).

// Couleurs de marque (parité web) — inline obligatoire (jamais Tailwind JIT).
const BOOKING_BRAND = '#003580';
const AIRBNB_BRAND = '#FF5A5F';

// Le menu s'ouvre en **overlay absolu au-dessus** du CTA (parité web `bottom-full`) → la
// fiche ne s'agrandit pas à l'ouverture. Décalage = hauteur du CTA (h-11 = 44) + gap.
const TRIGGER_HEIGHT = 44;
const MENU_GAP = 6;

type BookingSource = 'booking.com' | 'airbnb';

export interface BookingLinksProps {
  poi: Poi;
  /** Ville résolue (reverseCity > Google locality > OSM) — `null` → fallback coordonnées. */
  city: string | null;
  /** Tier dérivé de la session (`'anonymous'` si non connecté). */
  userTier: UserTier;
  /** Contexte analytics (`'map'` en planification). */
  page?: 'map' | 'live';
}

export function BookingLinks({
  poi,
  city,
  userTier,
  page = 'map',
}: BookingLinksProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [openFailed, setOpenFailed] = useState(false);

  const center = { lat: poi.lat, lng: poi.lng };
  const bookingUrl = city
    ? buildBookingSearchUrl(city, center)
    : buildBookingCoordUrl(center);
  const airbnbUrl = buildAirbnbSearchUrl(center);

  const handlePress = useCallback(
    (source: BookingSource, url: string) => {
      // Tracking non bloquant (AC3) : un client analytics défaillant ne doit JAMAIS
      // empêcher l'ouverture du lien. `trackBookingClick` est no-op safe tant que le
      // transport PostHog RN n'est pas injecté (MOB-6.1).
      try {
        trackBookingClick({
          source,
          poi_type: poi.category,
          page,
          user_tier: userTier,
        });
      } catch {
        // Émission analytics best-effort — ignorée.
      }
      setOpen(false);
      setOpenFailed(false);
      void openExternalUrl(url).then((res) => {
        if (!res.ok) setOpenFailed(true);
      });
    },
    [poi.category, page, userTier],
  );

  return (
    // `relative` : ancre l'overlay absolu du menu sur ce conteneur (le CTA seul occupe le flux).
    <View className="relative gap-2">
      {/* CTA unique « Rechercher sur » (brand) → toggle du menu (parité web variant action). */}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={t('pois.booking.triggerA11y')}
        onPress={() => setOpen((v) => !v)}
        className="h-11 flex-row items-center justify-center gap-1.5 rounded-full bg-primary active:opacity-80"
      >
        <Text className="text-sm font-montserrat-semibold uppercase text-primary-foreground">
          {t('pois.booking.searchOn')}
        </Text>
        {open ? (
          <ChevronUpIcon size={16} className="text-primary-foreground" />
        ) : (
          <ChevronDownIcon size={16} className="text-primary-foreground" />
        )}
      </Pressable>

      {open ? (
        // Overlay absolu **au-dessus** du CTA (`bottom: hauteur CTA + gap`) → n'agrandit pas
        // la fiche. Fond opaque (`bg-card`) + liseré + ombre pour rester lisible par-dessus
        // le contenu de la fiche. z élevé pour passer devant les actions de la fiche.
        <View
          className="absolute left-0 right-0 z-50 gap-2 rounded-xl border border-border bg-card p-2 shadow-lg"
          style={{ bottom: TRIGGER_HEIGHT + MENU_GAP }}
        >
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={t('pois.booking.bookingA11y')}
            onPress={() => handlePress('booking.com', bookingUrl)}
            style={{ backgroundColor: BOOKING_BRAND }}
            className="h-11 flex-row items-center justify-center gap-1.5 rounded-full active:opacity-80"
          >
            <ExternalLinkIcon size={16} className="text-white" />
            <Text className="text-sm font-montserrat-semibold text-white">
              {t('pois.booking.bookingCom')}
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="link"
            accessibilityLabel={t('pois.booking.airbnbA11y')}
            onPress={() => handlePress('airbnb', airbnbUrl)}
            style={{ backgroundColor: AIRBNB_BRAND }}
            className="h-11 flex-row items-center justify-center gap-1.5 rounded-full active:opacity-80"
          >
            <ExternalLinkIcon size={16} className="text-white" />
            <Text className="text-sm font-montserrat-semibold text-white">
              {t('pois.booking.airbnb')}
            </Text>
          </Pressable>

        </View>
      ) : null}

      {/* Échec d'ouverture (Linking rejette) — message inline, jamais de crash (AC2). */}
      {openFailed ? (
        <Text className="text-center text-xs font-montserrat text-destructive">
          {t('pois.booking.openFailed')}
        </Text>
      ) : null}
    </View>
  );
}
