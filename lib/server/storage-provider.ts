import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import type { StorageProvider, StorageUploadRequest, StoredAsset } from '../../src/types/providers.js';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const STORAGE_KEY_PATTERN = /^(products|categories|banners)\/[0-9a-f-]{36}\.(jpg|png|webp)$/;

export class StorageProviderNotConfiguredError extends Error {
  constructor() {
    super('El proveedor de almacenamiento no está configurado.');
  }
}

function imageMimeFromBytes(bytes: Uint8Array): StoredAsset['mimeType'] | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    bytes.length >= 8
    && bytes[0] === 0x89
    && bytes[1] === 0x50
    && bytes[2] === 0x4e
    && bytes[3] === 0x47
    && bytes[4] === 0x0d
    && bytes[5] === 0x0a
    && bytes[6] === 0x1a
    && bytes[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (
    bytes.length >= 12
    && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF'
    && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

function extensionForMime(mimeType: StoredAsset['mimeType']): string {
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/png') return 'png';
  return 'webp';
}

function resolveInsideRoot(rootDirectory: string, storageKey: string): string {
  const fullPath = resolve(rootDirectory, ...storageKey.split('/'));
  const relativePath = relative(rootDirectory, fullPath);
  if (!relativePath || relativePath === '..' || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
    throw new Error('Ruta de almacenamiento no válida.');
  }
  return fullPath;
}

export class LocalStorageProvider implements StorageProvider {
  private readonly rootDirectory: string;

  constructor(rootDirectory: string) {
    if (!isAbsolute(rootDirectory)) {
      throw new Error('El directorio de almacenamiento debe ser absoluto.');
    }
    this.rootDirectory = resolve(rootDirectory);
  }

  async upload(request: StorageUploadRequest): Promise<StoredAsset> {
    if (request.bytes.byteLength === 0 || request.bytes.byteLength > MAX_IMAGE_BYTES) {
      throw new Error('La imagen debe tener un tamaño entre 1 byte y 5 MB.');
    }

    const mimeType = imageMimeFromBytes(request.bytes);
    if (!mimeType || mimeType !== request.declaredMimeType) {
      throw new Error('El contenido de la imagen no coincide con un formato permitido.');
    }

    const storageKey = `${request.area}/${randomUUID()}.${extensionForMime(mimeType)}`;
    const destination = resolveInsideRoot(this.rootDirectory, storageKey);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, request.bytes, { flag: 'wx', mode: 0o640 });

    return {
      storageKey,
      publicPath: null,
      mimeType,
      sizeBytes: request.bytes.byteLength,
    };
  }

  async remove(storageKey: string): Promise<void> {
    if (!STORAGE_KEY_PATTERN.test(storageKey)) {
      throw new Error('Ruta de almacenamiento no válida.');
    }
    await unlink(resolveInsideRoot(this.rootDirectory, storageKey));
  }
}

export class SupabaseStorageProvider implements StorageProvider {
  async upload(_request: StorageUploadRequest): Promise<StoredAsset> {
    throw new StorageProviderNotConfiguredError();
  }

  async remove(_storageKey: string): Promise<void> {
    throw new StorageProviderNotConfiguredError();
  }
}
