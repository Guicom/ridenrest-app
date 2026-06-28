import { useEffect, useState, type ReactNode } from 'react';
import { Animated, Pressable, Text, View, type LayoutChangeEvent } from 'react-native';

import { ChevronDownIcon, ChevronUpIcon } from '@/components/ui/icon';
import { useTranslation } from '@/lib/i18n';

// Section « PROFIL » repliable du panneau Live (MOB-5.4 / T2, AC2-5, 7) — port du web
// `live-controls.tsx` (en-tête PROFIL + chevron + section `h-0 ↔ h-[80px]`).
//
// **Animation de hauteur** : `Animated` (cœur RN), PAS `react-native-reanimated` —
// décision d'implémentation alignée sur `live-filters-drawer.tsx` (MOB-5.3, même
// convention Live) et sur `slider.tsx` (reanimated casse le build Storybook + aucun
// plugin babel worklets configuré). NFR-LP-004 (transition fluide ~200 ms) est satisfait
// à l'identique. Aucun module natif neuf → pas de prebuild.
//
// **Mesure de la hauteur cible** : le contenu est TOUJOURS rendu à sa taille réelle ;
// l'animation ne fait que clipper le conteneur (`overflow: hidden`), donc `onLayout`
// reporte la hauteur naturelle même quand la section est repliée → on anime `0 ↔ h`.
//
// **Garde `hasProfile`** (AC7) : sans contenu (`content == null`, ex. pas de données
// d'élévation tant que MOB-5.5 n'alimente pas le slot), le toggle est désactivé, la
// section reste à `height 0` et `accessibilityElementsHidden` — pas de zone vide cliquable.

const ANIM_MS = 200;

export interface CollapsibleProfileSectionProps {
  /** Section ouverte — état remonté à l'écran Live (UI-only, pas de store). */
  open: boolean;
  /** Toggle manuel via le chevron de l'en-tête (FR-LP-005). */
  onToggle: () => void;
  /**
   * Contenu rendu dans la section (profil d'élévation — MOB-5.5). `null`/absent →
   * section non dépliable (AC7).
   */
  content?: ReactNode;
}

export function CollapsibleProfileSection({
  open,
  onToggle,
  content,
}: CollapsibleProfileSectionProps) {
  const { t } = useTranslation();

  // AC7 : pas de contenu → toggle désactivé + section toujours à height 0.
  const hasProfile = content != null;
  const expanded = open && hasProfile;

  const [contentHeight, setContentHeight] = useState(0);
  // `useState(() => …)` (pas `useRef(...).current`) : lire `.current` en rendu viole
  // `react-hooks/refs` — même pattern que `live-filters-drawer.tsx`.
  const [animatedHeight] = useState(() => new Animated.Value(0));

  useEffect(() => {
    // Guard : ne pas animer vers une hauteur inconnue (contentHeight=0 au 1er mount
    // avant que `onLayout` ait mesuré le contenu). Sans garde, l'Animated.View resterait
    // à 0 et le 2e effet (déclenché par onLayout) produirait un saut visible.
    if (expanded && contentHeight === 0) return;
    Animated.timing(animatedHeight, {
      toValue: expanded ? contentHeight : 0,
      duration: ANIM_MS,
      useNativeDriver: false, // hauteur = propriété de layout (pas transform)
    }).start();
  }, [expanded, contentHeight, animatedHeight]);

  const handleContentLayout = (e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    if (h > 0 && h !== contentHeight) setContentHeight(h);
  };

  return (
    <View>
      {/* En-tête PROFIL + chevron — toggle manuel (AC5), désactivé sans contenu (AC7).
          Cible tactile pleine largeur ≥ 44 px (NFR-LP-003). */}
      <Pressable
        testID="btn-profile-toggle"
        accessibilityRole="button"
        accessibilityState={hasProfile ? { expanded: open } : { disabled: true }}
        // Label = le texte visible « PROFIL » (le bouton accessible masque sinon le Text
        // enfant à VoiceOver/XCUITest) ; l'action (afficher/masquer) passe en hint.
        accessibilityLabel={t('live.panel.profileHeader')}
        accessibilityHint={
          hasProfile
            ? open
              ? t('live.panel.profileHide')
              : t('live.panel.profileShow')
            : undefined
        }
        disabled={!hasProfile}
        onPress={onToggle}
        className={
          hasProfile
            ? 'min-h-[44px] flex-row items-center justify-between py-1'
            : 'min-h-[44px] flex-row items-center justify-between py-1 opacity-60'
        }
      >
        <Text className="text-xs font-montserrat-semibold uppercase tracking-wide text-text-secondary">
          {t('live.panel.profileHeader')}
        </Text>
        <View
          testID={open ? 'profile-chevron-down' : 'profile-chevron-up'}
          className="h-7 w-7 items-center justify-center rounded-full bg-primary/10"
        >
          {open ? (
            <ChevronDownIcon size={16} className="text-primary" />
          ) : (
            <ChevronUpIcon size={16} className="text-primary" />
          )}
        </View>
      </Pressable>

      {/* Section repliable : l'`Animated.View` clippe la hauteur (NFR-LP-004) ; la `View`
          interne (toujours rendue à sa taille réelle → `onLayout` reporte la hauteur cible)
          porte le testID + l'a11y masquée quand repliée/vide (AC7) → son contenu n'est pas
          annoncé tant qu'il est caché. */}
      <Animated.View style={{ height: animatedHeight, overflow: 'hidden' }}>
        <View
          testID="profile-section"
          accessibilityElementsHidden={!expanded}
          importantForAccessibility={expanded ? 'auto' : 'no-hide-descendants'}
          onLayout={handleContentLayout}
        >
          {content}
        </View>
      </Animated.View>
    </View>
  );
}
