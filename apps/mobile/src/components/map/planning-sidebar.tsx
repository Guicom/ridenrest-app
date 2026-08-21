import { useEffect, useState, type ReactNode } from 'react';
import {
  Animated,
  Pressable,
  ScrollView,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChevronLeftIcon, ChevronRightIcon } from '@/components/ui/icon';
import { ScrollLockProvider } from '@/components/ui/scroll-lock';
import { useTranslation } from '@/lib/i18n';

// Panneau planning coulissant (drawer) — port iso du sidebar web en viewport mobile :
// glisse depuis la gauche (~86 % de large), backdrop sombre, bouton-poignée sur le
// bord qui dépasse (chevron). Les cartes (Vitesse, Recherche, Étapes, Météo, Densité)
// sont scrollables dedans. Quand fermé, la carte reçoit les gestes (`box-none`).

const DRAWER_FRACTION = 0.86;
const DRAWER_MAX_WIDTH = 400;
const TOGGLE_WIDTH = 28;
const ANIM_MS = 250;

export interface PlanningSidebarProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}

export function PlanningSidebar({
  open,
  onOpenChange,
  children,
}: PlanningSidebarProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const width = Math.min(screenWidth * DRAWER_FRACTION, DRAWER_MAX_WIDTH);

  // `Animated.Value` stable (init paresseuse via `useState`) — pas de `useRef().current`
  // lu en rendu (règle `react-hooks/refs`). L'animation est pilotée par l'effet.
  const [translateX] = useState(() => new Animated.Value(open ? 0 : -width));

  useEffect(() => {
    Animated.timing(translateX, {
      toValue: open ? 0 : -width,
      duration: ANIM_MS,
      useNativeDriver: true,
    }).start();
  }, [open, width, translateX]);

  return (
    <View pointerEvents="box-none" className="absolute inset-0 z-30">
      {/* Backdrop — seulement ouvert, ferme au tap */}
      {open ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('map.sidebar.close')}
          onPress={() => onOpenChange(false)}
          className="absolute inset-0 bg-black/30"
        />
      ) : null}

      {/* Panneau coulissant */}
      <Animated.View
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: 0,
          width,
          transform: [{ translateX }],
        }}
      >
        <View className="flex-1 border-r border-border bg-background-page">
          <ScrollLockProvider>
            {(scrollEnabled) => (
          <ScrollView
            testID="planning-sidebar-scroll"
            scrollEnabled={scrollEnabled}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{
              // Marge haute généreuse : la barre d'état / Dynamic Island iOS ne doit
              // pas chevaucher la 1re carte (insets.top + dégagement visuel).
              paddingTop: insets.top + 28,
              paddingBottom: insets.bottom + 24,
              paddingHorizontal: 16,
              gap: 16,
            }}
          >
            {children}
          </ScrollView>
            )}
          </ScrollLockProvider>
        </View>

        {/* Poignée d'ouverture/fermeture — dépasse du bord droit du panneau */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={open ? t('map.sidebar.close') : t('map.sidebar.open')}
          testID="drawer-toggle"
          onPress={() => onOpenChange(!open)}
          style={{
            position: 'absolute',
            left: width,
            top: '50%',
            width: TOGGLE_WIDTH,
            marginTop: -24,
          }}
          className="h-12 items-center justify-center rounded-r-lg border border-l-0 border-border bg-card"
        >
          {open ? (
            <ChevronLeftIcon size={18} className="text-text-primary" />
          ) : (
            <ChevronRightIcon size={18} className="text-text-primary" />
          )}
        </Pressable>
      </Animated.View>
    </View>
  );
}
