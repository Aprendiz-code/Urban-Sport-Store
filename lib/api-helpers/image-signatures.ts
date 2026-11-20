export function hasAvifSignature(bytes: Uint8Array): boolean {
  if (bytes.length < 16 || String.fromCharCode(...bytes.subarray(4, 8)) !== 'ftyp') return false;

  const boxSize = bytes[0] * 0x1000000 + bytes[1] * 0x10000 + bytes[2] * 0x100 + bytes[3];
  if (boxSize < 16 || boxSize > bytes.length || (boxSize - 16) % 4 !== 0) return false;

  const hasAvifBrand = (offset: number) => {
    const brand = String.fromCharCode(...bytes.subarray(offset, offset + 4));
    return brand === 'avif' || brand === 'avis';
  };

  if (hasAvifBrand(8)) return true;
  for (let offset = 16; offset + 4 <= boxSize; offset += 4) {
    if (hasAvifBrand(offset)) return true;
  }
  return false;
}
