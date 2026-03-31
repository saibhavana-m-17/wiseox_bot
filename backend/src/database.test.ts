import { describe, it, expect, beforeEach } from 'vitest';

// We test the module's exported helpers in isolation.
// Since connectDatabase requires a real MongoDB, we focus on
// the guard behavior of getDb/getClient when not connected.

describe('database', () => {
  // Re-import fresh module state for each test
  let mod: typeof import('./database');

  beforeEach(async () => {
    // Dynamic import with cache-busting isn't straightforward in vitest,
    // so we test the guards directly from a single import.
    mod = await import('./database');
  });

  it('getDb throws when not connected', () => {
    // After module load without connectDatabase, db is null
    expect(() => mod.getDb()).toThrow('Database not connected');
  });

  it('getClient throws when not connected', () => {
    expect(() => mod.getClient()).toThrow('Database not connected');
  });

  it('disconnectDatabase is safe to call when not connected', async () => {
    // Should not throw
    await expect(mod.disconnectDatabase()).resolves.toBeUndefined();
  });
});
