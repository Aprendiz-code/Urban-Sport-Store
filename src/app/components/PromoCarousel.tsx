import { useEffect, useRef, useState } from "react";

interface PromoCarouselProps {
  messages: string[];
  intervalMs?: number;
  className?: string;
  variant?: "fade" | "slide";
}

export default function PromoCarousel({ messages, intervalMs = 2000, className = "", variant = "fade" }: PromoCarouselProps) {
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
      className={`relative bg-[#1d4ed8] text-white text-center py-3 text-sm font-semibold tracking-wide ${className}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") prev();
        if (e.key === "ArrowRight") next();
      }}
      aria-live="polite"
    >
      {isSlide ? (
        <div className="overflow-hidden">
          <div
            className="flex transition-transform duration-500 ease-in-out"
            style={{ width: `${messages.length * 100}%`, transform: `translateX(-${index * (100 / messages.length)}%)` }}
          >
            {messages.map((m, i) => (
              <div key={i} className="flex-shrink-0 w-full flex items-center justify-center px-6 whitespace-nowrap text-sm">
                {m}
              </div>
            ))}
          </div>
        </div>
      ) : (
          <div className="relative h-8 flex items-center justify-center overflow-hidden text-sm">
          {messages.map((m, i) => (
            <span
              key={i}
                className={`absolute inset-0 flex items-center justify-center transition-opacity duration-500 ease-in-out px-6 whitespace-nowrap ${
                i === index ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-1"
              }`}
              aria-hidden={i === index ? "false" : "true"}
            >
              {m}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
