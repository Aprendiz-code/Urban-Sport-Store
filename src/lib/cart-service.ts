import type { Address, CartItem, CheckoutItem, GuestCartItem, Product, ProductVariant } from '../types/domain';

export const CART_STORAGE_KEY = 'urbansport_cart_v1';

export const normalizeGuestCartEntries = (value: unknown): Array<{
  productId: string;
  quantity: number;
  selectedSize?: string;
  selectedColor?: string;
}> => {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const record = entry as Record<string, unknown>;
    const legacyProduct = record.product && typeof record.product === 'object'
      ? record.product as Record<string, unknown>
      : null;
    const productId = typeof record.productId === 'string'
      ? record.productId
      : typeof legacyProduct?.id === 'string'
        ? legacyProduct.id
        : '';
    const quantityValue = record.quantity ?? record.qty;
    const quantity = typeof quantityValue === 'number' ? quantityValue : Number(quantityValue);

    if (!productId || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) return [];

    return [{
      productId,
      quantity,
      ...(typeof record.selectedSize === 'string' ? { selectedSize: record.selectedSize.slice(0, 40) } : {}),
      ...(typeof record.selectedColor === 'string' ? { selectedColor: record.selectedColor.slice(0, 60) } : {}),
    }];
  });
};

export const resolveGuestCartEntries = (entries: GuestCartItem[], products: Product[]) => {
  const productsById = new Map(products.map((product) => [product.id, product]));
  const restoredItems: Array<{ product: Product; qty: number; selectedSize: string; selectedColor: string }> = [];
  const unavailableItems: GuestCartItem[] = [];

  for (const entry of entries) {
    const product = productsById.get(entry.productId);
    const sizeUnavailable = Boolean(entry.selectedSize && entry.selectedSize !== 'Talla única' && !product?.sizes.includes(entry.selectedSize));
    const colorUnavailable = Boolean(entry.selectedColor && !product?.colors.some((color) => color.name === entry.selectedColor));

    if (!product || product.isActive === false || sizeUnavailable || colorUnavailable) {
      unavailableItems.push(entry);
      continue;
    }

    restoredItems.push({
      product,
      qty: entry.quantity,
      selectedSize: entry.selectedSize ?? 'Talla única',
      selectedColor: entry.selectedColor ?? '',
    });
  }

  return { restoredItems, unavailableItems };
};

export type CartMergeIssue = {
  productId: string;
  variantId?: string | null;
  reason: 'stock-exceeded' | 'unavailable' | 'invalid-data';
  message: string;
};

export type CartMergeResult = {
  merged: CheckoutItem[];
  issues: CartMergeIssue[];
};

export const getGuestCart = (): CheckoutItem[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is CheckoutItem => Boolean(item) && typeof item === 'object' && typeof (item as { productId?: string }).productId === 'string');
  } catch {
    return [];
  }
};

export const addGuestCartItem = (productId: string, quantity: number, variantId?: string | null): CheckoutItem[] => {
  const safeQty = Number.isFinite(quantity) ? Number(quantity) : 0;
  if (safeQty <= 0) return getGuestCart();

  const next = [...getGuestCart()];
  const key = `${productId}:${variantId ?? 'default'}`;
  const existingIndex = next.findIndex((item) => `${item.productId}:${item.variantId ?? 'default'}` === key);

  if (existingIndex >= 0) {
    next[existingIndex] = { ...next[existingIndex], quantity: next[existingIndex].quantity + safeQty };
    return next;
  }

  next.push({ productId, variantId, quantity: safeQty });
  return next;
};

export const updateGuestCartItemQuantity = (productId: string, quantity: number, variantId?: string | null): CheckoutItem[] => {
  const safeQty = Number.isFinite(quantity) ? Number(quantity) : 0;
  const next = getGuestCart().filter((item) => !(item.productId === productId && (item.variantId ?? null) === (variantId ?? null)));
  if (safeQty <= 0) {
    return next;
  }

  next.push({ productId, variantId, quantity: safeQty });
  return next;
};

export const removeGuestCartItem = (productId: string, variantId?: string | null): CheckoutItem[] => {
  return getGuestCart().filter((item) => !(item.productId === productId && (item.variantId ?? null) === (variantId ?? null)));
};

export const clearGuestCart = (): CheckoutItem[] => {
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(CART_STORAGE_KEY);
  }
  return [];
};

export const validateCartQuantity = (quantity: number): number => Math.max(1, Math.round(quantity));

export const mergeGuestCartWithAuthenticatedCart = (
  guestItems: CheckoutItem[],
  authenticatedItems: CheckoutItem[] = [],
  availableStock: Record<string, number> = {},
): CartMergeResult => {
  const merged = [...authenticatedItems];
  const issues: CartMergeIssue[] = [];

  for (const guestItem of guestItems) {
    const key = `${guestItem.productId}:${guestItem.variantId ?? 'default'}`;
    const existingIndex = merged.findIndex((item) => `${item.productId}:${item.variantId ?? 'default'}` === key);
    const stockLimit = availableStock[key] ?? Number.MAX_SAFE_INTEGER;
    const nextQty = (existingIndex >= 0 ? merged[existingIndex].quantity : 0) + guestItem.quantity;

    if (nextQty > stockLimit) {
      issues.push({
        productId: guestItem.productId,
        variantId: guestItem.variantId,
        reason: 'stock-exceeded',
        message: `No se pudo conservar ${guestItem.quantity} unidades del producto por falta de stock disponible.`,
      });
      continue;
    }

    if (existingIndex >= 0) {
      merged[existingIndex] = { ...merged[existingIndex], quantity: nextQty };
    } else {
      merged.push({ productId: guestItem.productId, variantId: guestItem.variantId, quantity: guestItem.quantity });
    }
  }

  return { merged, issues };
};

export const getProductAvailabilitySnapshot = (product: { stock?: number | null; id: string; price?: number | null }, variant?: ProductVariant | null) => ({
  id: product.id,
  stock: variant?.stock ?? product.stock ?? 0,
  unitPrice: variant?.price ?? product.price ?? 0,
  isAvailable: (variant?.isActive ?? true) && (variant?.stock ?? product.stock ?? 0) > 0,
});

export const createAddressSnapshot = (address: Partial<Address>) => ({
  id: address.id ?? 'pending-address',
  label: address.label ?? 'Dirección',
  recipientName: address.recipientName ?? address.label ?? 'Cliente',
  line1: address.line1 ?? '',
  line2: address.line2 ?? '',
  city: address.city ?? 'Sin ciudad',
  state: address.state ?? 'Sin departamento',
  postalCode: address.postalCode ?? '',
  country: (address.country ?? 'CO').toUpperCase(),
  phone: address.phone ?? '',
  isDefault: Boolean(address.isDefault),
});
