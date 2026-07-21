import { NextFunction, Request, Response } from 'express';
import { prisma } from '../db/prisma.js';
import { successResponse } from '../utils/responses.js';

const HOME_CONTENT_KEY = 'home_content';

const DEFAULT_HOME_CONTENT = {
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

export const getHomeContent = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const siteContent = await prisma.siteContent.findUnique({ where: { key: HOME_CONTENT_KEY } });
    res.status(200).json(successResponse(siteContent?.content ?? DEFAULT_HOME_CONTENT));
  } catch (error) {
    console.warn('Failed to load home content from database, returning default content.', error);
    res.status(200).json(successResponse(DEFAULT_HOME_CONTENT));
  }
};

export const updateHomeContent = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const existing = await prisma.siteContent.findUnique({ where: { key: HOME_CONTENT_KEY } });
    const existingContent = typeof existing?.content === 'object' && existing?.content !== null ? existing.content : {};
    const updatedContent = {
      ...DEFAULT_HOME_CONTENT,
      ...existingContent,
      ...req.body,
    };
    const siteContent = await prisma.siteContent.upsert({
      where: { key: HOME_CONTENT_KEY },
      create: { key: HOME_CONTENT_KEY, content: updatedContent },
      update: { content: updatedContent },
    });
    res.status(200).json(successResponse(siteContent.content));
  } catch (error) {
    next(error);
  }
};
