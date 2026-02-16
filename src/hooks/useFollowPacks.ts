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

export function useFollowPack(author: string | undefined, dTag: string | undefined) {
  const { nostr } = useNostr();

  return useQuery<FollowPack | null>({
    queryKey: ['follow-pack', author, dTag],
    queryFn: async ({ signal }) => {
      if (!author || !dTag) return null;

      const events = await nostr.query(
        [{ kinds: [FOLLOW_PACK_KIND], authors: [author], '#d': [dTag], limit: 1 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) },
      );

      if (events.length === 0) return null;
      return parseFollowPack(events[0]);
    },
    enabled: !!author && !!dTag,
    staleTime: 60_000,
  });
}

export function useMyFollowPacks() {
  const _nostr = useNostr();

  return useQuery<FollowPack[]>({
    queryKey: ['my-follow-packs'],
    queryFn: async () => {
      // This will be overridden by the component that provides the pubkey
      return [];
    },
    enabled: false,
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
