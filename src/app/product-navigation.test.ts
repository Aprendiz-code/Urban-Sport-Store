import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const appSource = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8');
const gallerySource = readFileSync(new URL('./components/ProductGallery.tsx', import.meta.url), 'utf8');
const colorSelectorStart = appSource.indexOf('function ColorSelector(');
const cardStart = appSource.indexOf('function ProductCard(');
const detailStart = appSource.indexOf('// ─── CATALOG PAGE', cardStart);
const colorSelectorSource = appSource.slice(colorSelectorStart, cardStart);
const productCardSource = appSource.slice(cardStart, detailStart);

describe('storefront product navigation', () => {
  it('resets the selected color when a different product is rendered', () => {
    expect(appSource).toContain("setSelectedColorId(product.selectedColorVariantId ?? defaultColor?.productId ?? '')");
    expect(appSource).toContain("const nextDefaultColorId = product.selectedColorVariantId ?? defaultDetailColor?.productId ?? '';");
    expect(appSource).toContain("setSelectedColorId(nextDefaultColorId);");
  });

  it('links the image and name to the selected product slug or ID', () => {
    expect(productCardSource.match(/\/?product=\$\{encodeURIComponent\(product\.slug \?\? product\.id\)\}/g)).toHaveLength(2);
    expect(productCardSource.match(/event\.preventDefault\(\); onSelect\(selectedVariantProduct\);/g)).toHaveLength(2);
    expect(appSource).toContain('navigate("product", p)');
    expect(appSource).toContain('url.searchParams.set("product", selected.slug ?? selected.id)');
  });

  it('keeps favorites and add-to-cart as separate actions and adds without a commercial color name', () => {
    expect(productCardSource).toContain('onClick={() => setWished((value) => !value)}');
    expect(productCardSource).toContain("onClick={() => onAddToCart(selectedVariantProduct, cartSize, '')}");
    expect(productCardSource).not.toContain('onClick={() => { onSelect(selectedVariantProduct); onAddToCart');
    expect(productCardSource).toContain('<span className="sm:hidden">Agregar</span>');
    expect(productCardSource).toContain('aria-label={selectedVariantProduct.stock <= 0 ? `Agotado: ${product.name}` : `Agregar ${product.name} al carrito`}');
  });

  it('shows saved color variants with neutral labels and offers explicit admin linking', () => {
    expect(productCardSource).toContain('colorsToRender.map((color)');
    expect(productCardSource).toContain('aria-label={color.name ? `Seleccionar ${color.name}` : `Seleccionar variante ${orderedColors.indexOf(color) + 1}`}');
    expect(productCardSource).toContain('aria-pressed={isSelected}');
    expect(productCardSource).not.toContain('ring-[#1e3a8a]');
    expect(productCardSource).toContain('className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-transform focus-visible:scale-110 ${isSelected ? "scale-105" : "hover:scale-105"}`}');
    expect(productCardSource).toContain('flex h-8 w-8 shrink-0');
    expect(productCardSource).toContain('className="h-5 w-5 rounded-full border border-slate-400"');
    expect(colorSelectorSource).toContain('h-7 w-7 rounded-full border border-slate-300 transition-transform focus-visible:scale-110');
    expect(productCardSource).toContain("setSelectedSize((currentSize) => nextVariant.sizes.includes(currentSize) ? currentSize : '')");
    expect(productCardSource.indexOf('{requiresSize &&')).toBeLessThan(productCardSource.indexOf('{orderedColors.length > 0'));
    expect(productCardSource.indexOf('{orderedColors.length > 0')).toBeLessThan(productCardSource.indexOf('<span className="price text-sm'));
    expect(productCardSource).toContain('className="h-5 w-5 rounded-full border border-slate-400"');
    expect(productCardSource).toContain('const collapsedColorLimit = 6;');
    expect(productCardSource).toContain('`+${orderedColors.length - collapsedColorLimit}`');
    expect(productCardSource).toContain('aria-live="polite"');
    expect(appSource).toContain('Vincular producto existente como color…');
    expect(appSource).toContain('await updateProduct(sourceProduct.id, {');
    expect(appSource).toContain("toast.success('Producto vinculado como color. Sus datos e imágenes se conservaron.')");
  });

  it('mounts the gallery per selected variant and preserves catalog state', () => {
    expect(appSource).toContain('key={`${product.modelId ?? product.id}-${displayProduct.id}`}');
    expect(appSource).toContain('main_image={displayProduct.image}');
    expect(appSource).toContain('images={displayProduct.images}');
    expect(appSource).toContain('productName={product.name}');
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

  it('does not require shipping data in the product form while carrier integration is pending', () => {
    expect(appSource).not.toContain('Datos de envío');
    expect(appSource).not.toContain('Peso real (g)');
    expect(appSource).not.toContain('Largo del empaque (cm)');
    expect(appSource).not.toContain('Valor declarado (COP)');
    expect(appSource).not.toContain('Unidades por guía');
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
    expect(productCardSource).toContain('disabled={selectedVariantProduct.stock <= 0 || (requiresSize && !selectedSize)}');
    expect(appSource).toContain('const [selectedSize, setSelectedSize] = useState(requiresSize ? "" : displayProduct.sizes[0] ?? "")');
    expect(appSource).toContain('if (displayProduct.stock <= 0 || (requiresSize && !selectedSize)) return false');
    expect(appSource).toContain("nextVariant.sizes.includes(currentSize) ? currentSize : ''");
  });

  it('renders compact product cards in two mobile columns and responsive wider grids', () => {
    expect(appSource).toContain('grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 lg:gap-5 2xl:grid-cols-5');
    expect(productCardSource).toContain('aspect-[4/3] w-full overflow-hidden bg-slate-100');
    expect(productCardSource).toContain('line-clamp-2 break-words font-display text-sm');
    expect(productCardSource).toContain('p-2.5 sm:space-y-3 sm:p-4');
    expect(productCardSource).toContain('<option value="" disabled>Elige talla</option>');
    expect(appSource).toContain('w-[calc((100vw-3.5rem)/2)] max-w-[220px]');
  });

  it('keeps the top benefits banner rotating through multiple messages', () => {
    const messages = appSource.match(/const TOP_BENEFITS_MESSAGES = \[([\s\S]*?)\] as const;/)?.[1];

    expect(messages?.match(/"[^"]+"/g)).toHaveLength(5);
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
