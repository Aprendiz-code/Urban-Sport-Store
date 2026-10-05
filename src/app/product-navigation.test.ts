import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const appSource = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8');
const cardStart = appSource.indexOf('function ProductCard(');
const detailStart = appSource.indexOf('// ─── CATALOG PAGE', cardStart);
const productCardSource = appSource.slice(cardStart, detailStart);

describe('storefront product navigation', () => {
  it('links the image and name to the selected product slug or ID', () => {
    expect(productCardSource.match(/\/\?product=\$\{encodeURIComponent\(product\.slug \?\? product\.id\)\}/g)).toHaveLength(2);
    expect(productCardSource.match(/event\.preventDefault\(\); onSelect\(product\);/g)).toHaveLength(2);
    expect(appSource).toContain('navigate("product", p)');
    expect(appSource).toContain('url.searchParams.set("product", selected.slug ?? selected.id)');
  });

  it('keeps favorites and add-to-cart as separate actions', () => {
    expect(productCardSource).toContain('onClick={() => setWished((value) => !value)}');
    expect(productCardSource).toContain('onClick={() => onAddToCart(product, defaultSize, defaultColor)}');
    expect(productCardSource).not.toContain('onClick={() => { onSelect(product); onAddToCart');
  });

  it('resets the existing gallery component for the opened product and preserves catalog state', () => {
    expect(appSource).toContain('<ProductGallery key={product.id} main_image={product.image} images={product.images}');
    expect(appSource).toContain('selectedBrand={catalogBrand}');
    expect(appSource).toContain('sortBy={catalogSort}');
    expect(appSource).toContain('onClick={onBack} className="mb-4 inline-flex');
  });
});