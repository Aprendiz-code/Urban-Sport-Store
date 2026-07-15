import { useEffect, useState } from "react";

interface PromoCarouselProps {
  messages: string[];
  intervalMs?: number;
  className?: string;
}

export default function PromoCarousel({ messages, intervalMs = 3500, className = "" }: PromoCarouselProps) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!messages || messages.length <= 1) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % messages.length), intervalMs);
    return () => clearInterval(t);
  }, [messages, intervalMs]);

  return (
    <div className={`bg-[#1d4ed8] text-white text-center py-2 text-xs font-semibold tracking-wide ${className}`} aria-live="polite">
      <span key={index} className="inline-block transition-opacity duration-500">
        {messages[index]}
      </span>
    </div>
  );
}
