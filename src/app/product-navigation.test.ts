import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const appSource = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8');
const gallerySource = readFileSync(new URL('./components/ProductGallery.tsx', import.meta.url), 'utf8');
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
    expect(productCardSource).toContain('<span className="sm:hidden">Agregar</span>');
    expect(productCardSource).toContain('aria-label={product.stock <= 0 ? `Agotado: ${product.name}` : `Agregar ${product.name} al carrito`}');
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

  it('renders compact product cards in two mobile columns and responsive wider grids', () => {
    expect(appSource).toContain('grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 lg:gap-5 2xl:grid-cols-5');
    expect(appSource).toContain('aspect-square w-full overflow-hidden bg-slate-100 sm:aspect-[4/3]');
    expect(productCardSource).toContain('line-clamp-2 break-words font-display text-sm');
    expect(productCardSource).toContain('p-2.5 sm:space-y-3 sm:p-4');
    expect(productCardSource).toContain('<option value="" disabled>Elige talla</option>');
    expect(appSource).toContain('w-[calc((100vw-3.5rem)/2)] max-w-[220px]');
  });

  it('keeps the top benefits banner rotating through multiple messages', () => {
    const messages = appSource.match(/const TOP_BENEFITS_MESSAGES = \[([\s\S]*?)\] as const;/)?.[1];

    expect(messages?.match(/"[^"]+"/g)).toHaveLength(3);
    expect(appSource).toContain('if (benefits.length < 2 || isPaused || !isPageVisible) return;');
    expect(appSource).toContain('}, 4000);');
  });

  it('edits ordered specification pairs and renders them as a semantic table', () => {
    expect(appSource).toContain('aria-label={`Nombre de especificación ${index + 1}`}');
    expect(appSource).toContain('aria-label={`Valor de especificación ${index + 1}`}');
    expect(appSource).toContain('product.specifications.map((specification, index)');
    expect(appSource).toContain('<table className="w-full border-collapse text-left text-sm">');
  });

  it('removes main-image arrows and counter while preserving zoom, thumbnails, modal controls, and swipe', () => {
    const mainImageArea = gallerySource.slice(
      gallerySource.indexOf('<div className="relative overflow-hidden rounded-2xl border'),
      gallerySource.indexOf('<div className="-mx-1 flex min-w-0 gap-3'),
    );

    expect(mainImageArea).not.toContain('aria-label="Imagen anterior"');
    expect(mainImageArea).not.toContain('aria-label="Imagen siguiente"');
    expect(mainImageArea).not.toContain('{selectedIndex + 1} / {imagesList.length}');
    expect(mainImageArea).toContain('aria-label="Ampliar imagen"');
    expect(mainImageArea).toContain('onTouchStart={handleMainImageTouchStart}');
    expect(mainImageArea).toContain('onTouchEnd={handleMainImageTouchEnd}');
    expect(gallerySource).toContain('aria-label={`Ver imagen ${index + 1}`}');
    expect(gallerySource).toContain('aria-label="Imagen anterior"');
    expect(gallerySource).toContain('aria-label="Imagen siguiente"');
  });
});