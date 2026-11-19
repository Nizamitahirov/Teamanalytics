import { describe, expect, it } from 'vitest';
import { az } from '../../shared/i18n/az.js';
import { en } from '../../shared/i18n/en.js';

describe('i18n', () => {
  it('en.ts az.ts ilə eyni açarlara malikdir', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(az).sort());
  });
  it('heç bir tərcümə boş deyil, yer tutanlar eynidir', () => {
    for (const k of Object.keys(az) as (keyof typeof az)[]) {
      expect(az[k].trim(), k).not.toBe('');
      expect(en[k].trim(), k).not.toBe('');
      expect((en[k].match(/\{\w+\}/g) ?? []).sort(), k).toEqual((az[k].match(/\{\w+\}/g) ?? []).sort());
    }
  });
});
