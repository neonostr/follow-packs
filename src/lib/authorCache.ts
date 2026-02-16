import { openDB, type IDBPDatabase } from 'idb';
import type { NostrMetadata } from '@nostrify/nostrify';

const getDBName = () => {
  const hostname = typeof window !== 'undefined' ? window.location.hostname : 'default';
  return `nostr-author-cache-${hostname}`;
};

const DB_NAME = getDBName();
const DB_VERSION = 1;
const STORE_NAME = 'authors';

export interface CachedAuthor {
  pubkey: string;
  metadata: NostrMetadata;
  raw_content: string;
  updated_at: number;
}

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'pubkey' });
        }
      },
    });
  }
  return dbPromise;
}

export async function getCachedAuthor(pubkey: string): Promise<CachedAuthor | undefined> {
  try {
    const db = await getDB();
    return await db.get(STORE_NAME, pubkey);
  } catch {
    return undefined;
  }
}

export async function getCachedAuthors(pubkeys: string[]): Promise<Map<string, CachedAuthor>> {
  const result = new Map<string, CachedAuthor>();
  try {
    const db = await getDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const promises = pubkeys.map(async (pk) => {
      const cached = await store.get(pk);
      if (cached) result.set(pk, cached);
    });
    await Promise.all(promises);
    await tx.done;
  } catch {
    // Silently fail - cache is best-effort
  }
  return result;
}

export async function setCachedAuthor(
  pubkey: string,
  metadata: NostrMetadata,
  rawContent: string,
  eventCreatedAt: number,
): Promise<void> {
  try {
    const db = await getDB();
    const existing = await db.get(STORE_NAME, pubkey);
    // Only update if newer
    if (existing && existing.updated_at >= eventCreatedAt) return;
    await db.put(STORE_NAME, {
      pubkey,
      metadata,
      raw_content: rawContent,
      updated_at: eventCreatedAt,
    } satisfies CachedAuthor);
  } catch {
    // Silently fail
  }
}
