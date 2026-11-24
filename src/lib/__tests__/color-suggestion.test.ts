import { describe, expect, it } from 'vitest';
import { suggestNamedColorHex } from '../color-suggestion';

describe('named color suggestions', () => {
  it('recognizes accented Spanish names and two-tone colors', () => {
    expect(suggestNamedColorHex('Gris / Plata')).toMatchObject({
      primary: '#808080',
      secondary: '#C0C0C0',
      confidence: 'high',
      source: 'name',
    });
  });

  it('recognizes white and returns null for names it cannot map', () => {
    expect(suggestNamedColorHex('Blanco')).toMatchObject({ primary: '#FFFFFF', confidence: 'high' });
    expect(suggestNamedColorHex('Niebla urbana')).toBeNull();
  });
});