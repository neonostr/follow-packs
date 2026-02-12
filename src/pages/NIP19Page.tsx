import { nip19 } from 'nostr-tools';
import { useParams, Navigate } from 'react-router-dom';
import NotFound from './NotFound';

export function NIP19Page() {
  const { nip19: identifier } = useParams<{ nip19: string }>();

  if (!identifier) {
    return <NotFound />;
  }

  let decoded;
  try {
    decoded = nip19.decode(identifier);
  } catch {
    return <NotFound />;
  }

  const { type } = decoded;

  switch (type) {
    case 'npub':
    case 'nprofile':
      // Not implemented — just link externally
      return <NotFound />;

    case 'note':
      return <NotFound />;

    case 'nevent':
      return <NotFound />;

    case 'naddr': {
      const addr = decoded.data;
      // Handle follow pack (kind 39089) addresses
      if (addr.kind === 39089) {
        const npub = nip19.npubEncode(addr.pubkey);
        return <Navigate to={`/pack/${npub}/${addr.identifier}`} replace />;
      }
      return <NotFound />;
    }

    default:
      return <NotFound />;
  }
}
