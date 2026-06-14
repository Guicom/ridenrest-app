import { POI_CATEGORY_COLORS, type Poi } from '@ridenrest/shared';
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Skeleton } from '@/components/ui/skeleton';
import {
  CheckIcon,
  CopyIcon,
  GlobeIcon,
  NavigationIcon,
  PhoneIcon,
  XIcon,
} from '@/components/ui/icon';
import { formatDistanceM, formatKm } from '@/lib/format/distance';
import { useTranslation } from '@/lib/i18n';

// Contenu de la fiche POI (MOB-4.2 / AC3, 4, T6 — refonte « liquid glass », parité web
// `poi-popup.tsx`). Présentationnel pur (zéro fetch) : **badge catégorie** (couleur
// canon) + fermeture, **nom** + action Naviguer, action Téléphone, **adresse** copiable,
// **distance/km**, enrichissement (ville) en skeleton scopé, slots booking/accès, et
// bouton **Site officiel**. Le conteneur verre (BlurView + liseré + triangle) et l'ancrage
// `Marker` vivent dans `poi-popup.tsx` ; les fetch d'enrichissement aussi.
//
// Enrichissement (AC4) : `city`/`addressLine` affichés en **skeleton scopé** tant que
// `enrichmentPending` — JAMAIS de skeleton sur la fiche entière. Indispo → bloc omis.
//
// **Slots d'extension** : `children` rend les blocs MOB-4.5 (`<BookingLinks/>`) et
// MOB-4.6 (`<AccessMetrics/>`), gatés hébergements côté appelant (parité web).

// Bouton d'action circulaire (Naviguer/Téléphone) — `primary-light` + icône `primary`.
const ACTION_BTN_CLASS =
  'h-9 w-9 items-center justify-center rounded-full bg-primary-light active:opacity-70';

export interface PoiCardProps {
  poi: Poi;
  /** Ville enrichie (`useReverseCity`) — hébergements. `null`/absent → omis. */
  city?: string | null;
  /** Adresse enrichie (Google) — `null`/absent → ligne adresse omise. */
  addressLine?: string | null;
  /** Téléphone (Google/OSM) — `null`/absent → bouton appeler omis. */
  phone?: string | null;
  /** Site web (Google/OSM) — `null`/absent → bouton site officiel omis. */
  website?: string | null;
  /** Enrichissement réseau en cours → skeleton scopé sur le bloc enrichi. */
  enrichmentPending?: boolean;
  /** Adresse copiée → bascule l'icône Copy→Check + le label (feedback). */
  addressCopied?: boolean;
  /** Slots booking (4.5) / accès (4.6). */
  children?: ReactNode;
  /** Fermeture (croix). */
  onClose?: () => void;
  /** Ouvre l'app de navigation vers le POI (Maps). */
  onNavigate?: () => void;
  /** Compose le téléphone (`tel:`). */
  onCall?: () => void;
  /** Copie l'adresse dans le presse-papiers. */
  onCopyAddress?: () => void;
  /** Ouvre le site web dans le navigateur. */
  onOpenWebsite?: () => void;
}

export function PoiCard({
  poi,
  city,
  addressLine,
  phone,
  website,
  enrichmentPending = false,
  addressCopied = false,
  children,
  onClose,
  onNavigate,
  onCall,
  onCopyAddress,
  onOpenWebsite,
}: PoiCardProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const categoryColor = POI_CATEGORY_COLORS[poi.category];

  return (
    <View className="gap-3 px-4 pb-4 pt-3">
      {/* En-tête : badge catégorie (couleur canon inline) + fermeture. */}
      <View className="flex-row items-start justify-between gap-2">
        <View
          className="self-start rounded-full px-2.5 py-1"
          style={{ backgroundColor: categoryColor }}
        >
          <Text className="text-xs font-montserrat-semibold uppercase text-white">
            {t(`pois.category.${poi.category}`)}
          </Text>
        </View>
        {onClose ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('pois.sheet.close')}
            onPress={onClose}
            className="h-9 w-9 items-center justify-center rounded-full active:bg-muted"
          >
            <XIcon size={20} className="text-text-muted" />
          </Pressable>
        ) : null}
      </View>

      {/* Nom + actions (Naviguer adjacent ; Téléphone à droite). */}
      <View className="flex-row items-center justify-between gap-2">
        <View className="min-w-0 flex-1 flex-row items-center gap-2">
          <Text
            numberOfLines={1}
            className="min-w-0 flex-1 text-lg font-montserrat-semibold text-text-primary"
          >
            {poi.name}
          </Text>
          {onNavigate ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('pois.actions.navigate', { name: poi.name })}
              onPress={onNavigate}
              className={ACTION_BTN_CLASS}
            >
              <NavigationIcon size={18} className="text-primary" />
            </Pressable>
          ) : null}
        </View>
        {phone && onCall ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('pois.actions.call', { name: poi.name })}
            onPress={onCall}
            className={ACTION_BTN_CLASS}
          >
            <PhoneIcon size={18} className="text-primary" />
          </Pressable>
        ) : null}
      </View>

      {/* Adresse copiable (icône Copy→Check) — skeleton scopé si enrichissement en cours. */}
      {enrichmentPending && !addressLine ? (
        <Skeleton className="h-4 w-56" testID="poi-address-skeleton" />
      ) : addressLine ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            addressCopied
              ? t('pois.actions.addressCopied')
              : t('pois.actions.copyAddress')
          }
          onPress={onCopyAddress}
          className="flex-row items-center gap-2 active:opacity-70"
        >
          <Text
            numberOfLines={2}
            className="min-w-0 flex-1 text-sm font-montserrat text-text-secondary"
          >
            {addressLine}
          </Text>
          {addressCopied ? (
            <CheckIcon size={16} className="text-primary" />
          ) : (
            <CopyIcon size={16} className="text-text-muted" />
          )}
        </Pressable>
      ) : null}


      {/* Distance trace + kilométrage (valeurs serveur — jamais recalculées). */}
      <View className="gap-1">
        <Text className="text-sm font-montserrat text-text-secondary">
          {t('pois.distanceFromTrace', {
            value: formatDistanceM(poi.distFromTraceM, locale),
          })}
        </Text>
        <Text className="text-sm font-montserrat text-text-secondary">
          {t('pois.kmMarker', { value: formatKm(poi.distAlongRouteKm, locale) })}
        </Text>
      </View>

      {/* Enrichissement ville (skeleton scopé, jamais bloquant). */}
      {enrichmentPending ? (
        <View className="gap-1.5" testID="poi-enrichment-skeleton">
          <Skeleton className="h-3.5 w-40" />
          <Skeleton className="h-3.5 w-24" />
        </View>
      ) : city ? (
        <Text className="text-sm font-montserrat text-text-muted">{city}</Text>
      ) : null}

      {/* Slots booking (MOB-4.5) / accès (MOB-4.6) — réservés. */}
      {children}

      {/* Site officiel (pleine largeur, contour). */}
      {website && onOpenWebsite ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('pois.actions.officialWebsite')}
          onPress={onOpenWebsite}
          className="h-11 flex-row items-center justify-center gap-1.5 rounded-full border border-border active:opacity-70"
        >
          <GlobeIcon size={16} className="text-text-primary" />
          <Text className="text-sm font-montserrat-medium text-text-primary">
            {t('pois.actions.officialWebsite')}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
