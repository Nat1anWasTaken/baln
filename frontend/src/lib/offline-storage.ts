import type {
  PersistedClient,
  Persister,
} from "@tanstack/react-query-persist-client";
import type { Query } from "@tanstack/react-query";
import { createStore, del, get, set } from "idb-keyval";

import type { User } from "@/lib/schemas";

export const OFFLINE_MAX_AGE = 24 * 60 * 60 * 1000;
export const OFFLINE_CACHE_BUSTER = "baln-offline-v1";

const store = createStore("baln-offline", "state");
const queryCacheKey = "query-cache";
const sessionKey = "session";
const pendingLogoutKey = "pending-logout";

const persistedQueryPrefixes = new Set([
  "accounts",
  "account-balance",
  "entries",
  "entries-recent",
  "entry",
  "report-summary",
  "report-trend",
  "financial-position",
]);

export type OfflineSession = {
  user: User;
  validatedAt: number;
  expiresAt: number;
};

export const offlinePersister: Persister = {
  async persistClient(client: PersistedClient) {
    await set(queryCacheKey, client, store);
  },
  async restoreClient() {
    return get<PersistedClient>(queryCacheKey, store);
  },
  async removeClient() {
    await del(queryCacheKey, store);
  },
};

export function isPersistedQueryKey(queryKey: readonly unknown[]) {
  const prefix = queryKey[0];
  return typeof prefix === "string" && persistedQueryPrefixes.has(prefix);
}

export function shouldPersistQuery(query: Query) {
  return (
    query.state.status === "success" && isPersistedQueryKey(query.queryKey)
  );
}

export async function readOfflineSession(
  now = Date.now(),
): Promise<OfflineSession | null> {
  const session = await get<OfflineSession>(sessionKey, store);
  if (!session) return null;
  if (session.expiresAt <= now) {
    await clearOfflineData();
    return null;
  }
  return session;
}

export async function saveOfflineSession(user: User, now = Date.now()) {
  const session: OfflineSession = {
    user,
    validatedAt: now,
    expiresAt: now + OFFLINE_MAX_AGE,
  };
  await set(sessionKey, session, store);
  return session;
}

export async function clearOfflineData() {
  await Promise.all([offlinePersister.removeClient(), del(sessionKey, store)]);
}

export async function hasPendingLogout() {
  return (await get<boolean>(pendingLogoutKey, store)) === true;
}

export async function setPendingLogout(pending: boolean) {
  if (pending) {
    await set(pendingLogoutKey, true, store);
  } else {
    await del(pendingLogoutKey, store);
  }
}
