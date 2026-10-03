import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

/** Kind 39089 = Starter Packs (NIP-51) */
const FOLLOW_PACK_KIND = 39089;

export interface FollowPack {
  event: NostrEvent;
  id: string;
  dTag: string;
  title: string;
  description: string;
  image: string;
  pubkeys: string[];
  author: string;
  createdAt: number;
}

export function parseFollowPack(event: NostrEvent): FollowPack | null {
  const dTag = event.tags.find(([name]) => name === 'd')?.[1];
  if (!dTag) return null;

  const title = event.tags.find(([name]) => name === 'title')?.[1] ?? '';
  const description = event.tags.find(([name]) => name === 'description')?.[1] ?? '';
  const image = event.tags.find(([name]) => name === 'image')?.[1] ?? '';
  const pubkeys = event.tags
    .filter(([name]) => name === 'p')
    .map(([, pk]) => pk)
    .filter(Boolean);

  return {
    event,
    id: event.id,
    dTag,
    title,
    description,
    image,
    pubkeys,
    author: event.pubkey,
    createdAt: event.created_at,
  };
}

function scoreFollowPack(pack: FollowPack): number {
  let score = 0;
  if (pack.image) score += 3;
  if (pack.description.length > 0) score += 2;
  score += Math.min(pack.pubkeys.length, 10);
  if (pack.title.length >= 5) score += 1;
  if (/\btest(ing)?\b/i.test(pack.title)) score -= 5;
  return score;
}

export function useFollowPacks(limit = 50) {
  const { nostr } = useNostr();

  return useQuery<FollowPack[]>({
    queryKey: ['follow-packs', limit],
    queryFn: async ({ signal }) => {
      const events = await nostr.query(
        [{ kinds: [FOLLOW_PACK_KIND], limit }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) },
      );

      return events
        .map(parseFollowPack)
        .filter((pack): pack is FollowPack => pack !== null && pack.title.length > 0 && pack.pubkeys.length > 0)
        .sort((a, b) => {
          const diff = scoreFollowPack(b) - scoreFollowPack(a);
          return diff !== 0 ? diff : b.createdAt - a.createdAt;
        });
    },
    staleTime: 60_000,
  });
}

const BACKUP_RELAYS = [
  'wss://relay.damus.io',
  'wss://relay.primal.net',
  'wss://nos.lol',
  'wss://relay.nostr.band',
];

export function useFollowPack(author: string | undefined, dTag: string | undefined) {
  const { nostr } = useNostr();
  const queryClient = useQueryClient();

  // Reuse a copy already loaded in any pack list (instant open)
  const findCached = (): FollowPack | undefined => {
    if (!author || !dTag) return undefined;
    const lists = [
      ...queryClient.getQueriesData<FollowPack[]>({ queryKey: ['user-follow-packs'] }),
      ...queryClient.getQueriesData<FollowPack[]>({ queryKey: ['follow-packs'] }),
    ];
    let best: FollowPack | undefined;
    for (const [, data] of lists) {
      for (const p of data ?? []) {
        if (p.author === author && p.dTag === dTag && (!best || p.createdAt > best.createdAt)) best = p;
      }
    }
    return best;
  };

  return useQuery<FollowPack>({
    queryKey: ['follow-pack', author, dTag],
    queryFn: async ({ signal }) => {
      const filter = [{ kinds: [FOLLOW_PACK_KIND], authors: [author!], '#d': [dTag!], limit: 1 }];
      const opts = { signal: AbortSignal.any([signal, AbortSignal.timeout(6000)]) };

      const results = await Promise.allSettled([
        nostr.query(filter, opts),
        nostr.group(BACKUP_RELAYS).query(filter, opts),
      ]);

      const events = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
      const newest = events.sort((a, b) => b.created_at - a.created_at)[0];
      const parsed = newest ? parseFollowPack(newest) : null;
      const cached = findCached();

      if (parsed && (!cached || parsed.createdAt >= cached.createdAt)) return parsed;
      if (cached) return cached;
      throw new Error('Pack not found yet');
    },
    initialData: findCached,
    initialDataUpdatedAt: 0, // still refresh in the background
    enabled: !!author && !!dTag,
    staleTime: 60_000,
    retry: 3,
    retryDelay: (n) => 1000 * 2 ** n,
  });
}


export function useUserFollowPacks(pubkey: string | undefined) {
  const { nostr } = useNostr();

  return useQuery<FollowPack[]>({
    queryKey: ['user-follow-packs', pubkey],
    queryFn: async ({ signal }) => {
      if (!pubkey) return [];

      const events = await nostr.query(
        [{ kinds: [FOLLOW_PACK_KIND], authors: [pubkey], limit: 50 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) },
      );

      return events
        .map(parseFollowPack)
        .filter((pack): pack is FollowPack => pack !== null && pack.title.length > 0)
        .sort((a, b) => b.createdAt - a.createdAt);
    },
    enabled: !!pubkey,
    staleTime: 60_000,
  });
}
