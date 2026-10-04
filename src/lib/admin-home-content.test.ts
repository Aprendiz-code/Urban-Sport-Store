import { describe, expect, it } from 'vitest';
import { mapHomeContentPayload } from './admin-home-content';

describe('admin home content API payload', () => {
  it('maps only supported client fields to the API database column names', () => {
    expect(mapHomeContentPayload({
      heroTitle: 'Nueva portada',
      heroSubtitle: 'Texto de portada',
      heroImage: 'https://images.example/hero.png',
      featuredProductIds: ['11111111-1111-1111-1111-111111111111'],
      newsletterEnabled: true,
      categorySectionTitle: 'UI-only field',
    })).toEqual({
      hero_title: 'Nueva portada',
      hero_subtitle: 'Texto de portada',
      hero_image: 'https://images.example/hero.png',
      featured_product_ids: ['11111111-1111-1111-1111-111111111111'],
      newsletter_enabled: true,
    });
  });

  it('returns an empty object when no supported fields are provided', () => {
    expect(mapHomeContentPayload({ categorySectionTitle: 'UI-only field' })).toEqual({});
  });
});