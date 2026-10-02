import type { Order, PaymentStatus, ShipmentStatus } from './domain';

export interface StorageUploadRequest {
  area: 'products' | 'categories' | 'banners';
  bytes: Uint8Array;
  originalName: string;
  declaredMimeType: string;
}

export interface StoredAsset {
  storageKey: string;
  publicPath: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  sizeBytes: number;
}

export interface StorageProvider {
  upload(request: StorageUploadRequest): Promise<StoredAsset>;
  remove(storageKey: string): Promise<void>;
}

export interface PaymentIntentRequest {
  orderId: string;
  amountMinorUnits: number;
  currency: 'COP';
  idempotencyKey: string;
}

export interface PaymentIntent {
  providerReference: string;
  status: 'pending';
  redirectUrl?: string;
}

export interface PaymentProvider {
  createIntent(request: PaymentIntentRequest): Promise<PaymentIntent>;
}

export interface VerifiedPaymentEvent {
  providerReference: string;
  orderId: string;
  status: Extract<PaymentStatus, 'paid' | 'failed' | 'cancelled' | 'refunded'>;
  occurredAt: string;
}

export interface PaymentWebhookVerifier {
  verify(rawBody: Uint8Array, headers: Headers): Promise<VerifiedPaymentEvent>;
}

export interface PaymentStatusUpdater {
  applyVerifiedEvent(event: VerifiedPaymentEvent): Promise<void>;
}

export interface ShippingQuoteRequest {
  order: Pick<Order, 'currency' | 'shippingAddress' | 'items'>;
}

export interface ShippingQuote {
  providerReference: string;
  amountMinorUnits: number;
  currency: 'COP';
  estimatedDelivery?: string;
}

export interface ShippingProvider {
  quote(request: ShippingQuoteRequest): Promise<ShippingQuote>;
}

export interface VerifiedShipmentEvent {
  orderId: string;
  status: ShipmentStatus;
  trackingNumber?: string;
  occurredAt: string;
}

export interface ShipmentStatusUpdater {
  applyVerifiedEvent(event: VerifiedShipmentEvent): Promise<void>;
}

export const configuredPaymentProvider: PaymentProvider | null = null;
export const configuredPaymentWebhookVerifier: PaymentWebhookVerifier | null = null;
export const configuredPaymentStatusUpdater: PaymentStatusUpdater | null = null;
export const configuredShippingProvider: ShippingProvider | null = null;
export const configuredShipmentStatusUpdater: ShipmentStatusUpdater | null = null;
export const configuredStorageProvider: StorageProvider | null = null;
