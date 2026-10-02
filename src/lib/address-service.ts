import type { Address } from '../types/domain';

const STORAGE_KEY = 'urbansport_addresses';

const isBrowser = () => typeof window !== 'undefined';

const normalizeAddressFromStorage = (value: unknown): Address | null => {
  if (!value || typeof value !== 'object') return null;
  const record = value as Partial<Address>;
  if (!record.id || !record.city || !record.line1 || !record.phone || !record.country) return null;
  return {
    id: String(record.id),
    label: record.label ?? 'Dirección',
    recipientName: record.recipientName ?? record.label ?? 'Cliente',
    line1: String(record.line1),
    line2: record.line2 ?? undefined,
    city: String(record.city),
    state: record.state ?? 'Sin departamento',
    postalCode: record.postalCode ?? '',
    country: String(record.country).toUpperCase(),
    phone: String(record.phone),
    isDefault: Boolean(record.isDefault),
    userId: record.userId,
  };
};

export const listMyAddresses = async (): Promise<Address[]> => {
  if (!isBrowser()) return [];
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeAddressFromStorage).filter((value): value is Address => Boolean(value));
  } catch {
    return [];
  }
};

export const createAddress = async (input: Omit<Address, 'id'> & { id?: string }): Promise<Address> => {
  const nextId = input.id ?? `addr-${Date.now()}`;
  const address: Address = {
    ...input,
    id: nextId,
    label: input.label || input.recipientName || 'Dirección',
    country: (input.country || 'CO').toUpperCase(),
    isDefault: input.isDefault ?? true,
  };

  const current = await listMyAddresses();
  const nextAddresses = current.filter((entry) => entry.id !== address.id);
  const rewritten = address.isDefault ? nextAddresses.map((entry) => ({ ...entry, isDefault: false })) : nextAddresses;

  if (isBrowser()) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...rewritten, address]));
  }

  return address;
};

export const updateAddress = async (addressId: string, updates: Partial<Address>): Promise<Address | null> => {
  const current = await listMyAddresses();
  const index = current.findIndex((entry) => entry.id === addressId);
  if (index < 0) return null;

  const nextAddress = { ...current[index], ...updates, country: (updates.country ?? current[index].country ?? 'CO').toUpperCase() };
  const nextAddresses = current.map((entry) => {
    if (entry.id === addressId) return nextAddress;
    if (updates.isDefault) return { ...entry, isDefault: false };
    return entry;
  });

  if (isBrowser()) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextAddresses));
  }

  return nextAddress;
};

export const deleteAddress = async (addressId: string): Promise<boolean> => {
  const current = await listMyAddresses();
  const next = current.filter((entry) => entry.id !== addressId);
  if (isBrowser()) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }
  return next.length !== current.length;
};

export const setDefaultAddress = async (addressId: string): Promise<Address | null> => {
  const current = await listMyAddresses();
  const index = current.findIndex((entry) => entry.id === addressId);
  if (index < 0) return null;

  const nextAddresses = current.map((entry) => ({ ...entry, isDefault: entry.id === addressId }));
  if (isBrowser()) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextAddresses));
  }

  return nextAddresses[index] ?? null;
};
