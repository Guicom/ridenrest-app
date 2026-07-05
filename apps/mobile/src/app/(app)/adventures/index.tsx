import type { AdventureResponse } from '@ridenrest/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AdventureCard } from '@/components/adventure/adventure-card';
import { Button } from '@/components/ui/button';
import { ErrorBanner } from '@/components/ui/error-banner';
import {
  BikeIcon,
  ChevronDownIcon,
  PlusIcon,
  SettingsIcon,
} from '@/components/ui/icon';
import { Skeleton } from '@/components/ui/skeleton';
import { useAdventures } from '@/hooks/use-adventures';
import { useTranslation } from '@/lib/i18n';

// Écran liste des aventures (MOB-3.1 / AC1, 2, 5, 6, 7) — portage À L'IDENTIQUE de
// la page web (`apps/web/.../adventures/page.tsx` + `adventure-list.tsx`) :
//   - en-tête : titre « Mes aventures » + bouton pill « Nouvelle aventure » ;
//   - bandeau d'intro Planning/Live (`bg-background-intro`) ;
//   - tri : aventures « à venir » (actives d'abord, puis par date), puis section
//     repliable « Aventures passées (N) ».
// Carte iso web : tap → détail `[id]` (où vivent renommage/suppression, AC3/AC4).
// Accès Paramètres conservé (gear) : la nav d'app mobile n'existe pas encore.

/** `'YYYY-MM-DD'` → date locale minuit (évite le décalage d'un jour en UTC-). */
function parseLocalDate(d: string): Date {
  return new Date(`${d}T00:00:00`);
}

/** Date de référence d'une aventure : fin si dispo, sinon début, sinon `null`. */
function refDate(a: AdventureResponse): Date | null {
  if (a.endDate) return parseLocalDate(a.endDate);
  if (a.startDate) return parseLocalDate(a.startDate);
  return null;
}

/** Partition à venir / passées (logique miroir du web `adventure-list.tsx`). */
function partition(data: AdventureResponse[]): {
  upcoming: AdventureResponse[];
  past: AdventureResponse[];
} {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const upcoming = data
    .filter((a) => {
      if (a.status === 'active') return true;
      const ref = refDate(a);
      return ref === null || ref >= today;
    })
    .sort((a, b) => {
      if (a.status === 'active' && b.status !== 'active') return -1;
      if (b.status === 'active' && a.status !== 'active') return 1;
      if (!a.startDate && !b.startDate) return 0;
      if (!a.startDate) return 1;
      if (!b.startDate) return -1;
      return (
        parseLocalDate(a.startDate).getTime() -
        parseLocalDate(b.startDate).getTime()
      );
    });

  const past = data
    .filter((a) => {
      if (a.status === 'active') return false;
      const ref = refDate(a);
      return ref !== null && ref < today;
    })
    .sort((a, b) => refDate(b)!.getTime() - refDate(a)!.getTime());

  return { upcoming, past };
}

