import { describe, expect, it } from 'vitest';
import { getSortPreference, setSortPreference, SORT_PREFERENCES_KEY } from './sortPreferences';

describe('sort preferences', () => {
  it('remembers each player separately across reads, including a renamed player ID', () => {
    expect(getSortPreference('a')).toBe('descending');
    setSortPreference('a', 'ascending');
    setSortPreference('b', 'descending');
    expect(getSortPreference('a')).toBe('ascending');
    expect(getSortPreference('b')).toBe('descending');
    expect(JSON.parse(localStorage.getItem(SORT_PREFERENCES_KEY)!)).toEqual({
      version: 1, byPlayer: { a: 'ascending', b: 'descending' },
    });
  });

  it('ignores invalid persisted preferences without crashing', () => {
    localStorage.setItem(SORT_PREFERENCES_KEY, JSON.stringify({ version: 1, byPlayer: { a: 'unknown' } }));
    expect(getSortPreference('a')).toBe('descending');
    expect(localStorage.getItem(SORT_PREFERENCES_KEY)).toBeNull();
  });
});
