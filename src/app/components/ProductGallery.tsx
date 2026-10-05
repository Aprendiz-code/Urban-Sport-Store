import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Expand, X } from 'lucide-react';

import { buildImageGalleryState, getAdjacentImageIndex } from '../../lib/admin-product-images';
import { getPublicUrl, STORAGE_BUCKET } from '../../lib/supabase-store';

interface ProductGalleryProps {
  main_image?: string | null;
  images?: Array<string | null | undefined>;
  productName?: string;
}

export default function ProductGallery({ main_image, images = [], productName = 'Producto' }: ProductGalleryProps) {
  const galleryState = useMemo(
    () => buildImageGalleryState(main_image, images, (path) => getPublicUrl(STORAGE_BUCKET, path)),
    [main_image, images],
  );

  const imagesList = useMemo(
    () => (galleryState.mainImage ? [galleryState.mainImage, ...galleryState.gallery] : []),
    [galleryState.mainImage, galleryState.gallery],
  );

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isExpanded, setIsExpanded] = useState(false);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!imagesList.length) {
      setSelectedIndex(0);
      return;
    }

    setSelectedIndex((previousIndex) => Math.min(previousIndex, imagesList.length - 1));
  }, [imagesList.length]);

  useEffect(() => {
    if (!isExpanded) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsExpanded(false);
        return;
      }

      if (event.key === 'Tab' && dialogRef.current) {
        const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ));
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault();
        setSelectedIndex((previous) => getAdjacentImageIndex(previous, imagesList.length, 'next'));
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        setSelectedIndex((previous) => getAdjacentImageIndex(previous, imagesList.length, 'previous'));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [imagesList.length, isExpanded]);

  useEffect(() => {
    if (!isExpanded) return;
    dialogRef.current?.focus();
  }, [isExpanded]);

  if (!galleryState.hasImages || !imagesList.length) {
    return (
      <div className="aspect-square w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
        <div className="flex h-full items-center justify-center text-sm text-slate-500">
          Sin imágenes disponibles
        </div>
      </div>
    );
  }

  const currentImage = imagesList[selectedIndex];

  const skipToIndex = (nextIndex: number) => {
    setSelectedIndex(Math.min(imagesList.length - 1, Math.max(0, nextIndex)));
  };

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
        <div className="aspect-square w-full overflow-hidden">
          <img
            src={currentImage}
            alt={`${productName} - vista ${selectedIndex + 1}`}
            className="h-full w-full object-contain"
            loading="eager"
          />
        </div>

        {imagesList.length > 1 && (
          <>
            <button
              type="button"
              aria-label="Imagen anterior"
              onClick={() => skipToIndex(getAdjacentImageIndex(selectedIndex, imagesList.length, 'previous'))}
              className="absolute left-3 top-1/2 flex -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white/90 p-2 text-slate-700 shadow-sm transition hover:bg-white"
            >
              <ChevronLeft size={18} />
            </button>

            <button
              type="button"
              aria-label="Imagen siguiente"
              onClick={() => skipToIndex(getAdjacentImageIndex(selectedIndex, imagesList.length, 'next'))}
              className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white/90 p-2 text-slate-700 shadow-sm transition hover:bg-white"
            >
              <ChevronRight size={18} />
            </button>
          </>
        )}

        <button
          type="button"
          aria-label="Ampliar imagen"
          onClick={() => setIsExpanded(true)}
          className="absolute right-3 top-3 flex items-center justify-center rounded-full border border-slate-200 bg-white/90 p-2 text-slate-700 shadow-sm transition hover:bg-white"
        >
          <Expand size={16} />
        </button>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {imagesList.map((src, index) => (
          <button
            key={`${src}-${index}`}
            type="button"
            aria-label={`Ver imagen ${index + 1}`}
            onClick={() => skipToIndex(index)}
            className={`overflow-hidden rounded-xl border-2 transition ${selectedIndex === index ? 'border-[#1d4ed8]' : 'border-slate-200 hover:border-slate-300'}`}
          >
            <div className="aspect-square w-full overflow-hidden">
              <img src={src} alt={`Miniatura ${index + 1}`} className="h-full w-full object-cover" loading="lazy" />
            </div>
          </button>
        ))}
      </div>

      {isExpanded && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4" role="dialog" aria-modal="true" aria-label={`${productName} vista ampliada`}>
          <div ref={dialogRef} tabIndex={-1} className="relative w-full max-w-5xl rounded-[28px] border border-slate-200 bg-white p-4 shadow-2xl outline-none">
            <button
              type="button"
              aria-label="Cerrar vista ampliada"
              onClick={() => setIsExpanded(false)}
              className="absolute right-4 top-4 z-10 flex items-center justify-center rounded-full border border-slate-200 bg-white p-2 text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <X size={18} />
            </button>

            <div className="relative overflow-hidden rounded-2xl bg-slate-50">
              <div className="flex aspect-[4/3] items-center justify-center">
                <img src={currentImage} alt={`${productName} ampliada`} className="h-full w-full object-contain" />
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between gap-3">
              <button
                type="button"
                aria-label="Imagen anterior"
                onClick={() => setSelectedIndex((previous) => getAdjacentImageIndex(previous, imagesList.length, 'previous'))}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <ChevronLeft size={16} /> Anterior
              </button>

              <span className="text-sm font-medium text-slate-600">
                {selectedIndex + 1} / {imagesList.length}
              </span>

              <button
                type="button"
                aria-label="Imagen siguiente"
                onClick={() => setSelectedIndex((previous) => getAdjacentImageIndex(previous, imagesList.length, 'next'))}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Siguiente <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}