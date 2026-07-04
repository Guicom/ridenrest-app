import { type CameraRef, type MapRef } from '@maplibre/maplibre-react-native';
import { BlurView } from 'expo-blur';
import * as Clipboard from 'expo-clipboard';
import { LAYER_CATEGORIES, type Poi } from '@ridenrest/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, View, type LayoutChangeEvent } from 'react-native';

import { trackPoiDetailOpened, type UserTier } from '@ridenrest/analytics';

import { BookingLinks } from '@/components/shared/booking-links';
import { AccessMetrics } from '@/components/poi-access/access-metrics';
import { PoiCard } from '@/components/shared/poi-card';
import { DEFAULT_ACCESS_ORIGIN } from '@/lib/api/poi-access';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useNetworkStatus } from '@/hooks/use-network-status';
import { useProfile } from '@/hooks/use-profile';
import { usePoiGoogleDetails, useReverseCity } from '@/hooks/use-pois';
import { useSession } from '@/lib/auth/client';
import { extractCityFromOsmRawData } from '@/lib/external-links';

// Fiche détail POI en **popin « liquid glass »** (MOB-4.2 / AC3, 4, 5 — refonte parité web
// `poi-popup.tsx`). Remplace l'ancien bottom sheet `@gorhom/bottom-sheet` (divergence
// validée par Guillaume le 2026-06-14 : rendu identique au web responsive, fond verre
// dépoli flottant ancré au pin, et non un tiroir blanc plein).
//
// Ancrage : **overlay RN absolu** (PAS un `<Marker>`). ⚠️ Sur iOS, le `Marker` de
// `@maplibre/maplibre-react-native` passe par `ViewAnnotation`/`MLNPointAnnotation` qui rend
// les enfants **sur un bitmap non-interactif** (cf. source lib) → les boutons (variantes,
// booking, actions) ne reçoivent pas les taps de façon fiable et l'image ne se redessine pas
// au changement d'état (bug réel 2026-06-27). On rend donc la fiche comme une View RN
// **absolue** au-dessus de la carte, positionnée via `anchor` = `getMap().project([lng,lat])`
// (calculé par l'écran carte, qui la fait suivre le pin au pan/zoom). Tactile 100 % fiable.
// Triangle pointeur sous la fiche (vers le pin).
//
// Verre : `BlurView` (expo-blur, flou de fond natif) + tuile translucide + liseré clair +
// ombre portée. Contenu net par-dessus (PoiCard). Thème via `useColorScheme`.
//
// Enrichissement (AC4/AC5) : ville (`useReverseCity`, hébergements) + détails Google
// (`usePoiGoogleDetails`) en skeleton scopé, JAMAIS bloquant. **Désactivés hors-ligne**
// (args `null` → query disabled) → pas de skeleton `paused` infini (règle data mobile).
//
// Actions (parité web) : Naviguer (Maps), Téléphone (`tel:`), Site officiel (navigateur),
// Copier l'adresse (presse-papiers, feedback 2 s). Toutes via `Linking`/`Clipboard`.

const ACCOMMODATION_CATEGORIES = LAYER_CATEGORIES.accommodations;

// Largeur de la fiche (px) — proche du `w-80` web, contenue sur petit écran.
const POPUP_WIDTH = 288;
// Décalage vertical (px) : la fiche flotte juste au-dessus du pin (ancrage `bottom`).
const POPUP_PIN_GAP = 14;
// Décalage vertical (px) du pin sous le centre du viewport au recentrage (parité web
// `easeTo({ offset: [0, 100] })`) → le pin retombe dans la moitié basse, laissant la
// moitié haute à la fiche (qui s'étend vers le haut depuis le pin).
const RECENTER_OFFSET_Y = 150;
// Durée d'animation du recentrage caméra (parité web).
const RECENTER_MS = 300;
// Délai de feedback « adresse copiée » avant retour à l'icône Copy.
const COPY_FEEDBACK_MS = 2000;

export interface PoiPopupProps {
  poi: Poi | null;
  /**
   * Position écran (px) du pin, projetée par l'écran carte (`getMap().project([lng,lat])`)
   * et re-projetée au pan/zoom. `null` tant que la projection n'est pas dispo → fiche masquée.
   * Origine = coin haut-gauche de la carte (= racine plein écran) → coords absolues directes.
   */
  anchor: { x: number; y: number } | null;
  /** Segment d'origine (requis pour l'enrichissement Google par `externalId`). */
  segmentId: string | null;
  onClose: () => void;
  /** Accès caméra (recentrage) — via `MapCanvasHandle`. */
  getCamera: () => CameraRef | null;
  /** Accès carte (projection) — recentrage à zoom préservé. Optionnel : repli sinon. */
  getMap?: () => MapRef | null;
  /**
   * Variante d'accès sélectionnée (MOB-4.6 / T5-T6) — état **lifté à l'écran carte**
   * (`map/[id].tsx`) pour être partagé avec la polyline d'accès (MOB-4.7). Reset à 0
   * au changement de POI côté écran. Absent → la fiche affiche la meilleure variante.
   */
  selectedVariantIndex?: number;
  onSelectVariant?: (index: number) => void;
}

