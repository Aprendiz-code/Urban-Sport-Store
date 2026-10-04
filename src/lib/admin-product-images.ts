export interface ProductImageUrls {
  mainImage: string;
  gallery: string[];
}

export async function uploadQueuedProductImages<TFile>(
  files: readonly TFile[],
  initialUrls: ProductImageUrls,
  upload: (file: TFile) => Promise<{ path: string }>,
  getPublicUrl: (path: string) => string,
  onUploaded?: (file: TFile, urls: ProductImageUrls) => void,
): Promise<ProductImageUrls> {
  const urls: ProductImageUrls = {
    mainImage: initialUrls.mainImage,
    gallery: [...initialUrls.gallery],
  };

  for (const file of files) {
    const uploaded = await upload(file);
    if (!uploaded.path) throw new Error('Storage no devolvió la ruta de la imagen subida.');

    const publicUrl = getPublicUrl(uploaded.path);
    if (!urls.mainImage) {
      urls.mainImage = publicUrl;
    } else {
      urls.gallery.push(publicUrl);
    }
    onUploaded?.(file, { mainImage: urls.mainImage, gallery: [...urls.gallery] });
  }

  return urls;
}