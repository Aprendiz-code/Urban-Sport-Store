import type { Product, ProductColor } from '../types/domain';

export function groupProductsByModel(products: Product[]): Product[] {
  const grouped = new Map<string, Product[]>();
  for (const product of products) {
    const modelId = product.modelId || product.id;
    const siblings = grouped.get(modelId) ?? [];
    siblings.push(product);
    grouped.set(modelId, siblings);
  }

  return [...grouped.entries()].map(([modelId, siblings]) => {
    const ordered = [...siblings].sort((left, right) => (
      (left.modelSortOrder ?? 0) - (right.modelSortOrder ?? 0)
      || Number(right.id === modelId) - Number(left.id === modelId)
      || left.id.localeCompare(right.id)
    ));
    const root = ordered.find((product) => product.id === modelId) ?? ordered[0];
    const colors: ProductColor[] = ordered.flatMap((variant, index) => {
      if (!variant.colorHex) return [];
      return [{
        id: variant.id,
        productId: variant.id,
        name: variant.colorName?.trim() || '',
        hex: variant.colorHex,
        ...(variant.colorHex2 ? { hex2: variant.colorHex2 } : {}),
        image: variant.image,
        images: variant.images ?? [],
        isDefault: variant.isDefaultColor ?? false,
        sortOrder: variant.modelSortOrder ?? 0,
        price: variant.price,
        originalPrice: variant.originalPrice,
        discount: variant.discount,
        stock: variant.stock,
        sku: variant.sku,
        sizes: variant.sizes,
        isActive: variant.isActive !== false,
      }];
    });
    const defaultColor = colors.find((color) => color.isDefault) ?? colors[0];

    return {
      ...root,
      id: modelId,
      modelId: siblings.length > 1 ? modelId : root.modelId,
      colors,
      selectedColorVariantId: defaultColor?.productId,
    };
  });
}

export function productForColor(product: Product, colorId?: string): Product {
  const color = product.colors.find((candidate) => candidate.productId === colorId)
    ?? product.colors.find((candidate) => candidate.isDefault)
    ?? product.colors[0];
  if (!color) return product;

  const ownImages = (color.images ?? []).filter((value, index, all) => (
    typeof value === 'string'
    && value.trim().length > 0
    && all.findIndex((candidate) => candidate?.trim() === value.trim()) === index
  ));
  const ownImage = typeof color.image === 'string' ? color.image.trim() : '';
  const fallbackMainImage = ownImages[0] || product.image;
  const image = ownImage || fallbackMainImage;
  const images = ownImage
    ? (ownImages.length ? ownImages : (product.images ?? []))
    : (ownImages.length ? ownImages.slice(1) : (product.images ?? []));

  return {
    ...product,
    id: color.productId,
    modelId: product.modelId ?? product.id,
    selectedColorVariantId: color.productId,
    colorHex: color.hex,
    colorHex2: color.hex2 ?? null,
    colorName: color.name,
    isDefaultColor: color.isDefault ?? false,
    modelSortOrder: color.sortOrder ?? 0,
    image,
    images,
    price: color.price,
    originalPrice: color.originalPrice,
    discount: color.discount,
    stock: color.stock,
    sku: color.sku,
    sizes: color.sizes,
  };
}