import { QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';

import { queryClient } from './query-client';

// Provider TanStack Query monté au root (MOB-2.1 / AC3). Le listener de cycle de vie
// (AppState + netinfo) est câblé séparément via `useAppStateRefetch` dans le root
// `_layout.tsx` — un **seul** point centralisé (archi §Lifecycle).
export function QueryProvider({ children }: PropsWithChildren) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
