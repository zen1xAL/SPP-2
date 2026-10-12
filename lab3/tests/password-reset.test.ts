import { describe, it, expect } from 'vitest';
import { hashToken } from '../src/server/auth.js';

describe('Password Reset Token Logic Tests', () => {
  it('should generate valid 64-character sha256 token hashes', () => {
    const rawToken = 'abcdef0123456789abcdef0123456789';
    const hashed = hashToken(rawToken);

    expect(typeof hashed).toBe('string');
    expect(hashed.length).toBe(64);
    expect(hashed).toBe(hashToken(rawToken));
  });

  it('should differentiate between different reset tokens', () => {
    const tokenA = 'token-alpha-123';
    const tokenB = 'token-beta-456';

    expect(hashToken(tokenA)).not.toBe(hashToken(tokenB));
  });
});
