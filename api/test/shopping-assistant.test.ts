import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  buildCatalogMessage,
  callGroq,
  detectStructuredIntent,
  filterProducts,
  getGeneralAnswer,
  getPolicyAnswer,
  getSiteKnowledgeAnswer,
  resolveGroqModel,
  type AssistantProduct,
} from '../../lib/shopping-assistant.js';

const products: AssistantProduct[] = [
  { id: '1', name: 'Runner 39', brand: 'Nike', price: 180_000, image: null, slug: 'runner-39', category: 'Tenis Hombre', sizes: ['39', '40'], stock: 5, url: '/catalog?product=runner-39' },
  { id: '2', name: 'Urban Walk', brand: 'Puma', price: 220_000, image: null, slug: 'urban-walk', category: 'Tenis Mujer', sizes: ['40'], stock: null, url: '/catalog?product=urban-walk' },
];

afterEach(() => vi.restoreAllMocks());

describe('shopping assistant deterministic logic', () => {
  it('answers questions about the website sections', () => {
    expect(getSiteKnowledgeAnswer('¿Qué contiene la página?')?.message).toContain('inicio');
    expect(getSiteKnowledgeAnswer('¿Cuáles medios de pago hay?')?.message).toContain('PSE');
  });

  it('answers general questions without WhatsApp or Groq', () => {
    expect(getGeneralAnswer('Hola')?.needsWhatsApp).toBe(false);
    expect(getGeneralAnswer('Qué puedes hacer')?.message).toContain('catálogo');
    expect(getGeneralAnswer('Qué categorías tienen')?.message).toContain('Tenis Hombre');
  });

  it('detects size and budget and filters without Groq', () => {
    const intent = detectStructuredIntent('Tenis talla 39 por menos de $200.000');
    expect(intent.size).toBe('39');
    expect(intent.budget).toBe(200_000);
    expect(filterProducts(products, 'Tenis talla 39 por menos de $200.000').map((product) => product.id)).toEqual(['1']);
  });

  it('marks listed sizes without claiming variant stock', () => {
    const message = buildCatalogMessage([products[1]!], 'talla 40');
    expect(message).toContain('tallas listadas');
    expect(message).not.toMatch(/disponible/i);
  });

  it('returns no invented shipping threshold', () => {
    const answer = getPolicyAnswer('¿El envío es gratis?');
    expect(answer?.message).not.toContain('$300.000');
    expect(answer?.message).not.toContain('$250.000');
  });

  it('derives order and warranty cases to WhatsApp', () => {
    const answer = getPolicyAnswer('Quiero seguimiento de mi pedido y garantía');
    expect(answer?.needsWhatsApp).toBe(true);
  });

  it('discovers an available Groq chat model dynamically', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: [
        { id: 'whisper-large-v3', active: true },
        { id: 'llama-3.1-8b-instant', active: true },
      ],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })));

    await expect(resolveGroqModel('test-key', 1000)).resolves.toBe('llama-3.1-8b-instant');
  });

  it('uses a simulated Groq success without inventing product fields', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: 'La opción Runner 39 tiene un precio real de $180.000 y talla 39 listada.' } }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })));

    const result = await callGroq({ apiKey: 'test-key', model: 'test-model', question: '¿Cuál conviene?', context: [], products: [products[0]!], timeoutMs: 1000 });
    expect(result.kind).toBe('success');
  });

  it('returns rate-limit and timeout outcomes for safe fallback', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 429 })));
    await expect(callGroq({ apiKey: 'test-key', model: 'test-model', question: 'hola', context: [], products: [], timeoutMs: 1000 })).resolves.toEqual({ kind: 'rate_limit' });

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('Aborted', 'AbortError')));
    await expect(callGroq({ apiKey: 'test-key', model: 'test-model', question: 'hola', context: [], products: [], timeoutMs: 1000 })).resolves.toEqual({ kind: 'timeout' });
  });

  it('does not invent a product for an empty result', () => {
    expect(buildCatalogMessage([], 'tenis talla 46')).toContain('No encontré');
  });
});