export default function AdventuresScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { data, isPending, isError, refetch } = useAdventures();
  const [pastExpanded, setPastExpanded] = useState(false);

  const paddingTop = insets.top + 24;

  if (isPending) {
    return <AdventuresListSkeleton paddingTop={paddingTop} />;
  }

  if (isError) {
    return (
      <ScrollView
        className="flex-1 bg-background-page"
        contentContainerClassName="gap-4 p-6"
        contentContainerStyle={{ paddingTop }}
      >
        <ScreenHeader />
        <ErrorBanner message={t('adventures.errors.loadFailed')} />
        <Button
          variant="outline"
          label={t('common.retry')}
          onPress={() => refetch()}
        />
      </ScrollView>
    );
  }

  if (data.length === 0) {
    return (
      <ScrollView
        className="flex-1 bg-background-page"
        contentContainerClassName="flex-grow gap-6 p-6"
        contentContainerStyle={{ paddingTop }}
      >
        <ScreenHeader />
        <IntroBanner />
        <AdventuresEmptyState />
      </ScrollView>
    );
  }

  const { upcoming, past } = partition(data);

  return (
    <ScrollView
      className="flex-1 bg-background-page"
      contentContainerClassName="gap-6 p-6"
      contentContainerStyle={{ paddingTop }}
    >
      <ScreenHeader />
      <IntroBanner />

      <View className="gap-3">
        {upcoming.map((adventure) => (
          <AdventureCard
            key={adventure.id}
            adventure={adventure}
            onPress={(id) => router.push(`/(app)/adventures/${id}`)}
          />
        ))}
      </View>

      {past.length > 0 ? (
        <View className="gap-2">
          <Pressable
            accessibilityRole="button"
            className="flex-row items-center gap-2 py-1"
            onPress={() => setPastExpanded((v) => !v)}
          >
            <ChevronDownIcon
              size={16}
              className={`text-text-muted ${pastExpanded ? 'rotate-180' : ''}`}
            />
            <Text className="text-sm font-montserrat text-text-muted">
              {t('adventures.pastSection', { count: past.length })}
            </Text>
          </Pressable>
          {pastExpanded ? (
            <View className="gap-3 opacity-75">
              {past.map((adventure) => (
                <AdventureCard
                  key={adventure.id}
                  adventure={adventure}
                  onPress={(id) => router.push(`/(app)/adventures/${id}`)}
                />
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
    </ScrollView>
  );
}

/** En-tête : titre « Mes aventures » + accès paramètres + pill « Nouvelle aventure ». */
function ScreenHeader() {
  const { t } = useTranslation();
  return (
    <View className="flex-row items-center justify-between gap-2">
      <Text
        numberOfLines={1}
        className="shrink text-2xl font-montserrat-bold text-text-primary"
      >
        {t('adventures.title')}
      </Text>
      <View className="flex-row items-center gap-2">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('adventures.settingsA11y')}
          className="h-10 w-10 items-center justify-center rounded-full active:bg-surface-raised"
          onPress={() => router.push('/(app)/settings')}
        >
          <SettingsIcon size={20} className="text-text-muted" />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('adventures.newButton')}
          className="flex-row items-center gap-2 rounded-full bg-primary/10 px-5 py-2.5 active:bg-primary/20"
          onPress={() => router.push('/(app)/adventures/new')}
        >
          <PlusIcon size={16} className="text-primary" />
          <Text className="text-sm font-montserrat-semibold text-primary">
            {t('adventures.newButton')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

/** Bandeau d'intro Planning/Live (parité web `bg-background-intro`). */
function IntroBanner() {
  const { t } = useTranslation();
  return (
    <View className="gap-1 rounded-xl bg-background-intro p-4">
      <Text className="text-sm font-montserrat text-text-primary">
        <Text className="font-montserrat-semibold">
          {t('adventures.intro.planningLabel')}
        </Text>
        {` — ${t('adventures.intro.planningText')}`}
      </Text>
      <Text className="text-sm font-montserrat text-text-primary">
        <Text className="font-montserrat-semibold">
          {t('adventures.intro.liveLabel')}
        </Text>
        {` — ${t('adventures.intro.liveText')}`}
      </Text>
    </View>
  );
}

/** Liste de cartes squelettes pendant `isPending` (jamais d'écran blanc bloquant). */
function AdventuresListSkeleton({ paddingTop }: { paddingTop: number }) {
  return (
    <View className="flex-1 gap-6 bg-background-page p-6" style={{ paddingTop }}>
      <ScreenHeader />
      <View className="gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton
            key={i}
            testID="adventure-skeleton"
            className="h-44 rounded-xl"
          />
        ))}
      </View>
    </View>
  );
}

/** État vide explicite (≠ erreur) : icône vélo + titre + sous-texte + CTA. */
function AdventuresEmptyState() {
  const { t } = useTranslation();
  return (
    <View className="flex-1 items-center justify-center gap-4 py-10">
      <BikeIcon size={48} className="text-text-muted" />
      <View className="gap-1">
        <Text className="text-center text-lg font-montserrat-semibold text-text-primary">
          {t('adventures.empty.title')}
        </Text>
        <Text className="text-center text-sm font-montserrat text-text-muted">
          {t('adventures.empty.subtitle')}
        </Text>
      </View>
      <Button
        size="lg"
        label={t('adventures.empty.cta')}
        onPress={() => router.push('/(app)/adventures/new')}
      />
    </View>
  );
}
