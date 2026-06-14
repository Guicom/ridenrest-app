import { useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';

import { ChevronDownIcon } from '@/components/ui/icon';
import {
  buildAirbnbSearchUrl,
  buildBookingCoordUrl,
  buildBookingSearchUrl,
} from '@/lib/booking-url';
import { useTranslation } from '@/lib/i18n';

// Dropdown « Rechercher sur » (Booking.com / Airbnb) — port iso du web. Ouvre l'URL
// externe via `Linking.openURL` (pas d'analytics mobile). Désactivé sans centre de
// corridor. RGPD : `center` = centre de la **plage de recherche** (corridor), jamais
// la position GPS de l'utilisateur.

export interface SearchOnDropdownProps {
  center: { lat: number; lng: number } | null;
  city?: string | null;
  className?: string;
}

export function SearchOnDropdown({
  center,
  city,
  className,
}: SearchOnDropdownProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const bookingUrl = city
    ? buildBookingSearchUrl(city, center)
    : center
      ? buildBookingCoordUrl(center)
      : null;
  const airbnbUrl = center ? buildAirbnbSearchUrl(center) : null;
  const disabled = !center;

  const openUrl = (url: string) => {
    setOpen(false);
    void Linking.openURL(url).catch(() => {});
  };

  return (
    <View className={className}>
      <Pressable
        disabled={disabled}
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open, disabled }}
        accessibilityLabel={t('pois.search.searchOnA11y')}
        className={
          disabled
            ? 'h-11 flex-row items-center justify-center gap-1.5 rounded-lg border border-border opacity-40'
            : 'h-11 flex-row items-center justify-center gap-1.5 rounded-lg border border-border'
        }
      >
        <Text className="text-sm font-montserrat-medium text-text-primary">
          {t('pois.search.searchOn')}
        </Text>
        <ChevronDownIcon size={14} className="text-text-primary" />
      </Pressable>

      {open && center ? (
        <View
          accessibilityRole="menu"
          className="mt-1.5 gap-2 rounded-xl border border-border bg-card p-2"
        >
          {bookingUrl ? (
            <Pressable
              accessibilityRole="menuitem"
              onPress={() => openUrl(bookingUrl)}
              style={{ backgroundColor: '#003580' }}
              className="items-center rounded-lg px-3 py-2.5"
            >
              <Text className="text-sm font-montserrat-semibold text-white">
                {t('pois.search.bookingCom')}
              </Text>
            </Pressable>
          ) : null}
          {airbnbUrl ? (
            <Pressable
              accessibilityRole="menuitem"
              onPress={() => openUrl(airbnbUrl)}
              style={{ backgroundColor: '#FF5A5F' }}
              className="items-center rounded-lg px-3 py-2.5"
            >
              <Text className="text-sm font-montserrat-semibold text-white">
                {t('pois.search.airbnb')}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
