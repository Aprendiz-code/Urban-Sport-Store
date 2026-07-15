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

  // Marquee (left-to-right) implementation: animate each message across the bar
  const [marqueePos, setMarqueePos] = useState("100%");
  const marqueeRef = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    if (variant !== "marquee") return;
    if (!messages || messages.length === 0) return;
    if (paused) return;

    let cancelled = false;

    const pauseMs = 600; // small pause between messages

    const run = async () => {
      // start off-screen right
      setMarqueePos("100%");
      await new Promise((r) => setTimeout(r, 50));
      if (cancelled) return;
      if (marqueeRef.current) {
        marqueeRef.current.style.transition = `transform ${intervalMs}ms linear`;
      }
      // animate to off-screen left
      setMarqueePos("-100%");
      await new Promise((r) => setTimeout(r, intervalMs));
      if (cancelled) return;
      // advance index
      setIndex((i) => (i + 1) % messages.length);
      if (marqueeRef.current) marqueeRef.current.style.transition = "none";
      // short pause before next message
      await new Promise((r) => setTimeout(r, pauseMs));
      if (cancelled) return;
      run();
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [variant, messages, intervalMs, paused]);

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
      {variant === "marquee" ? (
        <div className="relative overflow-hidden">
          <span
            ref={marqueeRef}
            className="inline-block whitespace-nowrap px-6"
            style={{ transform: `translateX(${marqueePos})` }}
          >
            {messages[index]}
          </span>
        </div>
      ) : isSlide ? (
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
