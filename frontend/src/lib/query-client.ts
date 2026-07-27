import { QueryClient } from "@tanstack/react-query";

import { OFFLINE_MAX_AGE } from "@/lib/offline-storage";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: OFFLINE_MAX_AGE,
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
    mutations: {
      retry: false,
    },
  },
});
