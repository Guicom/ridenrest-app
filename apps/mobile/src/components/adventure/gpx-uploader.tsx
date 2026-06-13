import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { Text, View } from 'react-native';
import {
  MAX_GPX_FILE_SIZE_BYTES,
  type AdventureSegmentResponse,
} from '@ridenrest/shared';

import { Button } from '@/components/ui/button';
import { ErrorBanner } from '@/components/ui/error-banner';
import { UploadIcon } from '@/components/ui/icon';
import { useUploadSegment } from '@/hooks/use-segments';
import { useTranslation } from '@/lib/i18n';

// Uploader de segment GPX (MOB-3.2 / AC1, AC3). Sélection via `expo-document-picker`
// → validation client (extension `.gpx` + taille ≤ 10 Mo, belt-and-suspenders : le
// serveur revalide) → upload multipart via `useUploadSegment`.
//
// - Indicateur de progression = état INDÉTERMINÉ (`Button loading` →
//   `ActivityIndicator`, `accessibilityState.busy`) pendant le POST. `fetch` RN
//   n'expose pas de callback de progression d'upload → progression déterministe =
//   amélioration ultérieure (expo-file-system `UploadTask`). JAMAIS d'overlay plein
//   écran (archi §Loading states).
// - `result.canceled` → no-op silencieux (AC1).
// - Erreurs (extension/taille → client ; réseau/serveur → ApiError) affichées
//   inline via `<ErrorBanner />`, jamais `Alert.alert`.
// - `ref.pick()` : déclenche le picker depuis l'extérieur (flux « Réessayer », AC3).

// MIME permissif : iOS/Android ne déclarent pas tous l'UTI `application/gpx+xml`.
// On valide l'extension `.gpx` côté client après sélection (gotcha type MIME).
const PICKER_TYPES = [
  'application/gpx+xml',
  'application/xml',
  'application/octet-stream',
  '*/*',
];
const GPX_MIME = 'application/gpx+xml';

export interface GpxUploaderProps {
  adventureId: string;
  /** Appelé au succès de l'upload (ex. fermer un flux « Réessayer »). */
  onUploaded?: (segment: AdventureSegmentResponse) => void;
}

/** Handle impératif : déclenche le picker depuis l'extérieur (flux « Réessayer », AC3). */
export interface GpxUploaderHandle {
  pick: () => void;
}

export const GpxUploader = forwardRef<GpxUploaderHandle, GpxUploaderProps>(
  function GpxUploader({ adventureId, onUploaded }, ref) {
    const { t } = useTranslation();
    const upload = useUploadSegment(adventureId);
    // Erreur de validation CLIENT (extension/taille) — distincte de l'erreur
    // réseau (`upload.error`). Réinitialisée à chaque nouvelle tentative.
    const [validationError, setValidationError] = useState<string | null>(null);
    // État picker ouvert : pilote le libellé `picking` + le `loading` du bouton
    // PENDANT la sélection (avant que `upload.isPending` ne prenne le relais).
    const [picking, setPicking] = useState(false);
    // Garde de ré-entrance SYNCHRONE : `handlePress` est async, donc `upload.isPending`
    // ne passe `true` qu'APRÈS la résolution du picker → le bouton reste pressable
    // pendant l'ouverture (double-press → 2 pickers). Et `ref.pick()` (retry) contourne
    // le bouton désactivé. Un flag ref bloque les deux sans attendre un rerender.
    const busyRef = useRef(false);

    const handlePress = useCallback(async () => {
      // Court-circuit si un picker est déjà ouvert ou un upload est en cours
      // (évite pickers/uploads concurrents — double-press et retry mid-upload).
      if (busyRef.current || upload.isPending) return;
      busyRef.current = true;
      setPicking(true);
      setValidationError(null);
      upload.reset();

      // try/catch : `getDocumentAsync` / `new File(uri)` peuvent lever → sinon l'UI
      // reste sans feedback (patch MOB-2.2). NB : `upload.mutate` (≠ `mutateAsync`)
      // ne rejette JAMAIS — les erreurs réseau/serveur sont portées par
      // `upload.isError` (ErrorBanner dédié ci-dessous), pas par ce catch.
      try {
        const result = await DocumentPicker.getDocumentAsync({
          type: PICKER_TYPES,
          copyToCacheDirectory: true,
          multiple: false,
        });

        if (result.canceled) return; // AC1 : annulation = no-op silencieux.
        const asset = result.assets?.[0];
        if (!asset) return;

        // Validation extension `.gpx` (le MIME n'est pas fiable cross-plateforme).
        if (!asset.name.toLowerCase().endsWith('.gpx')) {
          setValidationError(t('adventures.segments.invalidExtension'));
          return;
        }

        // Validation taille AVANT tout réseau (parité web AC7). `asset.size` peut
        // être absent → fallback `File(uri).size` (API SDK 56).
        const size = asset.size ?? new File(asset.uri).size ?? null;
        if (size != null && size > MAX_GPX_FILE_SIZE_BYTES) {
          setValidationError(t('adventures.segments.fileTooLarge'));
          return;
        }

        upload.mutate(
          { file: { uri: asset.uri, name: asset.name, type: GPX_MIME } },
          { onSuccess: (segment) => onUploaded?.(segment) },
        );
      } catch {
        // Échec inattendu du picker / lecture taille → feedback générique inline.
        setValidationError(t('adventures.segments.uploadError'));
      } finally {
        busyRef.current = false;
        setPicking(false);
      }
    }, [t, upload, onUploaded]);

    useImperativeHandle(ref, () => ({ pick: handlePress }), [handlePress]);

    return (
      <View className="gap-2">
        {/* Style copié à l'identique du web (adventure-detail.tsx) : variant ghost,
            pill (rounded-full), padding px-6 py-6, fond VERT clair (bg-primary/10),
            texte/icône verts. `h-auto` → c'est le padding qui dicte la hauteur. */}
        <Button
          variant="ghost"
          className="h-auto rounded-full bg-primary/10 px-6 py-6 active:bg-primary/20"
          textClassName="text-base text-primary"
          // Libellé (utilisé pour l'état `loading` : le spinner remplace l'icône).
          label={
            upload.isPending
              ? t('adventures.segments.uploading')
              : t('adventures.segments.picking')
          }
          loading={upload.isPending || picking}
          onPress={handlePress}
        >
          {/* Au repos : icône upload + libellé (parité web mobile « Ajouter un
              segment »). En chargement, `children` est `undefined` → le Button
              affiche son `ActivityIndicator` + `label`. */}
          {upload.isPending || picking ? undefined : (
            <View className="flex-row items-center gap-2">
              <UploadIcon size={18} className="text-primary" />
              <Text className="text-base font-montserrat-semibold text-primary">
                {t('adventures.segments.addButton')}
              </Text>
            </View>
          )}
        </Button>
        {validationError ? <ErrorBanner message={validationError} /> : null}
        {upload.isError && !validationError ? (
          <ErrorBanner message={t('adventures.segments.uploadError')} />
        ) : null}
      </View>
    );
  },
);
