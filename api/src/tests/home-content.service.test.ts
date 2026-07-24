import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockSingle = vi.fn();
const mockMaybeSingle = vi.fn();
const mockEq = vi.fn(() => ({ single: mockSingle }));
const mockEqUpdate = vi.fn(() => ({ select: mockSelectUpdate }));
const mockSelect = vi.fn(() => ({ eq: mockEq }));
const mockSelectUpdate = vi.fn(() => ({ maybeSingle: mockMaybeSingle }));
const mockUpdate = vi.fn(() => ({ eq: mockEqUpdate }));
const mockFrom = vi.fn(() => ({ select: mockSelect, update: mockUpdate }));
const mockFindUnique = vi.fn();

vi.mock('../../lib/supabase.js', () => ({
  supabase: {
    from: mockFrom,
  },
}));

vi.mock('../db/prisma.js', () => ({
  prisma: {
    siteContent: {
      findUnique: mockFindUnique,
    },
  },
}));

describe('home-content service', () => {
  beforeEach(() => {
    vi.resetModules();
    mockFrom.mockClear();
    mockSelect.mockClear();
    mockSelectUpdate.mockClear();
    mockUpdate.mockClear();
    mockEq.mockClear();
    mockEqUpdate.mockClear();
    mockSingle.mockClear();
    mockMaybeSingle.mockClear();
    mockFindUnique.mockClear();
    mockFrom.mockImplementation(() => ({ select: mockSelect, update: mockUpdate }));
    mockSelect.mockImplementation(() => ({ eq: mockEq }));
    mockSelectUpdate.mockImplementation(() => ({ maybeSingle: mockMaybeSingle }));
    mockEq.mockImplementation(() => ({ single: mockSingle }));
    mockEqUpdate.mockImplementation(() => ({ select: mockSelectUpdate }));
  });

  it('returns content from home_content when feature flag is enabled', async () => {
    mockSingle.mockResolvedValue({
      error: null,
      data: {
        key: 'homepage',
        hero_title: 'Título prueba',
      },
    });

    const { getHomeContentPayload } = await import('../services/home-content.service.js');
    const result = await getHomeContentPayload(true);

    expect(mockFrom).toHaveBeenCalledWith('home_content');
    expect(result.heroTitle).toBe('Título prueba');
  });

  it('falls back to prisma.siteContent when home_content is unavailable', async () => {
    mockSingle.mockResolvedValue({
      error: null,
      data: null,
    });
    mockFindUnique.mockResolvedValue({
      content: {
        heroTitle: 'Legacy hero title',
      },
    });

    const { getHomeContentPayload } = await import('../services/home-content.service.js');
    const result = await getHomeContentPayload(false);

    expect(mockFindUnique).toHaveBeenCalledWith({ where: { key: 'home_content' } });
    expect(result.heroTitle).toBe('Legacy hero title');
  });

  it('updates home_content and returns legacy response', async () => {
    mockMaybeSingle.mockResolvedValue({
      error: null,
      data: {
        key: 'homepage',
        hero_title: 'Título activo',
      },
    });
    mockFindUnique.mockResolvedValue({
      content: {
        heroTitle: 'Valor legacy',
      },
    });

    const { updateHomeContent } = await import('../controllers/content.controller.js');

    const req = { body: { heroTitle: 'Título activo' } } as any;
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    const res = { status } as any;
    const next = vi.fn();

    await updateHomeContent(req, res, next);

    expect(mockFrom).toHaveBeenCalledWith('home_content');
    expect(mockUpdate).toHaveBeenCalledWith({ hero_title: 'Título activo' });
    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ heroTitle: 'Título activo' }),
    }));
  });
});
