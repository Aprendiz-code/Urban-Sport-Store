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
  const [canScrollRight, setCanScrollRight] = useState(true);
  const autoScrollInterval = useRef<NodeJS.Timeout | null>(null);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const scrollLeft = useRef(0);

  const checkScroll = () => {
    if (!ref.current) return;
    const { scrollLeft: sl, scrollWidth: sw, clientWidth: cw } = ref.current;
    setCanScrollLeft(sl > 0);
    setCanScrollRight(sl + cw < sw - 10);
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
  }, []);

  useEffect(() => {
    const carousel = ref.current;
    if (!carousel) return;
    carousel.addEventListener("scroll", checkScroll);
    return () => carousel.removeEventListener("scroll", checkScroll);
  }, []);

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
        className={`flex overflow-x-auto scroll-smooth snap-x snap-mandatory ${gapClass} pb-2`}
        style={{
          scrollBehavior: "smooth",
          WebkitOverflowScrolling: "touch",
          scrollbarWidth: "none",
        }}
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
        <style>{`
          div::-webkit-scrollbar { display: none; }
        `}</style>
        {children}
      </div>

      {/* Controls */}
      {showControls && (
        <>
          {/* Left button */}
          {canScrollLeft && (
            <button
              onClick={() => scroll("left")}
              className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-12 md:-translate-x-16 z-10 p-2 rounded-full bg-white shadow-lg border border-slate-200 text-slate-700 hover:bg-slate-50 transition-all opacity-0 group-hover:opacity-100"
              aria-label="Desplazar izquierda"
            >
              <ChevronLeft size={20} />
            </button>
          )}

          {/* Right button */}
          {canScrollRight && (
            <button
              onClick={() => scroll("right")}
              className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-12 md:translate-x-16 z-10 p-2 rounded-full bg-white shadow-lg border border-slate-200 text-slate-700 hover:bg-slate-50 transition-all opacity-0 group-hover:opacity-100"
              aria-label="Desplazar derecha"
            >
              <ChevronRight size={20} />
            </button>
          )}
        </>
      )}
    </div>
  );
}
