import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface ProductCarouselProps {
  children: React.ReactNode;
  className?: string;
  showControls?: boolean;
  autoScroll?: boolean;
  autoScrollDirection?: "ltr" | "rtl";
  gap?: "sm" | "md" | "lg";
}

export default function ProductCarousel({
  children,
  className = "",
  showControls = true,
  autoScroll = false,
  autoScrollDirection = "ltr",
  gap = "md",
}: ProductCarouselProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const autoScrollInterval = useRef<NodeJS.Timeout | null>(null);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const scrollLeft = useRef(0);

  const checkScroll = () => {
    if (!ref.current) return;
    const { scrollLeft: sl, scrollWidth: sw, clientWidth: cw } = ref.current;
    setCanScrollLeft(sl > 1);
    setCanScrollRight(sl + cw < sw - 1);
  };

  const scroll = (direction: "left" | "right") => {
    if (!ref.current) return;
    const scrollAmount = ref.current.clientWidth * 0.8;
    ref.current.scrollBy({
      left: direction === "left" ? -scrollAmount : scrollAmount,
      behavior: "smooth",
    });
    setTimeout(checkScroll, 600);
  };

  // Auto-scroll on mouse enter/leave
  const startAutoScroll = () => {
    if (!autoScroll || autoScrollInterval.current) return;
    autoScrollInterval.current = setInterval(() => {
      if (ref.current && !isDragging.current) {
        const { scrollLeft: sl, scrollWidth: sw, clientWidth: cw } = ref.current;
        // Auto-scroll direction handling
        const amount = autoScrollDirection === "rtl" ? -200 : 200;
        if (autoScrollDirection === "ltr") {
          if (sl + cw >= sw - 10) {
            ref.current.scrollTo({ left: 0, behavior: "smooth" });
          } else {
            ref.current.scrollBy({ left: amount, behavior: "smooth" });
          }
        } else {
          // rtl: if we reached the start, jump to the end
          if (sl <= 0) {
            ref.current.scrollTo({ left: sw - cw, behavior: "smooth" });
          } else {
            ref.current.scrollBy({ left: amount, behavior: "smooth" });
          }
        }
      }
    }, 3000);
  };

  const stopAutoScroll = () => {
    if (autoScrollInterval.current) {
      clearInterval(autoScrollInterval.current);
      autoScrollInterval.current = null;
    }
  };

  useEffect(() => {
    checkScroll();
    window.addEventListener("resize", checkScroll);
    return () => window.removeEventListener("resize", checkScroll);
  }, [children]);

  const gapClass = {
    sm: "gap-2",
    md: "gap-3 sm:gap-4",
    lg: "gap-4 sm:gap-5",
  }[gap];

  return (
    <div className={`relative group ${className}`}>
      {/* Carousel */}
      <div
        ref={ref}
        className={`flex overflow-x-auto scrollbar-hide scroll-smooth snap-x snap-mandatory ${gapClass} pb-2`}
        style={{
          scrollBehavior: "smooth",
          WebkitOverflowScrolling: "touch",
        }}
        onScroll={checkScroll}
        onMouseDown={(e) => {
          isDragging.current = true;
          startX.current = e.pageX - (ref.current?.offsetLeft || 0);
          scrollLeft.current = ref.current?.scrollLeft || 0;
        }}
        onMouseUp={() => {
          isDragging.current = false;
          checkScroll();
        }}
        onMouseMove={(e) => {
          if (!isDragging.current || !ref.current) return;
          const x = e.pageX - (ref.current?.offsetLeft || 0);
          const walk = (x - startX.current) * 1.5;
          ref.current.scrollLeft = scrollLeft.current - walk;
          checkScroll();
        }}
        onMouseLeave={() => {
          isDragging.current = false;
          checkScroll();
        }}
      >
        {children}
      </div>

      {/* Controls */}
      {showControls && (
        <div className="mt-3 flex justify-end gap-2">
          {canScrollLeft && (
            <button
              type="button"
              onClick={() => scroll("left")}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-md border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
              aria-label="Desplazar izquierda"
            >
              <ChevronLeft size={20} />
            </button>
          )}

          {canScrollRight && (
            <button
              type="button"
              onClick={() => scroll("right")}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-md border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
              aria-label="Desplazar derecha"
            >
              <ChevronRight size={20} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
