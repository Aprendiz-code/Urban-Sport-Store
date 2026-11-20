import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalStorageProvider, StorageProviderNotConfiguredError, SupabaseStorageProvider } from '../../lib/server/storage-provider.js';

const temporaryDirectories: string[] = [];
const pngHeader = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const avifHeader = new Uint8Array([
  0x00, 0x00, 0x00, 0x14,
  0x66, 0x74, 0x79, 0x70,
  0x6d, 0x69, 0x66, 0x31,
  0x00, 0x00, 0x00, 0x00,
  0x61, 0x76, 0x69, 0x66,
]);

async function createTemporaryRoot() {
  const directory = await mkdtemp(join(tmpdir(), 'urban-sport-storage-'));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('local storage provider', () => {
  it('validates image bytes, generates a safe key, and stores only the file', async () => {
    const provider = new LocalStorageProvider(await createTemporaryRoot());
    const asset = await provider.upload({
      area: 'products',
      bytes: pngHeader,
      originalName: '../../unsafe-name.png',
      declaredMimeType: 'image/png',
    });

    expect(asset.storageKey).toMatch(/^products\/[0-9a-f-]{36}\.png$/);
    expect(asset.publicPath).toBeNull();
    expect(await readFile(join((temporaryDirectories[0] as string), ...asset.storageKey.split('/')))).toEqual(Buffer.from(pngHeader));
  });

  it('accepts AVIF files when an AVIF brand appears in the file type box', async () => {
    const provider = new LocalStorageProvider(await createTemporaryRoot());
    const asset = await provider.upload({
      area: 'products',
      bytes: avifHeader,
      originalName: 'product.avif',
      declaredMimeType: 'image/avif',
    });

    expect(asset.storageKey).toMatch(/^products\/[0-9a-f-]{36}\.avif$/);
    expect(asset.mimeType).toBe('image/avif');
    expect(await readFile(join((temporaryDirectories[0] as string), ...asset.storageKey.split('/')))).toEqual(Buffer.from(avifHeader));
  });

  it('rejects mismatched MIME types, oversized files, and traversal keys', async () => {
    const provider = new LocalStorageProvider(await createTemporaryRoot());

    await expect(provider.upload({
      area: 'products',
      bytes: pngHeader,
      originalName: 'file.jpg',
      declaredMimeType: 'image/jpeg',
    })).rejects.toThrow('no coincide');

    await expect(provider.upload({
      area: 'products',
      bytes: new Uint8Array(5 * 1024 * 1024 + 1),
      originalName: 'large.png',
      declaredMimeType: 'image/png',
    })).rejects.toThrow('5 MB');

    await expect(provider.remove('../outside.png')).rejects.toThrow('Ruta de almacenamiento no válida.');
  });

  it('keeps Supabase storage explicitly unconfigured', async () => {
    const provider = new SupabaseStorageProvider();
    await expect(provider.upload({
      area: 'products',
      bytes: pngHeader,
      originalName: 'file.png',
      declaredMimeType: 'image/png',
    })).rejects.toBeInstanceOf(StorageProviderNotConfiguredError);
  });
});
