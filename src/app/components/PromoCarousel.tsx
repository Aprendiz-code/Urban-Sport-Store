import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";

interface PromoCarouselProps {
  messages: string[];
  intervalMs?: number;
  className?: string;
  variant?: "fade" | "slide";
}

export default function PromoCarousel({ messages, intervalMs = 3500, className = "", variant = "fade" }: PromoCarouselProps) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const timerRef = useRef<number | null>(null);
  const isSlide = variant === "slide";

  useEffect(() => {
    if (!messages || messages.length <= 1) return;
    if (paused) return;
    timerRef.current = window.setInterval(() => setIndex((i) => (i + 1) % messages.length), intervalMs);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [messages, intervalMs, paused]);

  const prev = () => setIndex((i) => (i - 1 + messages.length) % messages.length);
  const next = () => setIndex((i) => (i + 1) % messages.length);
  const toggle = () => setPaused((p) => !p);

  return (
    <div
      className={`relative bg-[#1d4ed8] text-white text-center py-2 text-xs font-semibold tracking-wide ${className}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") prev();
        if (e.key === "ArrowRight") next();
        if (e.key === " " || e.key === "Spacebar") toggle();
      }}
      aria-live="polite"
    >
      {isSlide ? (
        <div className="overflow-hidden">
          <div
            className="flex transition-transform duration-700 ease-in-out"
            style={{ width: `${messages.length * 100}%`, transform: `translateX(-${index * (100 / messages.length)}%)` }}
          >
            {messages.map((m, i) => (
              <div key={i} className="flex-shrink-0 w-full flex items-center justify-center px-4 whitespace-nowrap">
                {m}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="relative h-5 flex items-center justify-center overflow-hidden">
          {messages.map((m, i) => (
            <span
              key={i}
              className={`absolute inset-0 flex items-center justify-center transition-opacity duration-700 ease-in-out px-4 whitespace-nowrap ${
                i === index ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-1"
              }`}
              aria-hidden={i === index ? "false" : "true"}
            >
              {m}
            </span>
          ))}
        </div>
      )}

      {/* Controls */}
      <div className="absolute inset-y-0 left-2 flex items-center">
        <button
          onClick={prev}
          aria-label="Anterior"
          className="p-1 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
        >
          <ChevronLeft size={16} />
        </button>
      </div>

      <div className="absolute inset-y-0 right-2 flex items-center gap-1">
        <button
          onClick={toggle}
          aria-label={paused ? "Reanudar" : "Pausar"}
          className="p-1 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
        >
          {paused ? <Play size={14} /> : <Pause size={14} />}
        </button>

        <button
          onClick={next}
          aria-label="Siguiente"
          className="p-1 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
