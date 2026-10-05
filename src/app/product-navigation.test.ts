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
    expect(productCardSource).toContain('onClick={() => onAddToCart(product, cartSize, defaultColor)}');
    expect(productCardSource).not.toContain('onClick={() => { onSelect(product); onAddToCart');
  });

  it('resets the existing gallery component for the opened product and preserves catalog state', () => {
    expect(appSource).toContain('<ProductGallery key={product.id} main_image={product.image} images={product.images}');
    expect(appSource).toContain('selectedBrand={catalogBrand}');
    expect(appSource).toContain('sortBy={catalogSort}');
    expect(appSource).toContain('onClick={onBack} className="mb-4 inline-flex');
  });

  it('edits descriptions as plain multiline text and shows an explicit public empty state', () => {
    expect(appSource).toContain('<h4 id="product-information-heading" className="text-sm font-bold text-slate-800">Información del producto</h4>');
    expect(appSource).toContain('value={productForm.description}');
    expect(appSource).toContain('Este producto aún no tiene descripción.');
    expect(appSource).toContain('className="max-w-3xl whitespace-pre-line text-sm leading-7 text-slate-600">{product.description}</p>');
    expect(appSource).not.toContain('dangerouslySetInnerHTML');
  });

  it('renders a bounded product-detail layout with labeled gallery and product information', () => {
    expect(appSource).toContain('lg:grid-cols-[minmax(0,1.08fr)_minmax(20rem,0.92fr)]');
    expect(appSource).toContain('aria-label={`Galería de ${product.name}`}');
    expect(appSource).toContain('aria-label={`Información de ${product.name}`}');
    expect(appSource).toContain('Tallas disponibles');
    expect(appSource).toContain('Descripción del producto');
  });

  it('requires a selected available size before adding size-configured products', () => {
    expect(productCardSource).toContain('aria-label={`Seleccionar talla de ${product.name}`}');
    expect(productCardSource).toContain('disabled={product.stock <= 0 || (requiresSize && !selectedSize)}');
    expect(appSource).toContain('const [selectedSize, setSelectedSize] = useState(requiresSize ? "" : product.sizes[0] ?? "")');
    expect(appSource).toContain('if (product.stock <= 0 || (requiresSize && !selectedSize)) return false');
    expect(appSource).toContain('selectedSize === size');
  });

  it('edits ordered specification pairs and renders them as a semantic table', () => {
    expect(appSource).toContain('aria-label={`Nombre de especificación ${index + 1}`}');
    expect(appSource).toContain('aria-label={`Valor de especificación ${index + 1}`}');
    expect(appSource).toContain('product.specifications.map((specification, index)');
    expect(appSource).toContain('<table className="w-full border-collapse text-left text-sm">');
  });
});