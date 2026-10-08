import { useEffect, useState } from "react";
import trendsBanner from "../../../img. baner promocional/Gemini_Generated_Image_niw358niw358niw3.jfif";
import promotionBanner from "../../../img. baner promocional/Designer (3).png";
import sportsOfferBanner from "../../../img. baner promocional/Designer (4).png";
import collectionBanner from "../../../img. baner promocional/Designer (5).png";
import "./home-promo-carousel.css";

const slides = [
  {
    image: trendsBanner,
    alt: "Nuevas tendencias UrbanSport Store",
    label: "Nuevas tendencias UrbanSport Store",
    width: 1376,
    height: 768,
  },
  {
    image: promotionBanner,
    alt: "Promoción UrbanSport Store",
    label: "Promoción UrbanSport Store",
    width: 1536,
    height: 1024,
  },
  {
    image: sportsOfferBanner,
    alt: "Oferta deportiva UrbanSport Store",
    label: "Oferta deportiva UrbanSport Store",
    width: 1536,
    height: 1024,
  },
  {
    image: collectionBanner,
    alt: "Colección deportiva UrbanSport Store",
    label: "Colección deportiva UrbanSport Store",
    width: 1536,
    height: 1024,
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