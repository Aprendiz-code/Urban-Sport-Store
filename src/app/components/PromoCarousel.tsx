import { useEffect, useRef, useState } from "react";

interface PromoCarouselProps {
  messages: string[];
  intervalMs?: number;
  className?: string;
  variant?: "fade" | "slide" | "marquee";
}

export default function PromoCarousel({ messages, intervalMs = 2000, className = "", variant = "fade" }: PromoCarouselProps) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const timerRef = useRef<number | null>(null);
  const isSlide = variant === "slide";

  useEffect(() => {
    if (variant === "marquee") return;
    if (!messages || messages.length <= 1) return;
    if (paused) return;
    timerRef.current = window.setInterval(() => setIndex((i) => (i + 1) % messages.length), intervalMs);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [messages, intervalMs, paused, variant]);

  const prev = () => setIndex((i) => (i - 1 + messages.length) % messages.length);
  const next = () => setIndex((i) => (i + 1) % messages.length);
  const toggle = () => setPaused((p) => !p);

  return (
    <div
      className={`relative bg-black text-white text-center md:h-7 h-auto text-xs md:text-xs text-sm font-semibold tracking-wide ${className}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") prev();
        if (e.key === "ArrowRight") next();
      }}
      aria-live="polite"
    >
      {variant === "marquee" ? (
        <div className="relative flex items-center justify-center overflow-hidden h-full">
          <style>{`
            @keyframes promo-marquee {
              0% { transform: translateX(100%); }
              15% { transform: translateX(0%); }
              75% { transform: translateX(0%); }
              100% { transform: translateX(-100%); }
            }
          `}</style>
          <span
            key={index}
            className="md:whitespace-nowrap whitespace-normal px-3 text-sm leading-tight inline-block"
            style={{
              animationName: "promo-marquee",
              animationDuration: `${intervalMs}ms`,
              animationTimingFunction: "linear",
              animationFillMode: "forwards",
              animationPlayState: paused ? "paused" : "running",
            }}
            onAnimationEnd={() => {
              if (!paused) setIndex((i) => (i + 1) % messages.length);
            }}
          >
            {messages[index]}
          </span>
        </div>
      ) : isSlide ? (
        <div className="relative overflow-hidden h-full">
          <div
            className="flex h-full transition-transform duration-500 ease-in-out"
            style={{ width: `${messages.length * 100}%`, transform: `translateX(-${index * (100 / messages.length)}%)` }}
          >
            {messages.map((m, i) => (
              <div key={i} className="flex-shrink-0 w-full h-full flex items-center justify-center px-3 md:whitespace-nowrap whitespace-normal text-sm leading-tight">
                {m}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="relative h-full flex items-center justify-center overflow-hidden text-sm px-2">
          {messages.map((m, i) => (
            <span
              key={i}
              className={`absolute inset-0 flex items-center justify-center transition-opacity duration-500 ease-in-out px-3 md:whitespace-nowrap whitespace-normal leading-tight ${
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
