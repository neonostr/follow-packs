import { describe, it, expect } from 'vitest';
import { genUserName } from './genUserName';

describe('genUserName', () => {
  it('returns a truncated npub for a valid hex pubkey', () => {
    const pubkey = 'e4690a13290739da123aa17d553851dec4cdd0e9d89aa18de3741c446caf8761';
    const name = genUserName(pubkey);

    expect(name).toMatch(/^npub1.{4}….{4}$/);
  });

  it('is deterministic', () => {
    const pubkey = 'e4690a13290739da123aa17d553851dec4cdd0e9d89aa18de3741c446caf8761';
    expect(genUserName(pubkey)).toEqual(genUserName(pubkey));
  });

  it('falls back to hex truncation for invalid input', () => {
    const name = genUserName('not-a-valid-hex-key');
    expect(name).toContain('…');
  });
});
