import { describe, expect, it } from 'vitest';
import { suggestImageColors } from '../color-suggestion';

describe('image color suggestions', () => {
  it('returns null or an image suggestion without relying on color names', async () => {
    const result = await suggestImageColors('https://example.test/product.png');

    expect(
      result === null
      || (result.source === 'image' && /^#[0-9A-F]{6}$/i.test(result.primary) && (result.confidence === 'high' || result.confidence === 'low')),
    ).toBe(true);
  });
});
