import { useEffect, useState } from "react";
import discountBanner from "../../../img. baner promocional/freepik-modern-cosplay-night-rectangle-banner-202607201936012o54.png";
import nikeP6000Banner from "../../../img. baner promocional/Gemini_Generated_Image_niw358niw358niw3 (1).jfif";
import nikeVomeroBanner from "../../../img. baner promocional/Gemini_Generated_Image_niw358niw358niw3.jfif";
import supernovaRiseBanner from "../../../img. baner promocional/Gemini_Generated_Image_7blvy7blvy7blvy7_sin-descubrir.jpg";
import "./home-promo-carousel.css";

const slides = [
  {
    image: discountBanner,
    alt: "Oferta especial: 10% de descuento en la primera compra",
    label: "Descuento 10%",
    width: 600,
    height: 300,
  },
  {
    image: nikeP6000Banner,
    alt: "Tenis Nike P-6000",
    label: "Nike P-6000",
    width: 1376,
    height: 768,
  },
  {
    image: nikeVomeroBanner,
    alt: "Nuevas tendencias Nike Vomero",
    label: "Nike Vomero",
    width: 1376,
    height: 768,
  },
  {
    image: supernovaRiseBanner,
    alt: "Tenis Adidas Supernova Rise 3",
    label: "Supernova Rise 3",
    width: 1376,
    height: 768,
  },
] as const;

export default function HomePromoCarousel() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotionPreference = () => setPrefersReducedMotion(mediaQuery.matches);
    updateMotionPreference();
    mediaQuery.addEventListener("change", updateMotionPreference);
    return () => mediaQuery.removeEventListener("change", updateMotionPreference);
  }, []);

  useEffect(() => {
    if (prefersReducedMotion) return;
    const timeoutId = window.setTimeout(() => {
      setActiveIndex((index) => (index + 1) % slides.length);
    }, 5000);
    return () => window.clearTimeout(timeoutId);
  }, [activeIndex, prefersReducedMotion]);

  return (
    <section
      className="home-promo-carousel"
      aria-label="Promociones destacadas"
      aria-roledescription="carrusel"
    >
      <div className="home-promo-carousel__viewport" aria-live="off">
        {slides.map((slide, index) => {
          const isActive = index === activeIndex;
          return (
            <div
              key={slide.label}
              className={`home-promo-carousel__slide${isActive ? " is-active" : ""}`}
              role="group"
              aria-roledescription="diapositiva"
              aria-label={`${index + 1} de ${slides.length}: ${slide.label}`}
              aria-hidden={!isActive}
            >
              <img
                src={slide.image}
                alt={slide.alt}
                width={slide.width}
                height={slide.height}
                loading={index === 0 ? "eager" : "lazy"}
                fetchPriority={index === 0 ? "high" : "auto"}
                decoding="async"
                className="home-promo-carousel__image"
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}