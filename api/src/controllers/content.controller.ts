import { NextFunction, Request, Response } from 'express';
import { prisma } from '../db/prisma.js';
import { successResponse } from '../utils/responses.js';
import { supabase } from '../../lib/supabase.js';
import { featureFlags } from '../config/featureFlags.js';
import {
  getHomeContentPayload,
  HOME_CONTENT_COLUMNS,
  DEFAULT_HOME_CONTENT,
  normalizeHomeContentPayloadToSnakeCase,
  normalizeHomeContentPayloadToLegacy,
} from '../services/home-content.service.js';

const HOME_CONTENT_KEY = 'home_content';
const HOME_CONTENT_TABLE_KEY = 'homepage';

type HomeContentPayload = Record<string, unknown>;

export const getHomeContent = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const content = await getHomeContentPayload(featureFlags.useHomeContentTable);
    res.status(200).json(successResponse(content));
    return;
  } catch (error) {
    console.warn('Failed to load home content from home_content or siteContent, returning default content.', error);
    res.status(200).json(successResponse(DEFAULT_HOME_CONTENT));
  }
};

export const updateHomeContent = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const normalizedSnake = normalizeHomeContentPayloadToSnakeCase(req.body);
    const updates: HomeContentPayload = {};

    for (const column of HOME_CONTENT_COLUMNS) {
      if (Object.prototype.hasOwnProperty.call(normalizedSnake, column)) {
        updates[column] = normalizedSnake[column];
      }
    }

    const { data, error } = await supabase
      .from('home_content')
      .update(updates)
      .eq('key', HOME_CONTENT_TABLE_KEY)
      .select('*')
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      throw new Error('Home content row not found in home_content.');
    }

    const siteContent = await prisma.siteContent.findUnique({ where: { key: HOME_CONTENT_KEY } });
    const legacyResponse = {
      ...DEFAULT_HOME_CONTENT,
      ...(typeof siteContent?.content === 'object' && siteContent?.content !== null ? siteContent.content : {}),
      ...normalizeHomeContentPayloadToLegacy(updates),
    };

    res.status(200).json(successResponse(legacyResponse));
  } catch (error) {
    next(error);
  }
};
