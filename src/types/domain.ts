export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded' | 'cancelled';
export type OrderStatus = 'pending' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled' | 'refunded';
export type ShipmentStatus = 'pending' | 'preparing' | 'shipped' | 'delivered' | 'returned' | 'cancelled';
export type UserRole = 'CUSTOMER' | 'OWNER' | 'ADMIN' | 'CATALOG_MANAGER' | 'LOGISTICS' | 'ACCOUNTANT';

export interface UserProfile {
  id: string;
  role: UserRole;
  isActive: boolean;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
  phone?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  imagePath?: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface ProductSpecification {
  name: string;
  value: string;
}

export interface Product {
  id: string;
  name: string;
  brand: string;
  price: number;
  originalPrice?: number;
  discount?: number;
  rating: number;
  reviews: number;
  image: string;
  category: string;
  categoryId?: string;
  slug?: string | null;
  subcategory: string;
  stock: number;
  sku: string;
  description: string;
  colors: Array<{ name: string; hex: string }>;
  sizes: string[];
  images?: string[];
  gender?: 'Hombre' | 'Mujer' | 'Unisex';
  isNew?: boolean;
  isFeatured?: boolean;
  isActive?: boolean;
  createdAt?: string;
  specs?: string[];
  specifications?: ProductSpecification[];
}

export interface ProductImage {
  id: string;
  productId?: string;
  categoryId?: string;
  path: string;
  altText: string;
  sortOrder: number;
  isPrimary: boolean;
  mimeType?: string | null;
  sizeBytes?: number | null;
  createdAt?: string;
}

export interface ProductVariant {
  id: string;
  productId: string;
  sku?: string | null;
  size?: string | null;
  color?: string | null;
  colorHex?: string | null;
  price?: number | null;
  stock: number;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface Address {
  id: string;
  label: string;
  recipientName?: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  phone: string;
  isDefault?: boolean;
  userId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CartItem {
  id?: string;
  productId: string;
  variantId?: string | null;
  quantity: number;
  productName?: string;
  unitPrice?: number;
  image?: string | null;
}

export interface CheckoutItem {
  productId: string;
  variantId?: string | null;
  quantity: number;
}

export interface GuestCartItem {
  productId: string;
  quantity: number;
  selectedSize?: string;
  selectedColor?: string;
}

export interface Cart {
  id: string;
  userId?: string | null;
  guestToken?: string | null;
  items: CartItem[];
  createdAt?: string;
  updatedAt?: string;
}

export interface CheckoutRequest {
  addressId: string;
  items: CheckoutItem[];
  couponCode?: string;
  note?: string;
}

export interface OrderItem {
  id?: string;
  orderId?: string;
  productId: string;
  variantId?: string | null;
  productName: string;
  sku?: string | null;
  imagePath?: string | null;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  createdAt?: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  userId?: string | null;
  email: string;
  customerName: string;
  phone?: string | null;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  shipmentStatus: ShipmentStatus;
  currency: 'COP';
  subtotal: number;
  discountAmount: number;
  shippingAmount: number;
  total: number;
  paymentProvider?: string | null;
  paymentReference?: string | null;
  shippingMethod?: string | null;
  trackingNumber?: string | null;
  shippingAddress: Address;
  notes?: string | null;
  items: OrderItem[];
  createdAt: string;
  updatedAt: string;
}

export interface PaymentRecord {
  id: string;
  orderId: string;
  provider?: string | null;
  providerReference?: string | null;
  status: PaymentStatus;
  amount: number;
  currency: 'COP';
  providerPayload?: Record<string, unknown> | null;
  paidAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type Payment = PaymentRecord;

export interface Coupon {
  id: string;
  code: string;
  type: 'percentage' | 'fixed';
  value: number;
  minimumOrderAmount?: number | null;
  maxDiscountAmount?: number | null;
  startsAt?: string | null;
  endsAt?: string | null;
  usageLimit?: number | null;
  usageCount: number;
  perUserLimit?: number | null;
  isActive: boolean;
}

export interface InventoryMovement {
  id: string;
  variantId: string;
  orderId?: string | null;
  type: 'initial' | 'adjustment' | 'reservation' | 'release' | 'sale' | 'return';
  quantity: number;
  previousStock: number;
  resultingStock: number;
  reason?: string | null;
  createdBy?: string | null;
  createdAt: string;
}