export function PoiPopup({
  poi,
  anchor,
  segmentId,
  onClose,
  getCamera,
  getMap,
  selectedVariantIndex,
  onSelectVariant,
}: PoiPopupProps) {
  const { isOnline } = useNetworkStatus();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';

  const isAccommodation = poi
    ? ACCOMMODATION_CATEGORIES.includes(poi.category)
    : false;

  // Enrichissement réseau — désactivé hors-ligne (args null → query disabled, AC5).
  const enrichEnabled = Boolean(poi) && isOnline;
  const { details, isPending: googlePending } = usePoiGoogleDetails(
    enrichEnabled ? (poi?.externalId ?? null) : null,
    enrichEnabled ? segmentId : null,
  );
  const { city, isPending: cityPending } = useReverseCity(
    enrichEnabled && isAccommodation && poi ? { lat: poi.lat, lng: poi.lng } : null,
  );

  // Tier pour l'analytics `booking_click` (MOB-4.5 / T4) — dérivé de la session, parité
  // web (`search-on-dropdown.tsx`). `'anonymous'` si non connecté ; `'free'` par défaut si
  // le profil n'expose pas encore de tier (MVP mobile). RGPD : aucune PII dans la prop.
  const { data: session } = useSession();
  const { data: profile } = useProfile(Boolean(session) && isAccommodation);
  const userTier: UserTier = session ? (profile?.tier ?? 'free') : 'anonymous';

  const addressLine = details?.formattedAddress ?? null;
  const phone = details?.phone ?? null;
  const website = details?.website ?? null;

  // Hauteur mesurée de la fiche (px) — pour ancrer son BAS (pointe du triangle) au pin :
  // `top = anchor.y - hauteur - gap`. Tant que non mesurée (0), la fiche est rendue invisible
  // (opacity 0) pour éviter un flash à la mauvaise position.
  const [cardHeight, setCardHeight] = useState(0);

  // Feedback copie (réinitialisé à chaque changement de POI).
  const [addressCopied, setAddressCopied] = useState(false);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearCopyTimeout = useCallback(() => {
    if (copyTimeoutRef.current !== null) {
      clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = null;
    }
  }, []);

  // Reset du feedback « copié » quand le POI change — pattern « ajuster l'état au
  // rendu » (React docs), pas un effet (évite `set-state-in-effect`). Le timer en cours
  // est annulé par l'effet de recentrage ci-dessous (clé `poiId`).
  const poiId = poi?.id ?? null;
  const [shownPoiId, setShownPoiId] = useState(poiId);
  if (poiId !== shownPoiId) {
    setShownPoiId(poiId);
    setAddressCopied(false);
  }

  // Recentre la fiche sur le pin dans la moitié basse du viewport (parité web).
  //
  // ⚠️ Bug corrigé : un `easeTo({ center, padding:{top:300}, duration })` SANS `zoom`
  // provoquait un **zoom-out intermittent** (le SDK natif recalcule le zoom pour faire
  // tenir le centre dans la zone non-paddée). Fix : on n'utilise PLUS `padding`. On lit
  // le **zoom courant** et on le passe **explicitement** (zoom préservé à l'identique),
  // et on décale le centre via **projection** (`project`/`unproject`) pour reproduire
  // l'`offset` web. Repli (projection indispo / pas de `getMap`) : `easeTo` sans `zoom`
  // conserve le zoom courant (doc MapLibre) et sans `padding` → aucun zoom-out.
  const recenterOnPoi = useCallback(
    async (target: Poi) => {
      const camera = getCamera();
      if (!camera) return;
      const map = getMap?.() ?? null;
      try {
        if (map?.getZoom && map.project && map.unproject) {
          const [zoom, pinPx] = await Promise.all([
            map.getZoom(),
            map.project([target.lng, target.lat]),
          ]);
          const center = await map.unproject([
            pinPx[0],
            pinPx[1] - RECENTER_OFFSET_Y,
          ]);
          camera.easeTo({ center, zoom, duration: RECENTER_MS });
          return;
        }
      } catch {
        // Projection indisponible selon build/plateforme → repli sans zoom-out.
      }
      camera.easeTo({ center: [target.lng, target.lat], duration: RECENTER_MS });
    },
    [getCamera, getMap],
  );

  // Recentrage + annulation du timer à chaque changement de POI (ouverture).
  useEffect(() => {
    clearCopyTimeout();
    if (!poi) return;
    void recenterOnPoi(poi);
  }, [poi, clearCopyTimeout, recenterOnPoi]);

  // Nettoyage du timer au démontage.
  useEffect(() => clearCopyTimeout, [clearCopyTimeout]);

  // Analytics `poi_detail_opened` (MOB-6.1 / T6, parité web poi-popup.tsx) — émis UNE fois
  // par POI ouvert. `source` mappé sur la taxonomie (`amadeus` → `google`). RGPD : aucune
  // coordonnée (que le type + la source). No-op tant que PostHog n'est pas injecté.
  useEffect(() => {
    if (!poi) return;
    trackPoiDetailOpened({
      poi_type: poi.category,
      source: poi.source === 'overpass' ? 'overpass' : 'google',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- émission unique par POI (clé = poiId)
  }, [poiId]);

  const handleNavigate = useCallback(() => {
    if (!poi) return;
    void Linking.openURL(
      `https://www.google.com/maps/dir/?api=1&destination=${poi.lat},${poi.lng}`,
    );
  }, [poi]);

  const handleCall = useCallback(() => {
    if (phone) void Linking.openURL(`tel:${phone}`);
  }, [phone]);

  const handleOpenWebsite = useCallback(() => {
    if (website) void Linking.openURL(website);
  }, [website]);

  const handleCopyAddress = useCallback(() => {
    if (!addressLine) return;
    void Clipboard.setStringAsync(addressLine)
      .then(() => {
        setAddressCopied(true);
        clearCopyTimeout();
        copyTimeoutRef.current = setTimeout(
          () => setAddressCopied(false),
          COPY_FEEDBACK_MS,
        );
      })
      .catch(() => {});
  }, [addressLine, clearCopyTimeout]);

  // Hooks ci-dessus appelés inconditionnellement (règles des hooks) → return après.
  // `anchor` null = projection pas encore dispo (style pas chargé / hors écran) → masqué.
  if (!poi || !anchor) return null;

  // Ville pour les liens Booking (MOB-4.5 / T2) — ordre de résolution parité web
  // (`poi-popup.tsx:162-166`) : reverseCity (Geoapify) > Google locality > OSM > null.
  // Réutilise les hooks d'enrichissement MOB-4.2 (aucun appel supplémentaire).
  const bookingCity =
    (city || null) ?? (details?.locality || null) ?? extractCityFromOsmRawData(poi.rawData).city;

  // Teinte verre theme-aware (parité web `--popup-glass`) + liseré spéculaire clair.
  const glassTint = isDark ? 'rgba(24,24,27,0.45)' : 'rgba(255,255,255,0.35)';
  const borderColor = isDark
    ? 'rgba(255,255,255,0.16)'
    : 'rgba(255,255,255,0.55)';
  const triangleColor = glassTint;

  return (
    // Overlay RN absolu (coords écran = projection du pin). `box-none` : les taps HORS de la
    // fiche traversent vers la carte ; les Pressables de la fiche, eux, reçoivent les taps
    // normalement (vraies vues RN → tactile fiable, contrairement au bitmap d'un Marker iOS).
    <View
      testID="poi-popup"
      pointerEvents="box-none"
      onLayout={(e: LayoutChangeEvent) => {
        const h = e.nativeEvent.layout.height;
        if (h > 0 && h !== cardHeight) setCardHeight(h);
      }}
      style={{
        position: 'absolute',
        width: POPUP_WIDTH,
        left: anchor.x - POPUP_WIDTH / 2,
        // Bas du bloc (pointe du triangle) ancré `POPUP_PIN_GAP` px au-dessus du pin.
        top: anchor.y - cardHeight - POPUP_PIN_GAP,
        // Masqué tant que la hauteur n'est pas mesurée (évite un flash mal placé).
        opacity: cardHeight > 0 ? 1 : 0,
      }}
      className="items-center"
    >
      <BlurView
        intensity={50}
        tint="systemChromeMaterial"
        style={{
          width: '100%',
          borderRadius: 20,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor,
          backgroundColor: glassTint,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 12 },
          shadowOpacity: 0.22,
          shadowRadius: 24,
          elevation: 12,
        }}
      >
        <PoiCard
          poi={poi}
          city={city}
          addressLine={addressLine}
          phone={phone}
          website={website}
          enrichmentPending={enrichEnabled && (googlePending || cityPending)}
          addressCopied={addressCopied}
          onClose={onClose}
          onNavigate={handleNavigate}
          onCall={handleCall}
          onCopyAddress={handleCopyAddress}
          onOpenWebsite={handleOpenWebsite}
        >
          {/* Slots hébergement uniquement (gate parité web) : accès (MOB-4.6) puis
              réservation (MOB-4.5). `key={poi.id}` réinitialise l'état interne au
              changement de POI. */}
          {isAccommodation ? (
            <>
              <AccessMetrics
                key={poi.id}
                poiId={poi.id}
                origin={DEFAULT_ACCESS_ORIGIN}
                category={poi.category}
                selectedVariantIndex={selectedVariantIndex}
                onSelectVariant={onSelectVariant}
              />
              <BookingLinks key={poi.id} poi={poi} city={bookingCity} userTier={userTier} />
            </>
          ) : null}
        </PoiCard>
      </BlurView>
      {/* Triangle pointeur vers le pin (teinte verre, coïncide avec la carte). */}
      <View
        style={{
          width: 0,
          height: 0,
          borderLeftWidth: 8,
          borderRightWidth: 8,
          borderTopWidth: 9,
          borderLeftColor: 'transparent',
          borderRightColor: 'transparent',
          borderTopColor: triangleColor,
        }}
      />
    </View>
  );
}
