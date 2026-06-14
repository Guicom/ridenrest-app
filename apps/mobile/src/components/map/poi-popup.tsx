import { Marker, type CameraRef, type MapRef } from '@maplibre/maplibre-react-native';
import { BlurView } from 'expo-blur';
import * as Clipboard from 'expo-clipboard';
import { LAYER_CATEGORIES, type Poi } from '@ridenrest/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, View } from 'react-native';

import { PoiCard } from '@/components/shared/poi-card';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useNetworkStatus } from '@/hooks/use-network-status';
import { usePoiGoogleDetails, useReverseCity } from '@/hooks/use-pois';

// Fiche détail POI en **popin « liquid glass »** (MOB-4.2 / AC3, 4, 5 — refonte parité web
// `poi-popup.tsx`). Remplace l'ancien bottom sheet `@gorhom/bottom-sheet` (divergence
// validée par Guillaume le 2026-06-14 : rendu identique au web responsive, fond verre
// dépoli flottant ancré au pin, et non un tiroir blanc plein).
//
// Ancrage : `<Marker lngLat anchor="bottom" offset={[0,-gap]}>` (enfant du `<Map>`) → la
// fiche suit le pin **nativement** (pas de projection JS : `getPointInView` n'existe pas
// dans cette build MapLibre Native v11). Triangle pointeur sous la carte (vers le pin).
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
  /** Segment d'origine (requis pour l'enrichissement Google par `externalId`). */
  segmentId: string | null;
  onClose: () => void;
  /** Accès caméra (recentrage) — via `MapCanvasHandle`. */
  getCamera: () => CameraRef | null;
  /** Accès carte (projection) — recentrage à zoom préservé. Optionnel : repli sinon. */
  getMap?: () => MapRef | null;
}

export function PoiPopup({
  poi,
  segmentId,
  onClose,
  getCamera,
  getMap,
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

  const addressLine = details?.formattedAddress ?? null;
  const phone = details?.phone ?? null;
  const website = details?.website ?? null;

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
  if (!poi) return null;

  // Teinte verre theme-aware (parité web `--popup-glass`) + liseré spéculaire clair.
  const glassTint = isDark ? 'rgba(24,24,27,0.45)' : 'rgba(255,255,255,0.35)';
  const borderColor = isDark
    ? 'rgba(255,255,255,0.16)'
    : 'rgba(255,255,255,0.55)';
  const triangleColor = glassTint;

  return (
    <Marker
      // ⚠️ `id` CONSTANT (jamais dérivé de `poi.id`) : le `Marker` MapLibre **gèle** son
      // `id` au montage (`useFrozenId`) → le changer (sélection d'un autre POI sur le même
      // Marker monté) jette « `id` cannot be changed ». Il n'y a qu'une popin à la fois, et
      // `lngLat` (non gelé) se met à jour → la fiche se repositionne sur le nouveau pin.
      id="poi-popup"
      lngLat={[poi.lng, poi.lat]}
      anchor="bottom"
      offset={[0, -POPUP_PIN_GAP]}
    >
      <View style={{ width: POPUP_WIDTH }} className="items-center">
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
          />
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
    </Marker>
  );
}
