import { prisma } from '../db/prisma.js';
import { supabase } from '../../lib/supabase.js';

type HomeContentPayload = Record<string, unknown>;
type HomeContentRow = Record<string, unknown>;

const HOME_CONTENT_KEY = 'home_content';
const HOME_CONTENT_TABLE_KEY = 'homepage';

export const HOME_CONTENT_COLUMNS = [
  'hero_title',
  'hero_subtitle',
  'hero_image',
  'featured_category_ids',
  'featured_product_ids',
  'discounted_product_ids',
  'promo_banner',
  'newsletter_enabled',
] as const;

export const DEFAULT_HOME_CONTENT: HomeContentPayload = {
  heroTitle: 'Tu ritmo, Tu estilo, Tu mejor versión',
  heroSubtitle: 'Zapatillas, ropa deportiva, perfumes y accesorios premium. Todo lo que necesitas para rendir al máximo y lucir increíble.',
  featuredSectionTitle: 'Productos destacados',
  newArrivalsSectionTitle: 'Novedades',
  saleSectionTitle: 'En descuento ahora',
  categorySectionLabel: 'DESCUBRE',
  categorySectionTitle: 'Colecciones para ti',
  featuredSectionLabel: 'Lo más buscado',
  newArrivalsLabel: 'Recién llegados',
  saleSectionLabel: 'Oferta especial',
  categorySectionImage: '',
  featuredSectionImage: '',
  newArrivalsSectionImage: '',
  saleSectionImage: '',
  featuredSectionSubtitle: 'Los productos más buscados por nuestros clientes.',
  featuredSectionDiscount: '',
  newArrivalsSectionSubtitle: 'Novedades directamente desde las marcas.',
  newArrivalsSectionDiscount: '',
  saleSectionSubtitle: 'Promociones y descuentos por tiempo limitado.',
  saleSectionDiscount: '',
};

const normalizeHomeContentPayloadToSnakeCase = (body: HomeContentPayload): HomeContentPayload => {
  if (!body || typeof body !== 'object') {
    return {};
  }

  const normalized: HomeContentPayload = {};
  const mapping: Array<[string, string]> = [
    ['hero_title', 'hero_title'],
    ['hero_subtitle', 'hero_subtitle'],
    ['hero_image', 'hero_image'],
    ['featured_category_ids', 'featured_category_ids'],
    ['featured_product_ids', 'featured_product_ids'],
    ['discounted_product_ids', 'discounted_product_ids'],
    ['promo_banner', 'promo_banner'],
    ['newsletter_enabled', 'newsletter_enabled'],
    ['heroTitle', 'hero_title'],
    ['heroSubtitle', 'hero_subtitle'],
    ['heroImage', 'hero_image'],
    ['featuredCategoryIds', 'featured_category_ids'],
    ['featuredProductIds', 'featured_product_ids'],
    ['discountedProductIds', 'discounted_product_ids'],
    ['promoBanner', 'promo_banner'],
    ['newsletterEnabled', 'newsletter_enabled'],
  ];

  for (const [source, target] of mapping) {
    if (Object.prototype.hasOwnProperty.call(body, source) && normalized[target] === undefined) {
      normalized[target] = (body as any)[source];
    }
  }

  return normalized;
};

const normalizeHomeContentPayloadToLegacy = (body: HomeContentPayload): HomeContentPayload => {
  if (!body || typeof body !== 'object') {
    return {};
  }

  const normalized: HomeContentPayload = { ...body };

  if (Object.prototype.hasOwnProperty.call(body, 'hero_title') && normalized.heroTitle === undefined) {
    normalized.heroTitle = (body as any).hero_title;
  }
  if (Object.prototype.hasOwnProperty.call(body, 'hero_subtitle') && normalized.heroSubtitle === undefined) {
    normalized.heroSubtitle = (body as any).hero_subtitle;
  }
  if (Object.prototype.hasOwnProperty.call(body, 'hero_image') && normalized.heroImage === undefined) {
    normalized.heroImage = (body as any).hero_image;
  }
  if (Object.prototype.hasOwnProperty.call(body, 'featured_category_ids') && normalized.featuredCategoryIds === undefined) {
    normalized.featuredCategoryIds = (body as any).featured_category_ids;
  }
  if (Object.prototype.hasOwnProperty.call(body, 'featured_product_ids') && normalized.featuredProductIds === undefined) {
    normalized.featuredProductIds = (body as any).featured_product_ids;
  }
  if (Object.prototype.hasOwnProperty.call(body, 'discounted_product_ids') && normalized.discountedProductIds === undefined) {
    normalized.discountedProductIds = (body as any).discounted_product_ids;
  }
  if (Object.prototype.hasOwnProperty.call(body, 'promo_banner') && normalized.promoBanner === undefined) {
    normalized.promoBanner = (body as any).promo_banner;
  }
  if (Object.prototype.hasOwnProperty.call(body, 'newsletter_enabled') && normalized.newsletterEnabled === undefined) {
    normalized.newsletterEnabled = (body as any).newsletter_enabled;
  }

  return normalized;
};

const mapHomeContentRowToLegacy = (row: HomeContentRow): HomeContentPayload => {
  return {
    ...(typeof row.hero_title === 'string' ? { heroTitle: row.hero_title } : {}),
    ...(typeof row.hero_subtitle === 'string' ? { heroSubtitle: row.hero_subtitle } : {}),
    ...(typeof row.hero_image === 'string' ? { heroImage: row.hero_image } : {}),
    ...(Array.isArray(row.featured_category_ids) ? { featuredCategoryIds: row.featured_category_ids } : {}),
    ...(Array.isArray(row.featured_product_ids) ? { featuredProductIds: row.featured_product_ids } : {}),
    ...(Array.isArray(row.discounted_product_ids) ? { discountedProductIds: row.discounted_product_ids } : {}),
    ...(typeof row.promo_banner === 'string' ? { promoBanner: row.promo_banner } : {}),
    ...(typeof row.newsletter_enabled === 'boolean' ? { newsletterEnabled: row.newsletter_enabled } : {}),
  };
};

export const getHomeContentPayload = async (useHomeContent: boolean): Promise<HomeContentPayload> => {
  if (useHomeContent) {
    const homeContentResult = await supabase
      .from('home_content')
      .select('*')
      .eq('key', HOME_CONTENT_TABLE_KEY)
      .single();

    if (!homeContentResult.error && homeContentResult.data) {
      return {
        ...DEFAULT_HOME_CONTENT,
        ...mapHomeContentRowToLegacy(homeContentResult.data as HomeContentRow),
      };
    }
  }

  const siteContent = await prisma.siteContent.findUnique({ where: { key: HOME_CONTENT_KEY } });
  if (siteContent?.content && typeof siteContent.content === 'object' && siteContent.content !== null) {
    return {
      ...DEFAULT_HOME_CONTENT,
      ...siteContent.content,
    };
  }

  return DEFAULT_HOME_CONTENT;
};

export { normalizeHomeContentPayloadToSnakeCase, normalizeHomeContentPayloadToLegacy };
