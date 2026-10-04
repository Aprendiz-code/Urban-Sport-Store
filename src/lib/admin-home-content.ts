const HOME_CONTENT_API_FIELDS = {
  heroTitle: 'hero_title',
  heroSubtitle: 'hero_subtitle',
  heroImage: 'hero_image',
  featuredCategoryIds: 'featured_category_ids',
  featuredProductIds: 'featured_product_ids',
  discountedProductIds: 'discounted_product_ids',
  promoBanner: 'promo_banner',
  newsletterEnabled: 'newsletter_enabled',
} as const;

export function mapHomeContentPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const mapped: Record<string, unknown> = {};
  for (const [clientField, databaseField] of Object.entries(HOME_CONTENT_API_FIELDS)) {
    if (Object.prototype.hasOwnProperty.call(payload, clientField)) {
      mapped[databaseField] = payload[clientField];
    }
  }
  return mapped;
}