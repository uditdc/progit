import { describe, expect, it } from 'vitest';
import { compareVersions } from '../src/server/update.js';

describe('compareVersions', () => {
  it('orders by major, minor, patch', () => {
    expect(compareVersions('1.0.0', '0.9.9')).toBe(1);
    expect(compareVersions('0.1.2', '0.1.3')).toBe(-1);
    expect(compareVersions('0.2.0', '0.1.9')).toBe(1);
    expect(compareVersions('1.2.3', '1.2.3')).toBe(0);
  });

  it('treats a prerelease as older than its release', () => {
    expect(compareVersions('1.0.0-beta.1', '1.0.0')).toBe(-1);
    expect(compareVersions('1.0.0', '1.0.0-beta.1')).toBe(1);
  });

  it('tolerates a leading v and missing parts', () => {
    expect(compareVersions('v1.2.0', '1.1.0')).toBe(1);
    expect(compareVersions('1', '1.0.0')).toBe(0);
  });
});
