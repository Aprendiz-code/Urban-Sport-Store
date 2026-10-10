import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import type { User } from '@supabase/supabase-js';
import {
  ShoppingCart, Search, X, Star, ChevronRight, Package, Archive,
  Users, UserRound, TrendingUp, AlertTriangle, Check, Eye, EyeOff,
  Bell, LogOut, Plus, Minus, Trash2, MapPin,
  Truck, ChevronLeft, ChevronUp, ChevronDown, Heart, ArrowRight, Filter,
  BarChart2, Home, Settings, Tag, Layers, Edit,
  RefreshCw, Award, Grid3X3, ThumbsUp, DollarSign, LoaderCircle,
  Menu, PanelLeftClose, PanelLeftOpen, MoreHorizontal
} from "lucide-react";
import "./admin-panel.css";
import HorizontalProductCarousel from "./components/ProductCarousel";
import CategoryBar from "./components/CategoryBar";
import HomePromoCarousel from "./components/HomePromoCarousel";
import { STORE_CONFIG } from "./store-config";

import { subscribeToNewsletter } from "../lib/newsletter";
import { fetchPublicCategories, resolveProductCategoryName, type CategoryOption } from "../lib/category-service";
// promoRibbon moved to src/assets/cinta-10.png
import type { ProductRecord } from "../lib/supabase-store";
import { createProductViaAdminApi, updateProductViaAdminApi } from "../lib/admin-product-fallback";
import {
  signInWithEmail,
  signUpWithEmail,
  getSignUpErrorMessage,
  signOut,
  getCurrentUser,
  onAuthStateChange,
  logAuthDiagnostic,
  requestPasswordRecovery,
  updatePassword,
} from "../lib/supabase-auth";
import { getMyProfile, getProfileAccess, ProfileAccessVerificationError, updateMyProfile } from "../lib/profile-service";
import { getAdminPanelMenuLink } from "./admin-panel-menu";
import { resolveApiBaseUrl } from "../lib/api-config";

import adminApi, { AdminApiError, createSupabaseProductApi, updateSupabaseProductApi, deleteSupabaseProductApi, updateHomeContentApi, formatAdminApiError, isAdminAuthenticationError, type ProductArchiveResult } from "../lib/admin-api";
import { uploadProductImage, getPublicUrl, STORAGE_BUCKET } from "../lib/supabase-store";
import { recordAction } from "../lib/audit";
import { productSchema } from '../lib/schemas';
import { normalizeGuestCartEntries, resolveGuestCartEntries } from '../lib/cart-service';
import { getMyOrder, listMyOrders } from '../lib/order-service';
import { createPendingOrder, createWompiPaymentSession } from '../lib/order-service';
import { MAX_PRODUCT_GALLERY_IMAGES, MAX_PRODUCT_TOTAL_IMAGES, normalizeProductSizes, normalizeProductSpecifications, submitAdminProductForm, validateProductForm } from '../lib/admin-product-form';
import { buildAdminProductPayload } from '../lib/admin-product-payload';
import { filterAdminProducts, type AdminProductStatusFilter } from '../lib/admin-product-list';
import { normalizeProductImageList, resolveProductPublicImageUrl, uploadSelectedProductImages } from '../lib/admin-product-images';
import ProductGallery from './components/ProductGallery';
import Toaster from './components/LazyToaster';
import { toast } from '../lib/lazyToast';
import type { Address as DomainAddress, GuestCartItem, Order, Product as DomainProduct } from '../types/domain';

// ─── TYPES ───────────────────────────────────────────────────────────────────

type View =
  | "home" | "catalog" | "product" | "checkout"
  | "login" | "register" | "account"
  | "admin-login" | "admin" | "password-reset"
  | "privacy" | "terms" | "shipping" | "returns" | "contact";
type ProductsStatus = "loading" | "ready" | "error";
function getInitialView(): View {
  if (typeof window === "undefined") return "home";
  const { pathname, search } = window.location;
  const query = new URLSearchParams(search);
  const hash = new URLSearchParams(window.location.hash.slice(1));
  if (pathname === "/reset-password" || query.get("type") === "recovery" || hash.get("type") === "recovery") return "password-reset";
  if (query.get("product")) return "product";
  if (query.get("view") === "catalog") return "catalog";
  if (pathname === "/admin/login") return "admin-login";
  if (pathname === "/admin" || pathname.startsWith("/admin/") || new URLSearchParams(search).get("view") === "admin") return "admin";
  if (pathname === "/login") return "login";
  if (pathname === "/register") return "register";
  if (pathname === "/privacidad") return "privacy";
  if (pathname === "/terminos") return "terms";
  if (pathname === "/politica-de-privacidad") return "privacy";
  if (pathname === "/terminos-y-condiciones") return "terms";
  if (pathname === "/envios") return "shipping";
  if (pathname === "/cambios-y-devoluciones") return "returns";
  if (pathname === "/contacto") return "contact";
  return "home";
}

function getInitialAdminSection(): string | undefined {
  if (typeof window === "undefined") return undefined;
  const sectionParam = new URLSearchParams(window.location.search).get("adminSection");
  if (sectionParam) return sectionParam;
  if (window.location.pathname === "/admin/login") return undefined;
  const pathSection = window.location.pathname.match(/^\/admin\/([^/]+)/)?.[1];
  const existingSections = ["dashboard", "homepage", "products", "orders", "inventory", "coupons", "reports", "activity", "settings"];
  return pathSection && existingSections.includes(pathSection) ? pathSection : undefined;
}

type Category = string;
type Product = DomainProduct;
type AdminProductImageSelection = { id: string; src: string; permanentUrl?: string; file?: File; previewUrl?: string };

const HOME_NAV_CATEGORIES = [
  { name: "Tenis", filterCategory: "Running" },
  { name: "Ropa Hombre", filterCategory: null },
  { name: "Ropa Mujer", filterCategory: null },
  { name: "Perfumes", filterCategory: null },
  { name: "Relojes", filterCategory: null },
  { name: "Gafas", filterCategory: null },
] as const;

const HOME_COLLECTIONS = [
  { name: "Zapatos", filterCategory: "Running" },
  { name: "Ropa Hombre", filterCategory: null },
  { name: "Ropa Mujer", filterCategory: null },
  { name: "Perfumes", filterCategory: null },
  { name: "Relojes", filterCategory: null },
  { name: "Gafas", filterCategory: null },
];

function getProductCategories(products: Product[]): Category[] {
  return [...new Set(products.map((product) => product.category.trim()).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right));
}

function getProductSubcategories(products: Product[], category: Category): string[] {
  return [...new Set(products
    .filter((product) => product.category === category)
    .map((product) => product.subcategory.trim())
    .filter(Boolean))]
    .sort((left, right) => left.localeCompare(right));
}

interface StorefrontCartLine {
  product: Product; qty: number; selectedSize: string; selectedColor: string;
}

const LOCAL_CART_STORAGE = "urbansport_cart_v1";

function loadStoredCartEntries(): GuestCartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = JSON.parse(window.localStorage.getItem(LOCAL_CART_STORAGE) ?? "null");
    return normalizeGuestCartEntries(stored);
  } catch {
    return [];
  }
}

type Address = DomainAddress;

interface HomePageContent {
  heroTitle: string;
  heroSubtitle: string;
  heroImage?: string;
  featuredCategoryIds?: string | string[];
  featuredProductIds?: string | string[];
  discountedProductIds?: string | string[];
  promoBanner?: string;
  newsletterEnabled?: boolean;
  featuredSectionTitle: string;
  newArrivalsSectionTitle: string;
  saleSectionTitle: string;
  categorySectionLabel: string;
  categorySectionTitle: string;
  featuredSectionLabel: string;
  newArrivalsLabel: string;
  saleSectionLabel: string;
  categorySectionImage?: string;
  featuredSectionImage?: string;
  newArrivalsSectionImage?: string;
  saleSectionImage?: string;
  featuredSectionSubtitle?: string;
  featuredSectionDiscount?: string;
  newArrivalsSectionSubtitle?: string;
  newArrivalsSectionDiscount?: string;
  saleSectionSubtitle?: string;
  saleSectionDiscount?: string;
}

const LOCAL_ADDRESS_STORAGE = "urbansport_addresses";
const DEFAULT_HERO_TITLE = "VISTE TU ESTILO. MARCA LA DIFERENCIA.";
const DEFAULT_HERO_SUBTITLE = "Explora calzado, ropa deportiva y accesorios para completar tu estilo.";
const DEFAULT_HERO_IMAGE = "https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?auto=format&fit=crop&w=1600&h=900&q=85";
const TOP_BENEFITS_MESSAGES = [
  "Envío gratis a toda Colombia por compras superiores a $300.000",
  "Compra 100% segura: aceptamos todos los medios de pago",
  "Atención y soporte 24/7 para resolver tus dudas",
  "Productos 100% originales con garantía de marca",
  "Nuevas tendencias y estilos para todos los días",
] as const;

const loadStoredAddresses = (): Address[] => {
  if (typeof window === "undefined") return [];

  try {
    const stored = window.localStorage.getItem(LOCAL_ADDRESS_STORAGE);
    if (!stored) return [];

    const parsed = JSON.parse(stored) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed.filter((value): value is Address => {
      if (!value || typeof value !== "object") return false;
      const address = value as Partial<Address>;
      return [address.id, address.label, address.line1, address.city, address.state, address.postalCode, address.country, address.phone]
        .every((field) => typeof field === "string");
    }).map((address) => ({
      ...address,
      isDefault: address.isDefault ?? false,
    }));
  } catch (error) {
    console.warn("Error cargando direcciones desde localStorage.", error);
    return [];
  }
};

const mapProductRecordToAppProduct = (record: ProductRecord, categories: readonly CategoryOption[] = []): Product => {
  const productImages = normalizeProductImageList(
    record.main_image ?? record.image ?? record.images?.[0],
    record.images ?? [],
    (path) => getPublicUrl(STORAGE_BUCKET, path),
  );

  return {
    id: record.id,
    slug: record.slug ?? undefined,
    name: record.name,
    brand: record.brand,
    price: record.price,
    originalPrice: record.original_price ?? undefined,
    discount: record.discount ?? undefined,
    rating: record.rating ?? 0,
    reviews: record.reviews ?? 0,
    image: productImages.mainImage,
    images: productImages.gallery,
    category: resolveProductCategoryName(record.category_id, record.category, categories),
    categoryId: record.category_id ?? undefined,
    subcategory: record.subcategory ?? "",
    stock: record.stock ?? 0,
    sku: record.sku ?? record.id,
    description: record.description ?? "",
    colors: record.colors ?? [],
    sizes: record.sizes ?? [],
    specifications: record.specifications ?? [],
    isActive: record.is_active !== false,
    createdAt: record.created_at ?? undefined,
    updatedAt: record.updated_at ?? undefined,
    gender: record.gender as Product["gender"],
    isNew: record.is_new ?? false,
    isFeatured: record.is_featured ?? false,
    specs: record.specs ?? [],
  };
};

const mapAppProductToProductRecord = (product: Partial<Product> & { id?: string }): ProductRecord => ({
  id: product.id ?? crypto.randomUUID(),
  name: product.name ?? "",
  brand: product.brand ?? "",
  price: Number(product.price ?? 0),
  original_price: product.originalPrice ?? null,
  discount: product.discount ?? null,
  rating: Number(product.rating ?? 0),
  reviews: Number(product.reviews ?? 0),
  image: product.image ?? "",
  category: product.category ?? "Zapatos",
  category_id: product.categoryId ?? product.category ?? null,
  images: product.images ?? [],
  subcategory: product.subcategory ?? "",
  stock: Number(product.stock ?? 0),
  sku: product.sku ?? "",
  description: product.description ?? "",
  colors: product.colors ?? [],
  sizes: product.sizes ?? [],
  specifications: product.specifications ?? [],
  is_active: product.isActive ?? true,
  gender: (product.gender ?? "Unisex") as string,
  is_new: product.isNew ?? false,
  is_featured: product.isFeatured ?? false,
  specs: product.specs ?? [],
});

// ─── DATA ────────────────────────────────────────────────────────────────────


const LOW_STOCK_THRESHOLD = 10;

// ─── UTILS ───────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  "$" + n.toLocaleString("es-CO");

const formatAdminProductDate = (value?: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("es-CO", { year: "numeric", month: "short", day: "numeric" });
};

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 border border-amber-200",
  confirmed: "bg-blue-50 text-blue-700 border border-blue-200",
  processing: "bg-amber-50 text-amber-700 border border-amber-200",
  shipped: "bg-blue-50 text-blue-700 border border-blue-200",
  delivered: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  cancelled: "bg-red-50 text-red-700 border border-red-200",
  refunded: "bg-slate-100 text-slate-700 border border-slate-200",
};

const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: "Pendiente",
  confirmed: "Confirmado",
  processing: "En preparación",
  shipped: "Enviado",
  delivered: "Entregado",
  cancelled: "Cancelado",
  refunded: "Reembolsado",
};

// ─── SHARED UI ────────────────────────────────────────────────────────────────

function StarRating({ rating, reviews }: { rating: number; reviews?: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((i) => (
          <Star key={i} size={13}
            className={i <= Math.round(rating) ? "fill-amber-400 text-amber-400" : "fill-slate-200 text-slate-200"}
          />
        ))}
      </div>
      <span className="text-sm font-semibold text-slate-700">{rating}</span>
      {reviews !== undefined && <span className="text-sm text-slate-400">({reviews.toLocaleString()})</span>}
    </div>
  );
}

function Badge({ children, variant = "default" }: {
  children: React.ReactNode;
  variant?: "default" | "sale" | "new" | "low" | "free";
}) {
  const cls = {
    default: "bg-slate-100 text-slate-600",
    sale:    "bg-orange-500 text-white",
    new:     "bg-blue-600 text-white",
    low:     "bg-amber-100 text-amber-700 border border-amber-200",
    free:    "bg-emerald-100 text-emerald-700",
  }[variant];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold tracking-wide ${variant === "sale" || variant === "new" ? "font-display text-sm uppercase tracking-[0.04em]" : ""} ${cls}`}>
      {children}
    </span>
  );
}

function Btn({
  children, onClick, variant = "primary", size = "md", className = "", disabled = false, type = "button",
}: {
  children: React.ReactNode; onClick?: () => void;
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger";
  size?: "sm" | "md" | "lg"; className?: string; disabled?: boolean; type?: "button" | "submit";
}) {
  const base = "inline-flex items-center justify-center gap-2 font-semibold transition-all duration-200 cursor-pointer select-none";
  const sizes = {
    sm: "px-3 py-1.5 text-xs rounded-lg",
    md: "px-4 py-2.5 text-sm rounded-xl",
    lg: "px-6 py-3.5 text-base rounded-xl",
  };
  const variants = {
    primary: "bg-[#bfdbfe] text-[#0b1220] hover:bg-[#a8caff] active:scale-[0.98] shadow-sm shadow-blue-300/40",
    secondary: "bg-[#eef3ff] text-[#0b1220] hover:bg-[#e2ebff]",
    outline: "border-2 border-[#0b1220] text-[#0b1220] hover:bg-slate-100",
    ghost: "text-slate-600 hover:text-[#0b1220] hover:bg-slate-100",
    danger: "bg-red-50 text-red-600 border border-red-200 hover:bg-red-100",
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${sizes[size]} ${variants[variant]} ${disabled ? "opacity-40 cursor-not-allowed" : ""} ${className}`}
    >
      {children}
    </button>
  );
}

function ColorSelector({ colors, selected, onSelect }: {
  colors: { name: string; hex: string }[]; selected: string; onSelect: (color: string) => void;
}) {
  if (!colors.length) return null;
  return (
    <div className="flex items-center gap-2">
      {colors.map((color) => (
        <button
          key={color.name} onClick={() => onSelect(color.name)} title={color.name}
          className={`w-7 h-7 rounded-full border-2 transition-transform ${
            selected === color.name ? "border-[#bfdbfe] scale-110" : "border-transparent hover:scale-105"
          }`}
          style={{ backgroundColor: color.hex, boxShadow: "0 0 0 1px rgba(0,0,0,0.12)" }}
        />
      ))}
      {selected && <span className="text-xs text-slate-500 ml-1">{selected}</span>}
    </div>
  );
}

function SizeSelector({ sizes, selected, onSelect }: {
  sizes: string[]; selected: string; onSelect: (size: string) => void;
}) {
  if (!hasSelectableSizes(sizes)) {
    return <span className="text-sm text-slate-500">Talla única</span>;
  }
  return (
    <div className="flex flex-wrap gap-2">
      {sizes.map((size) => (
        <button
          key={size} onClick={() => onSelect(size)}
          className={`min-w-[44px] px-3 py-1.5 rounded-lg text-sm font-semibold border-2 transition-all ${
            selected === size
              ? "border-[#bfdbfe] bg-[#bfdbfe] text-[#0b1220]"
              : "border-slate-200 text-slate-600 hover:border-[#bfdbfe] hover:text-[#1e3a8a]"
          }`}
        >
          {size}
        </button>
      ))}
    </div>
  );
}

function hasSelectableSizes(sizes: string[]): boolean {
  return sizes.length > 0 && !(sizes.length === 1 && sizes[0].trim().toLowerCase() === 'talla única');
}

function ProductCarousel({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const scrollLeft = useRef(0);
  const autoScrollInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  // Iniciar auto-scroll
  const startAutoScroll = () => {
    if (autoScrollInterval.current) clearInterval(autoScrollInterval.current);
    
    autoScrollInterval.current = setInterval(() => {
      const carousel = ref.current;
      if (!carousel || isDragging.current) return;

      const inner = carousel.firstElementChild as HTMLElement | null;
      if (!inner) return;
      const firstItem = inner.firstElementChild as HTMLElement | null;
      if (!firstItem) return;

      const maxScroll = carousel.scrollWidth - carousel.clientWidth;
      if (maxScroll <= 0) return;

      // calcular desplazamiento en base al ancho de la primera tarjeta + gap
      const gapStr = getComputedStyle(inner).gap || "0px";
      const gap = parseInt(gapStr.replace("px", ""), 10) || 0;
      const step = Math.round(firstItem.getBoundingClientRect().width) + gap;

      const next = carousel.scrollLeft + step;
      if (next >= maxScroll) {
        carousel.scrollTo({ left: 0, behavior: "smooth" });
      } else {
        carousel.scrollBy({ left: step, behavior: "smooth" });
      }
    }, 3000);
  };

  useEffect(() => {
    startAutoScroll();
    return () => {
      if (autoScrollInterval.current) clearInterval(autoScrollInterval.current);
    };
  }, []);

  // Manejo de mouse drag
  const handleMouseDown = (e: React.MouseEvent) => {
    const carousel = ref.current;
    if (!carousel) return;
    isDragging.current = true;
    startX.current = e.pageX - carousel.offsetLeft;
    scrollLeft.current = carousel.scrollLeft;
    if (autoScrollInterval.current) clearInterval(autoScrollInterval.current);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current) return;
    const carousel = ref.current;
    if (!carousel) return;

    e.preventDefault();
    const x = e.pageX - carousel.offsetLeft;
    const walk = (x - startX.current) * 2; // multiplica por 2 para hacer más sensible
    carousel.scrollLeft = scrollLeft.current - walk;
  };

  const handleMouseUp = () => {
    isDragging.current = false;
    startAutoScroll();
  };

  // Manejo de touch
  const handleTouchStart = (e: React.TouchEvent) => {
    const carousel = ref.current;
    if (!carousel) return;
    isDragging.current = true;
    startX.current = e.touches[0].pageX - carousel.offsetLeft;
    scrollLeft.current = carousel.scrollLeft;
    if (autoScrollInterval.current) clearInterval(autoScrollInterval.current);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging.current) return;
    const carousel = ref.current;
    if (!carousel) return;

    const x = e.touches[0].pageX - carousel.offsetLeft;
    const walk = (x - startX.current) * 2;
    carousel.scrollLeft = scrollLeft.current - walk;
  };

  const handleTouchEnd = () => {
    isDragging.current = false;
    startAutoScroll();
  };

  return (
    <div 
      ref={ref} 
      className="overflow-hidden pb-4 -mx-3 px-3 sm:-mx-4 sm:px-4 cursor-grab active:cursor-grabbing"
      style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div className="flex flex-nowrap gap-3 snap-x snap-mandatory" style={{ minWidth: "max-content" }}>
        {children}
      </div>
    </div>
    );
}

// ─── PRODUCT CARD ─────────────────────────────────────────────────────────────

function ProductCard({ product, onSelect, onAddToCart }: {
  product: Product; onSelect: (p: Product) => void; onAddToCart: (p: Product, size: string, color: string) => void;
}) {
  const [wished, setWished] = useState(false);
  const requiresSize = hasSelectableSizes(product.sizes);
  const [selectedSize, setSelectedSize] = useState('');
  const cartSize = requiresSize ? selectedSize : product.sizes[0] ?? '';
  const defaultColor = product.colors[0]?.name ?? "";
  const originalPrice = product.originalPrice;
  const hasRealDiscount = typeof originalPrice === "number" && originalPrice > product.price;
  const savings = hasRealDiscount ? (originalPrice ?? 0) - product.price : 0;

  return (
        <article className="group relative flex h-full w-full min-w-0 max-w-full flex-col overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-[0_10px_26px_-20px_rgba(15,23,42,0.35)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_16px_36px_-22px_rgba(15,23,42,0.4)] sm:rounded-2xl lg:rounded-3xl">
      {/* Image */}
      <div className="relative aspect-square w-full overflow-hidden bg-slate-100 sm:aspect-[4/3]">
        <a href={`/?product=${encodeURIComponent(product.slug ?? product.id)}`} onClick={(event) => { event.preventDefault(); onSelect(product); }} aria-label={`Ver ${product.name}`} className="block h-full w-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-blue-600">
          <img src={product.image} alt={product.name} onError={(event) => { event.currentTarget.style.display = "none"; }}
            loading="lazy" decoding="async"
            className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-500"
          />
        </a>
        {/* Badges */}
        <div className="absolute left-1.5 top-1.5 flex max-w-[70%] flex-col gap-1 sm:left-3 sm:top-3 sm:gap-1.5">
          {hasRealDiscount && product.discount && <Badge variant="sale">-{product.discount}%</Badge>}
          {product.isNew && !hasRealDiscount && <Badge variant="new">Nuevo</Badge>}
          {product.stock <= 10 && <Badge variant="low">Pocas</Badge>}
        </div>
        {/* Wishlist */}
        <button
          type="button"
          aria-label={wished ? `Quitar ${product.name} de favoritos` : `Agregar ${product.name} a favoritos`}
          aria-pressed={wished}
          onClick={() => setWished((value) => !value)}
          className="absolute right-1.5 top-1.5 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/95 shadow-md backdrop-blur transition-colors hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1e3a8a] sm:right-3 sm:top-3 sm:h-11 sm:w-11"
        >
          <Heart size={14} className={wished ? "fill-red-500 text-red-500 sm:h-[15px] sm:w-[15px]" : "text-slate-400 sm:h-[15px] sm:w-[15px]"} />
        </button>
      </div>

      {/* Info */}
      <div className="flex min-w-0 flex-1 flex-col space-y-2 p-2.5 sm:space-y-3 sm:p-4 lg:space-y-4 lg:p-5">
        <div>
          <p className="mb-1.5 inline-flex max-w-full items-center gap-1 overflow-hidden rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-semibold uppercase text-[#1e3a8a] sm:mb-2 sm:gap-2 sm:px-3 sm:py-1 sm:text-xs sm:tracking-[0.12em]">{product.brand}</p>
          <h3 className="line-clamp-2 break-words font-display text-sm leading-tight text-slate-900 sm:text-xl lg:text-2xl">
            <a href={`/?product=${encodeURIComponent(product.slug ?? product.id)}`} onClick={(event) => { event.preventDefault(); onSelect(product); }} className="text-left font-display hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1e3a8a]">{product.name}</a>
          </h3>
          <p className="mt-1 hidden truncate text-xs text-slate-500 sm:block sm:text-sm">{product.subcategory}{product.gender ? ` · ${product.gender}` : ""}</p>
        </div>
        {product.reviews > 0 && product.rating > 0 && <div className="hidden sm:block"><StarRating rating={product.rating} reviews={product.reviews} /></div>}

        {product.colors.length > 0 && (
          <div className="flex min-w-0 flex-wrap items-center gap-1.5 sm:gap-2">
            {product.colors.slice(0, 4).map((c) => (
              <div key={c.name} className="h-3 w-3 rounded-full border border-slate-200 sm:h-4 sm:w-4" style={{ backgroundColor: c.hex }} title={c.name} />
            ))}
            {product.colors.length > 4 && <span className="text-xs text-slate-400">+{product.colors.length - 4}</span>}
          </div>
        )}

        {requiresSize && (
          <label className="block text-xs font-semibold text-slate-600">
            Talla
            <select
              aria-label={`Seleccionar talla de ${product.name}`}
              value={selectedSize}
              onChange={(event) => setSelectedSize(event.target.value)}
              className="mt-1 min-h-10 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-800 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20 sm:px-3 sm:text-sm"
            >
              <option value="" disabled>Elige talla</option>
              {product.sizes.map((size) => <option key={size} value={size}>{size}</option>)}
            </select>
          </label>
        )}

        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5 sm:gap-3">
          <span className="price text-sm text-slate-900 sm:text-lg">{fmt(product.price)}</span>
          {hasRealDiscount && originalPrice !== undefined && (
            <span className="price text-[10px] text-slate-400 line-through sm:text-xs">{fmt(originalPrice)}</span>
          )}
        </div>
        {savings > 0 && <p className="price hidden text-xs text-emerald-600 sm:block sm:-mt-1">Ahorras {fmt(savings)}</p>}

        <button
          type="button"
          aria-label={product.stock <= 0 ? `Agotado: ${product.name}` : `Agregar ${product.name} al carrito`}
          disabled={product.stock <= 0 || (requiresSize && !selectedSize)}
          onClick={() => onAddToCart(product, cartSize, defaultColor)}
          className="mt-auto flex min-h-11 w-full min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-black px-1.5 py-2 text-[11px] font-bold text-white shadow-sm shadow-slate-200 transition-all duration-200 hover:bg-slate-900 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600 sm:gap-2 sm:rounded-full sm:px-3 sm:py-3 sm:text-sm"
        >
          {product.stock <= 0 ? "Agotado" : <><ShoppingCart size={14} /><span className="sm:hidden">Agregar</span><span className="hidden sm:inline">Agregar al carrito</span></>}
        </button>
      </div>
    </article>
  );
}

// ─── NAVBAR ──────────────────────────────────────────────────────────────────

function TopBenefitsBar() {
  const benefits = TOP_BENEFITS_MESSAGES;

  const [currentIndex, setCurrentIndex] = useState(0);
  const [previousIndex, setPreviousIndex] = useState<number | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [isPageVisible, setIsPageVisible] = useState(() => typeof document !== "undefined" ? document.visibilityState === "visible" : true);

  useEffect(() => {
    if (typeof document === "undefined") return;

    const handleVisibilityChange = () => setIsPageVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  useEffect(() => {
    if (benefits.length < 2 || isPaused || !isPageVisible) return;

    const interval = window.setInterval(() => {
      setPreviousIndex(currentIndex);
      setCurrentIndex((index) => (index + 1) % benefits.length);
    }, 4000);

    return () => window.clearInterval(interval);
  }, [currentIndex, benefits.length, isPaused, isPageVisible]);

  useEffect(() => {
    if (previousIndex === null) return;

    const timer = window.setTimeout(() => setPreviousIndex(null), 600);
    return () => window.clearTimeout(timer);
  }, [previousIndex, currentIndex]);

  return (
    <>
      <style>{`
        .top-benefits-bar {
          position: relative;
          width: 100%;
          height: 48px;
          overflow: hidden;
          background: #0B1220;
          color: #ffffff;
          border-bottom: 1px solid rgba(255,255,255,0.1);
        }

        .benefit-center {
          position: absolute;
          inset: 0;
          display: grid;
          place-items: center;
          overflow: hidden;
        }

        .benefit-message {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          height: 100%;
          max-width: min(100%, 60rem);
          margin-inline: auto;
          box-sizing: border-box;
          font-family: var(--font-body);
          font-size: 0.76rem;
          font-weight: 600;
          line-height: 1.25;
          text-align: center;
          padding: 0 0.75rem;
          overflow-wrap: anywhere;
        }

        .benefit-message--entering {
          animation: benefit-enter 600ms cubic-bezier(0.22, 1, 0.36, 1) both;
        }

        .benefit-message--leaving {
          animation: benefit-exit 600ms cubic-bezier(0.22, 1, 0.36, 1) both;
        }

        .top-benefits-bar:hover .benefit-message,
        .top-benefits-bar:focus-within .benefit-message {
          animation-play-state: paused;
        }

        @media (min-width: 640px) {
          .benefit-message {
            font-size: 0.9rem;
          }
        }

        @keyframes benefit-enter {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }

        @keyframes benefit-exit {
          from {
            transform: translateX(0);
            opacity: 1;
          }
          to {
            transform: translateX(-100%);
            opacity: 0;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .benefit-message--entering,
          .benefit-message--leaving {
            animation: none;
          }

          .benefit-message--leaving {
            display: none;
          }
        }
      `}</style>

      <div
        className="top-benefits-bar"
        aria-live={isPaused ? "polite" : "off"}
        aria-atomic="true"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        onFocus={() => setIsPaused(true)}
        onBlur={() => setIsPaused(false)}
      >
        <div className="benefit-center">
          {previousIndex !== null && (
            <span className="benefit-message benefit-message--leaving" aria-hidden="true">
              {benefits[previousIndex]}
            </span>
          )}
          <span className={`benefit-message${previousIndex !== null ? " benefit-message--entering" : ""}`}>
            {benefits[currentIndex]}
          </span>
        </div>
      </div>
    </>
  );
}

function Navbar({ cart, onNavigate, onCartOpen, isLoggedIn, isAdmin, profileRole, authUser, currentView, onLoginClick, onLogout, onCategorySelect, onSelectProduct, products, categories }: {
  cart: StorefrontCartLine[]; onNavigate: (v: View) => void;
  onCartOpen: () => void; isLoggedIn: boolean; isAdmin: boolean; profileRole: string | null;
  authUser: User | null; currentView: View; onLoginClick: () => void; onLogout: () => void;
  onCategorySelect: (c: Category | null) => void;
  onSelectProduct?: (p: Product) => void;
  products: Product[];
  categories: CategoryOption[];
}) {
  const [userOpen, setUserOpen] = useState(false);
  const [searchVal, setSearchVal] = useState("");
  const [suggestions, setSuggestions] = useState<Product[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const adminPanelMenuLink = getAdminPanelMenuLink(profileRole, isAdmin);
  const suggestTimer = useRef<number | null>(null);
  const cartCount = cart.reduce((s, i) => s + i.qty, 0);
  const availableCategories = HOME_NAV_CATEGORIES;
  const showCustomerOrders = !isAdmin;
  // suggestions effect
  useEffect(() => {
    if (suggestTimer.current) window.clearTimeout(suggestTimer.current);
    if (!searchVal || searchVal.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    suggestTimer.current = window.setTimeout(() => {
      const q = searchVal.trim().toLowerCase();
      const matches = products.filter((p) => (
        p.name.toLowerCase().includes(q) || p.brand.toLowerCase().includes(q) || p.sku?.toLowerCase()?.includes(q)
      )).slice(0, 6);
      setSuggestions(matches);
    }, 180);
    return () => { if (suggestTimer.current) window.clearTimeout(suggestTimer.current); };
  }, [searchVal, products]);

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50">
        <TopBenefitsBar />

        <div className="border-b border-slate-100 bg-white/95 shadow-sm backdrop-blur-sm">
          <div className="mx-auto flex h-16 max-w-7xl items-center gap-2 px-4 sm:px-6 sm:gap-4">
            <button type="button" onClick={() => onNavigate("home")} className="flex shrink-0 items-center" aria-label="Ir a inicio">
              <span className="brand-lockup">
                <span className="brand-wordmark">
                  <span className="brand-urban">Urban</span><span className="brand-sport">Sport</span>
                </span>
                <span className="brand-sub">Store</span>
              </span>
            </button>

            <div className="hidden flex-1 max-w-xl sm:flex relative">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={searchVal} onChange={(e) => setSearchVal(e.target.value)}
                placeholder="Buscar zapatillas, ropa, relojes..."
                aria-label="Buscar productos"
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:border-[#1e3a8a]/50 focus:bg-white transition-all"
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 180)}
              />

              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute left-0 right-0 mt-2 bg-white border border-slate-100 rounded-xl shadow-lg z-50 max-h-60 overflow-auto">
                  {suggestions.map((s) => (
                    <button key={s.id} onMouseDown={(e) => { e.preventDefault(); onSelectProduct?.(s); setSearchVal(''); setSuggestions([]); }}
                      className="w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors">
                      <div className="text-sm font-semibold">{s.name}</div>
                      <div className="text-xs text-slate-400">{s.brand} · {s.subcategory}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
              <button
                type="button"
                aria-label={`Abrir carrito, ${cartCount} artículos`}
                onClick={onCartOpen}
                className="relative h-10 w-10 rounded-xl flex items-center justify-center text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
              >
                <ShoppingCart size={19} />
                {cartCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-[#f97316] text-[10px] font-bold text-white">
                    {cartCount}
                  </span>
                )}
              </button>

              <button
                type="button"
                aria-label={isAdmin ? "Ir al panel de administración" : isLoggedIn ? "Ir a mi cuenta" : "Iniciar sesión o crear cuenta"}
                title={isAdmin ? "Administración" : isLoggedIn ? "Mi cuenta" : "Iniciar sesión"}
                onClick={() => onNavigate(isAdmin ? "admin" : isLoggedIn ? "account" : "login")}
                className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1e3a8a] sm:hidden"
              >
                {isLoggedIn && isAdmin ? <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-[#1e3a8a] to-[#f97316] text-xs font-bold text-white">A</div> : isLoggedIn ? <UserRound size={19} /> : <Users size={19} />}
              </button>

              <div className="relative hidden sm:block">
                <button
                    type="button"
                    onClick={() => setUserOpen(!userOpen)}
                    aria-label={isLoggedIn ? "Abrir menú de usuario" : "Iniciar sesión o crear cuenta"}
                    className="h-10 w-10 rounded-xl flex items-center justify-center text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
                  >
                  {isLoggedIn
                    ? isAdmin
                      ? <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-[#1e3a8a] to-[#f97316] text-xs font-bold text-white">A</div>
                      : <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-50 text-[#1e3a8a]"><UserRound size={17} aria-hidden="true" /></div>
                    : <Users size={19} />}
                </button>
                {userOpen && (
                  <div className="absolute right-0 top-12 w-52 bg-white border border-slate-100 rounded-2xl shadow-xl py-2 z-50">
                    {isLoggedIn ? (
                      <>
                        <div className="px-4 py-2.5 border-b border-slate-100 mb-1">
                          <p className="text-sm font-bold text-slate-800">{authUser?.user_metadata?.full_name ?? authUser?.email ?? 'Usuario'}</p>
                          <p className="text-xs text-slate-400">{authUser?.email ?? 'email@dominio.com'}</p>
                        </div>
                        {showCustomerOrders && (
                          <button type="button" onClick={() => { onNavigate("account"); setUserOpen(false); }}
                            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-50 transition-colors">
                            <Package size={14} /> Mis pedidos
                          </button>
                        )}
                        {adminPanelMenuLink && (
                          <button type="button" onClick={() => { onNavigate(adminPanelMenuLink.view); setUserOpen(false); }}
                            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 transition-colors">
                            <BarChart2 size={14} /> {adminPanelMenuLink.label}
                          </button>
                        )}
                        <div className="border-t border-slate-100 mt-1 pt-1">
                          <button type="button" onClick={() => { onLogout(); setUserOpen(false); }}
                            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 transition-colors">
                            <LogOut size={14} /> Cerrar sesión
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <button onClick={() => { onNavigate("login"); setUserOpen(false); }}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-50 transition-colors">
                          Iniciar sesión
                        </button>
                        <button onClick={() => { onNavigate("register"); setUserOpen(false); }}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-50 transition-colors">
                          Crear cuenta
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="relative px-4 pb-3 sm:hidden">
            <Search size={15} aria-hidden="true" className="absolute left-7 top-1/2 -translate-y-1/2 text-slate-400" />
            <label htmlFor="mobile-product-search" className="sr-only">Buscar productos</label>
            <input
              id="mobile-product-search"
              value={searchVal}
              onChange={(event) => setSearchVal(event.target.value)}
              placeholder="Buscar zapatillas, ropa, relojes..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-10 pr-4 text-sm text-slate-700 placeholder-slate-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#1e3a8a]"
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 180)}
            />
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute left-4 right-4 top-full z-50 max-h-60 overflow-auto rounded-xl border border-slate-100 bg-white shadow-lg">
                {suggestions.map((product) => (
                  <button key={product.id} type="button" onMouseDown={(event) => { event.preventDefault(); onSelectProduct?.(product); setSearchVal(""); setSuggestions([]); }} className="w-full px-4 py-3 text-left hover:bg-slate-50">
                    <span className="block text-sm font-semibold">{product.name}</span>
                    <span className="block text-xs text-slate-400">{product.brand} · {product.subcategory}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

        </div>
      </header>

    </>
  );
}

function CartDrawer({ cart, onClose, onUpdate, onRemove, onCheckout, unavailableCartItems, onRemoveUnavailable, restoreStatus, onRetryCatalog }: {
  cart: StorefrontCartLine[];
  onClose: () => void;
  onUpdate: (id: string, size: string, color: string, qty: number) => void;
  onRemove: (id: string, size: string, color: string) => void;
  onCheckout: () => void;
  unavailableCartItems: GuestCartItem[];
  onRemoveUnavailable: (index: number) => void;
  restoreStatus: ProductsStatus;
  onRetryCatalog: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.querySelector<HTMLElement>("button:not([disabled])")?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        previouslyFocused?.focus();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;

      const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>(
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
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus();
    };
  }, []);

  const subtotal = cart.reduce((s, i) => s + i.product.price * i.qty, 0);
  return (
    <>
      <button type="button" aria-label="Cerrar carrito" className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50" onClick={onClose} />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="cart-drawer-title" tabIndex={-1} className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white z-50 flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <ShoppingCart size={18} className="text-[#1e3a8a]" />
            <h2 id="cart-drawer-title" className="text-base font-bold text-slate-900">Mi carrito</h2>
            <span className="text-sm text-slate-400">({cart.reduce((s, i) => s + i.qty, 0)} artículos)</span>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {unavailableCartItems.length > 0 && (
            <div role="alert" className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
              <p>Algunos artículos ya no coinciden con el catálogo actual. No se usarán sus datos guardados.</p>
              {unavailableCartItems.map((item, index) => (
                <div key={`${item.productId}-${index}`} className="flex items-center justify-between gap-3 border-t border-amber-200 pt-2">
                  <span className="min-w-0 text-xs">Artículo {index + 1} · cantidad {item.quantity}</span>
                  <button type="button" onClick={() => onRemoveUnavailable(index)} className="min-h-10 shrink-0 text-xs font-semibold underline">Eliminar</button>
                </div>
              ))}
            </div>
          )}
          {restoreStatus === "loading" ? (
            <p role="status" className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">Validando artículos con el catálogo actual…</p>
          ) : restoreStatus === "error" ? (
            <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
              <p>No se pudo validar el carrito. Los precios y el stock guardados no se usarán.</p>
              <button type="button" onClick={onRetryCatalog} className="mt-3 min-h-10 font-semibold underline">Reintentar catálogo</button>
            </div>
          ) : cart.length === 0 && unavailableCartItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
              <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center">
                <ShoppingCart size={28} className="text-slate-400" />
              </div>
              <p className="text-slate-500 text-sm">Tu carrito está vacío</p>
              <Btn variant="outline" onClick={onClose}>Explorar productos</Btn>
            </div>
          ) : (
            cart.map((item) => (
              <div key={`${item.product.id}-${item.selectedSize}-${item.selectedColor}`}
                className="flex gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                <img src={item.product.image} alt={item.product.name} onError={(event) => { event.currentTarget.style.display = "none"; }}
                  className="w-16 h-16 object-cover rounded-lg bg-white shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-bold text-[#1e3a8a] uppercase">{item.product.brand}</p>
                  <p className="text-sm font-bold text-slate-800 line-clamp-1">{item.product.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {item.selectedSize && item.selectedSize !== "Talla única" && (
                      <span className="text-xs text-slate-500 bg-slate-200 px-1.5 py-0.5 rounded-md">T: {item.selectedSize}</span>
                    )}
                    {item.selectedColor && (
                      <span className="text-xs text-slate-500 bg-slate-200 px-1.5 py-0.5 rounded-md">{item.selectedColor}</span>
                    )}
                  </div>
                  <p className="price text-sm text-slate-900 mt-1">{fmt(item.product.price)}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden bg-white">
                      <button type="button" aria-label={`Reducir cantidad de ${item.product.name}`} onClick={() => onUpdate(item.product.id, item.selectedSize, item.selectedColor, item.qty - 1)}
                        className="w-7 h-7 flex items-center justify-center text-slate-500 hover:bg-slate-100 transition-colors">
                        <Minus size={12} />
                      </button>
                      <span className="w-7 text-center text-sm font-bold text-slate-800">{item.qty}</span>
                      <button type="button" aria-label={`Aumentar cantidad de ${item.product.name}`} onClick={() => onUpdate(item.product.id, item.selectedSize, item.selectedColor, item.qty + 1)}
                        className="w-7 h-7 flex items-center justify-center text-slate-500 hover:bg-slate-100 transition-colors">
                        <Plus size={12} />
                      </button>
                    </div>
                    <button type="button" aria-label={`Eliminar ${item.product.name} del carrito`} onClick={() => onRemove(item.product.id, item.selectedSize, item.selectedColor)}
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {cart.length > 0 && restoreStatus === "ready" && (
          <div className="px-5 py-4 border-t border-slate-100 space-y-3">
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between text-slate-500">
                <span>Subtotal de referencia</span><span className="price text-slate-800">{fmt(subtotal)}</span>
              </div>
              <div className="flex justify-between text-slate-500">
                <span>Envío</span><span>Por confirmar</span>
              </div>
              <div className="flex justify-between font-extrabold text-slate-900 text-base border-t border-slate-100 pt-1.5">
                <span>Total</span><span>Por confirmar</span>
              </div>
            </div>
            <p role="status" className="text-xs leading-5 text-slate-600">
              Checkout no disponible. No se ha creado un pedido ni iniciado un pago.
            </p>
            <Btn variant="primary" className="w-full" size="lg" onClick={onCheckout}>
              Revisar disponibilidad <ArrowRight size={16} />
            </Btn>
          </div>
        )}
      </div>
    </>
  );
}

// ─── HOME PAGE ────────────────────────────────────────────────────────────────

  function ProductGrid({ children }: { children: React.ReactNode }) {
    return <div className="grid w-full min-w-0 grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 lg:gap-5 2xl:grid-cols-5">{children}</div>;
  }

  function ProductStatusNotice({ status, onRetry, onCategorySelect }: { status: ProductsStatus; onRetry: () => void; onCategorySelect?: (category: Category | null) => void; }) {
    if (status === "loading") {
      return (
        <div role="status" aria-busy="true" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 sm:gap-4">
          <span className="sr-only">Cargando productos</span>
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="aspect-square animate-pulse rounded-xl bg-slate-200 sm:aspect-[4/3] sm:rounded-2xl" />
          ))}
        </div>
      );
    }

    if (status === "error") {
      return (
        <div role="alert" aria-live="polite" className="flex flex-col items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <p className="text-sm font-semibold">No pudimos cargar el catálogo. Intenta de nuevo en unos momentos.</p>
            {onCategorySelect && (
              <button type="button" onClick={() => onCategorySelect(null)} className="text-sm font-semibold text-amber-900 underline underline-offset-2">
                Explorar catálogo
              </button>
            )}
          </div>
          <button type="button" onClick={onRetry} className="min-h-11 rounded-lg border border-amber-300 bg-white px-4 text-sm font-bold hover:bg-amber-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700">
            Reintentar
          </button>
        </div>
      );
    }

    return null;
  }

  function HomePage({ onNavigate, onSelectProduct, onAddToCart, onCategorySelect, content, products, categories, selectedCategory, featuredProducts, newArrivalsProducts, saleProducts, productsStatus, onRetryProducts }: {
  onNavigate: (v: View) => void; onSelectProduct: (p: Product) => void;
  onAddToCart: (p: Product, size: string, color: string) => void;
  onCategorySelect: (c: Category | null) => void;
  content: HomePageContent;
  products: Product[];
  categories: CategoryOption[];
  selectedCategory: Category | null;
  featuredProducts: Product[];
  newArrivalsProducts: Product[];
  saleProducts: Product[];
  productsStatus: ProductsStatus;
  onRetryProducts: () => void;
}) {
  const featured = featuredProducts;
  const newArrivals = newArrivalsProducts;
  const onSale = saleProducts;
  const homeCategories = HOME_COLLECTIONS;
  const hasRealDiscounts = onSale.some((product) => typeof product.originalPrice === "number" && product.originalPrice > product.price);
  const privacyPolicyUrl = import.meta.env.VITE_PRIVACY_POLICY_URL?.trim() || STORE_CONFIG.privacyPolicyPath;
  const newsletterAvailable = content.newsletterEnabled === true && (!import.meta.env.DEV || Boolean(import.meta.env.VITE_API_URL?.trim()));
  const [newsletterEmail, setNewsletterEmail] = useState("");
  const [newsletterLoading, setNewsletterLoading] = useState(false);
  const [newsletterMessage, setNewsletterMessage] = useState("");
  const [newsletterError, setNewsletterError] = useState(false);
  const [newsletterConsent, setNewsletterConsent] = useState(false);

  const handleNewsletterSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const email = newsletterEmail.trim();

    if (!newsletterAvailable) {
      setNewsletterError(true);
      setNewsletterMessage(STORE_CONFIG.newsletterDisabledMessage);
      return;
    }

    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      setNewsletterError(true);
      setNewsletterMessage("Ingresa un correo válido para continuar.");
      return;
    }

    if (!newsletterConsent) {
      setNewsletterError(true);
      setNewsletterMessage("Debes aceptar la Política de Privacidad para continuar.");
      return;
    }

    setNewsletterLoading(true);
    setNewsletterMessage("");
    setNewsletterError(false);

    try {
      await subscribeToNewsletter(email);
      setNewsletterEmail("");
      setNewsletterMessage("Tu correo quedó registrado para recibir novedades.");
      setNewsletterConsent(false);
    } catch (error) {
      setNewsletterError(true);
      setNewsletterMessage(error instanceof Error ? error.message : "No se pudo registrar el correo. Intenta nuevamente.");
    } finally {
      setNewsletterLoading(false);
    }
  };

  return (
    <>
    <main>
      <HomePromoCarousel />

      <CategoryBar
        categories={[...new Set([...categories.map((category) => category.name), ...getProductCategories(products)])]}
        activeCategory={selectedCategory}
        onSelect={onCategorySelect}
      />

      <section className="mx-auto max-w-7xl px-3 py-6 sm:px-4 sm:py-12 md:px-6 md:py-16">
        <div className="mb-6 flex items-end justify-between gap-4 sm:mb-8">
          <div>
            <p className="mb-1 font-display text-sm uppercase tracking-[0.08em] text-[#1e3a8a] sm:text-base">{content.featuredSectionLabel}</p>
            <h2 className="font-display text-[1.8rem] uppercase leading-[1.05] text-slate-900 sm:text-[2.4rem] md:text-[2.8rem]">PRODUCTOS DESTACADOS</h2>
          </div>
          {productsStatus === "ready" && featured.length > 0 && (
            <Btn variant="ghost" onClick={() => onNavigate("catalog")} className="hidden sm:flex">
              Ver catálogo <ChevronRight size={14} />
            </Btn>
          )}
        </div>
        {productsStatus === "loading" && <ProductStatusNotice status={productsStatus} onRetry={onRetryProducts} />}
        {productsStatus === "error" && <ProductStatusNotice status={productsStatus} onRetry={onRetryProducts} onCategorySelect={onCategorySelect} />}
        {productsStatus === "ready" && featured.length === 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600 sm:p-6">
            <h3 className="mb-2 text-xl font-bold text-slate-900">Aún estamos preparando nuevos productos</h3>
            <p className="mb-4">Explora nuestras categorías mientras actualizamos el catálogo.</p>
            <div className="flex flex-wrap gap-3">
              {homeCategories.slice(0, 3).map((category) => (
                <button key={category.name} type="button" onClick={() => onCategorySelect(category.filterCategory)} className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 font-semibold text-slate-700 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1e3a8a]">
                  {category.name}
                </button>
              ))}
            </div>
          </div>
        )}
        {productsStatus === "ready" && featured.length > 0 && (
          <>
            <ProductGrid>
              {featured.slice(0, 8).map((p) => (
                <div key={p.id} className="min-w-0">
                  <ProductCard product={p} onSelect={onSelectProduct} onAddToCart={onAddToCart} />
                </div>
              ))}
            </ProductGrid>
            <Btn variant="ghost" onClick={() => onNavigate("catalog")} className="mt-6 w-full sm:hidden">
              Ver catálogo <ChevronRight size={14} />
            </Btn>
          </>
        )}
      </section>

      {hasRealDiscounts && <section className="mx-auto max-w-7xl px-3 pb-8 sm:px-4 sm:pb-12 md:px-6" aria-label="Productos con descuento">
        <div className="mb-4 flex items-end justify-between gap-3 sm:mb-6">
          <div>
            <p className="mb-1 font-display text-sm uppercase tracking-[0.08em] text-[#c2410c] sm:text-base">{content.saleSectionLabel || "OFERTA ESPECIAL"}</p>
            <h2 className="font-display text-[1.7rem] uppercase leading-[1.05] text-[#0b1220] sm:text-[2.4rem] md:text-[2.8rem]">{content.saleSectionTitle || "En descuento ahora"}</h2>
          </div>
          <Btn variant="ghost" onClick={() => onNavigate("catalog")} className="shrink-0">
            Ver todos <ChevronRight size={14} />
          </Btn>
        </div>
        <ProductGrid>
          {onSale.filter((product) => typeof product.originalPrice === "number" && product.originalPrice > product.price).slice(0, 4).map((product) => (
            <div key={product.id} className="min-w-0">
              <ProductCard product={product} onSelect={onSelectProduct} onAddToCart={onAddToCart} />
            </div>
          ))}
        </ProductGrid>
      </section>}

      {newArrivals.length > 0 && (
        <section id="home-new-arrivals" className="mx-auto max-w-7xl px-3 py-2 sm:px-4 md:px-6">
          <div className="mb-6 flex items-end justify-between gap-4 sm:mb-8">
            <div>
              <p className="mb-1 font-display text-sm uppercase tracking-[0.08em] text-emerald-700 sm:text-base">{content.newArrivalsLabel}</p>
              <h2 className="font-display text-[1.8rem] leading-[1.05] text-slate-900 sm:text-[2.4rem] md:text-[2.8rem]">{content.newArrivalsSectionTitle}</h2>
            </div>
            <Btn variant="ghost" onClick={() => onNavigate("catalog")} className="hidden sm:flex">
              Ver catálogo <ChevronRight size={14} />
            </Btn>
          </div>
          <ProductCarousel>
            {newArrivals.slice(0, 9).map((p, idx) => (
              <div key={p.id + '-' + idx} className="w-[calc((100vw-3.5rem)/2)] max-w-[220px] shrink-0 sm:w-[16rem] lg:w-[18rem]">
                <ProductCard product={p} onSelect={onSelectProduct} onAddToCart={onAddToCart} />
              </div>
            ))}
          </ProductCarousel>
          <Btn variant="ghost" onClick={() => onNavigate("catalog")} className="mt-6 w-full sm:hidden">
            Ver catálogo <ChevronRight size={14} />
          </Btn>
        </section>
      )}

      <section className="mx-auto max-w-7xl px-3 py-8 sm:px-4 sm:py-12 md:px-6 md:py-16" aria-labelledby="home-policies-title">
        <h2 id="home-policies-title" className="mb-6 font-display text-[1.8rem] leading-[1.05] text-slate-900 sm:mb-8 sm:text-[2.4rem]">
          Compra con tranquilidad
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:gap-5 md:grid-cols-2">
          <article id="shipping-policy" className="scroll-mt-[13rem] rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_12px_30px_-18px_rgba(15,23,42,0.3)] sm:scroll-mt-[8rem] sm:p-6">
            <div className="mb-4 flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[#1e3a8a]">
                <Truck size={20} aria-hidden="true" />
              </span>
              <h3 className="font-display text-xl leading-tight text-slate-900 sm:text-2xl">Políticas de envío</h3>
            </div>
            <p className="text-sm leading-relaxed text-slate-700 sm:text-base">
              Realizamos envíos a toda Colombia. El valor del envío y el tiempo estimado de entrega se calculan de acuerdo con el destino, las características del pedido y la logística disponible para tu ubicación.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-slate-600 sm:text-base">
              Trabajamos con diferentes opciones de transporte para brindar una entrega segura. La información final de envío se confirmará antes de completar tu compra.
            </p>
          </article>
          <article id="returns-policy" className="scroll-mt-[13rem] rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_12px_30px_-18px_rgba(15,23,42,0.3)] sm:scroll-mt-[8rem] sm:p-6">
            <div className="mb-4 flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[#1e3a8a]">
                <RefreshCw size={20} aria-hidden="true" />
              </span>
              <h3 className="font-display text-xl leading-tight text-slate-900 sm:text-2xl">Políticas de cambios y devoluciones</h3>
            </div>
            <p className="text-sm leading-relaxed text-slate-700 sm:text-base">
              Puedes solicitar cambios o devoluciones dentro de los primeros 30 días calendario posteriores a tu compra, siempre que el producto se encuentre en las mismas condiciones en las que fue entregado.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-slate-600 sm:text-base">
              El costo del envío de regreso corre por cuenta del cliente. La gestión de la solicitud de cambio o devolución no tiene costo adicional por parte de Urban Sport Store.
            </p>
          </article>
        </div>
      </section>

      <section className="bg-[#0b1220] py-5 sm:py-6 md:py-7">
        <div className="mx-auto max-w-xl px-3 text-center sm:px-4">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-blue-200 sm:text-xs">Mantente al día</p>
          <h2 className="font-display text-2xl leading-[1.05] text-white sm:text-3xl">Recibe novedades</h2>
          <p className="mt-2 text-xs text-blue-200 sm:text-sm">Novedades de UrbanSport Store.</p>
          <form onSubmit={handleNewsletterSubmit} className="mx-auto mt-4 flex max-w-sm flex-col gap-2 sm:flex-row" aria-live="polite">
            <label htmlFor="newsletter-email" className="sr-only">Correo electrónico</label>
            <input
              id="newsletter-email"
              name="email"
              type="email"
              autoComplete="email"
              required
              disabled={!newsletterAvailable}
              value={newsletterEmail}
              onChange={(event) => setNewsletterEmail(event.target.value)}
              placeholder="tu@email.com"
              className="flex-1 rounded-xl bg-white px-4 py-3 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:bg-slate-200"
            />
            <button
              type="submit"
              disabled={newsletterLoading || !newsletterAvailable || !newsletterConsent}
              className="w-full whitespace-nowrap rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 active:bg-primary/80 focus-visible:outline-[#1e3a8a] focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto"
            >
              {newsletterLoading ? "Enviando…" : "Suscribirme"}
            </button>
          </form>
          <label className="mx-auto mt-3 flex max-w-sm items-start gap-2 text-left text-xs text-blue-100">
            <input
              type="checkbox"
              checked={newsletterConsent}
              onChange={(event) => setNewsletterConsent(event.target.checked)}
              className="mt-0.5 accent-primary focus-visible:outline-white focus-visible:outline-offset-2"
              aria-label="Acepto la Política de Privacidad"
            />
            <span>
              Al suscribirte aceptas nuestra <a href={privacyPolicyUrl} className="font-bold underline underline-offset-2 focus-visible:outline-white focus-visible:outline-offset-2">Política de Privacidad</a>.
            </span>
          </label>
          {!newsletterAvailable && (
            <p role="status" aria-live="polite" className="mx-auto mt-3 max-w-sm text-xs text-blue-100">
              {STORE_CONFIG.newsletterDisabledMessage}
            </p>
          )}
          {newsletterMessage && (
            <p role={newsletterError ? "alert" : "status"} aria-live="polite" className={`mt-3 text-sm ${newsletterError ? "text-red-100" : "text-emerald-100"}`}>
              {newsletterMessage}
            </p>
          )}
        </div>
      </section>

    </main>
      <footer className="bg-[#0b1220] pb-6 pt-10 text-slate-300 sm:pb-8 sm:pt-14">
        <div className="mx-auto max-w-7xl px-3 sm:px-4 md:px-6">
          <div className="mb-8 grid grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-8">
            <div>
              <div className="mb-3 flex items-center gap-2 sm:mb-4">
                <span className="font-extrabold text-white text-xs sm:text-sm">Urban<span className="text-[#f59e0b]">Sport</span></span>
              </div>
              <p className="text-[11px] leading-relaxed text-slate-400 sm:text-xs">Moda deportiva y accesorios para entrenar, moverte y vestir con estilo.</p>
            </div>
            <div className="grid gap-6 sm:grid-cols-2">
              <div>
                <p className="mb-3 text-xs font-bold uppercase tracking-widest text-white">Comprar</p>
                <ul className="space-y-2">
                  {homeCategories.map((category) => (
                    <li key={category.name}>
                      <button type="button" onClick={() => { onCategorySelect(category.filterCategory); onNavigate("catalog"); }} className="min-h-10 w-full text-left text-xs text-slate-400 transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
                        {category.name}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="mb-3 text-xs font-bold uppercase tracking-widest text-white">Ayuda</p>
                <ul className="space-y-2">
                  <li><button type="button" onClick={() => onNavigate("contact")} className="min-h-10 w-full text-left text-xs text-slate-400 transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">Contacto</button></li>
                  <li><a href="#shipping-policy" className="flex min-h-10 w-full items-center text-xs text-slate-400 transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">Envíos</a></li>
                  <li><a href="#returns-policy" className="flex min-h-10 w-full items-center text-xs text-slate-400 transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">Cambios y devoluciones</a></li>
                  <li><button type="button" onClick={() => onNavigate("terms")} className="min-h-10 w-full text-left text-xs text-slate-400 transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">Términos y condiciones</button></li>
                  <li><button type="button" onClick={() => onNavigate("privacy")} className="min-h-10 w-full text-left text-xs text-slate-400 transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">Política de privacidad</button></li>
                  <li><button type="button" onClick={() => onNavigate("shipping")} className="min-h-10 w-full text-left text-xs text-slate-400 transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">Envíos</button></li>
                </ul>
                <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-200">Métodos de pago</p>
                  <p className="mt-2 text-xs leading-relaxed text-slate-400">PSE, tarjetas de crédito/débito, pago contra entrega</p>
                </div>
              </div>
            </div>
          </div>
          <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-800 pt-6 sm:flex-row">
            <p className="text-xs text-slate-500">© {new Date().getFullYear()} UrbanSport Store. Todos los derechos reservados.</p>
          </div>
        </div>
      </footer>
    </>
  );
}

function LegalPage({ kind, onNavigate }: { kind: View; onNavigate: (v: View) => void }) {
  const maps: Record<Exclude<View, "home" | "catalog" | "product" | "checkout" | "login" | "register" | "account" | "admin-login" | "admin" | "password-reset">, { title: string; paragraph: string } > = {
    privacy: {
      title: "Política de privacidad",
      paragraph: "Urban Sport Store recolecta la información necesaria para procesar tus pedidos, mejorar tu experiencia de compra y comunicarte con respecto a envíos, cambios, promociones y atención al cliente. Usamos tus datos solo para fines operativos y de servicio, nunca para terceros ajenos a la operación comercial. Tienes derecho a acceder, corregir, actualizar o solicitar la eliminación de tus datos personales de acuerdo con la normativa aplicable.",
    },
    terms: {
      title: "Términos y condiciones",
      paragraph: "Al realizar una compra en Urban Sport Store aceptas nuestros términos de venta, la disponibilidad de inventario, los métodos de pago autorizados y las condiciones de entrega y atención al cliente. Nos reservamos el derecho a cancelar pedidos cuando se detecten inconsistencias en la información del cliente o en la forma de pago, con el fin de garantizar una operación segura y transparente.",
    },
    shipping: {
      title: "Envíos",
      paragraph: "Realizamos envíos a Cali y a todo Colombia con tiempos estimados según la ciudad, la zona y la logística disponible. Si tu compra supera $150.000 COP, el envío puede quedar habilitado de forma gratuita según la promoción vigente. El valor final del envío se confirma al momento de confirmar tu pedido.",
    },
    returns: {
      title: "Cambios y devoluciones",
      paragraph: "Puedes solicitar cambios o devoluciones dentro de los primeros 30 días calendario desde la entrega, siempre que el producto venga en las mismas condiciones en que fue entregado y con su empaque original. En caso de un error de nuestro lado, la devolución o reemplazo se gestionará sin costo adicional para ti. Si el motivo es un cambio de preferencia o talla, el envío de regreso puede ser asumido por el cliente.",
    },
    contact: {
      title: "Contacto",
      paragraph: "Para asesoría, soporte, pedidos y seguimiento, puedes escribirnos al correo Urbansportstore@outlook.com. También puedes comunicarte por el canal oficial de WhatsApp o redes sociales de Urban Sport Store para consultas rápidas y atención personalizada. Nuestro horario de atención es de lunes a sábado, con respuesta en el menor tiempo posible.",
    },
  };

  const item = maps[kind as keyof typeof maps];
  if (!item) return null;

  return (
    <main className="mx-auto max-w-3xl px-4 pb-16 pt-28 sm:px-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)] sm:p-8">
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-[#1e3a8a]">Configuración pendiente</p>
        <h1 className="font-display text-3xl text-slate-900 sm:text-4xl">{item.title}</h1>
        <p className="mt-4 text-base leading-relaxed text-slate-600">{item.paragraph}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <button type="button" onClick={() => onNavigate("home")} className="min-h-11 rounded-xl bg-[#bfdbfe] px-5 py-3 text-sm font-bold text-[#0b1220] hover:bg-[#a8caff]">Volver a la home</button>
          <button type="button" onClick={() => onNavigate("catalog")} className="min-h-11 rounded-xl border border-slate-200 bg-slate-50 px-5 py-3 text-sm font-bold text-slate-700 hover:bg-slate-100">Explorar catálogo</button>
        </div>
      </div>
    </main>
  );
}


// ─── CATALOG PAGE ─────────────────────────────────────────────────────────────

function CatalogPage({ filterCategory, selectedBrand, setSelectedBrand, sortBy, setSortBy, onSelectProduct, onAddToCart, onNavigate, onCategorySelect, products, categories, productsStatus, onRetryProducts, headerOffset }: {
  filterCategory: Category | null; onSelectProduct: (p: Product) => void;
  selectedBrand: string | null; setSelectedBrand: React.Dispatch<React.SetStateAction<string | null>>;
  sortBy: string; setSortBy: React.Dispatch<React.SetStateAction<string>>;
  onAddToCart: (p: Product, size: string, color: string) => void;
  onNavigate: (v: View) => void;
  onCategorySelect: (c: Category | null) => void;
  products: Product[];
  categories: CategoryOption[];
  productsStatus: ProductsStatus;
  onRetryProducts: () => void;
  headerOffset: number;
}) {
  const selectedCat = filterCategory;
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const allBrands = [...new Set(products.map((p) => p.brand))];
  const availableCategories = [...new Set([...categories.map((category) => category.name), ...getProductCategories(products)])];
  const filtered = useMemo(() => {
    let list = products;
    if (selectedCat) list = list.filter((p) => p.category === selectedCat);
    if (selectedBrand) list = list.filter((p) => p.brand === selectedBrand);
    if (sortBy === "precio-asc") list = [...list].sort((a, b) => a.price - b.price);
    if (sortBy === "precio-desc") list = [...list].sort((a, b) => b.price - a.price);
    if (sortBy === "rating") list = [...list].sort((a, b) => b.rating - a.rating);
    if (sortBy === "novedades") list = [...list].sort((a) => a.isNew ? -1 : 1);
    return list;
  }, [products, selectedCat, selectedBrand, sortBy]);

  return (
    <main style={{ paddingTop: `${headerOffset + 16}px` }} className="pb-6 sm:pb-8 min-h-screen max-w-7xl mx-auto px-3 sm:px-4 md:px-6">
      {/* Breadcrumbs */}
      <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-6 overflow-x-auto pb-2">
          <button onClick={() => onNavigate("home")} className="hover:text-slate-600 cursor-pointer whitespace-nowrap">Inicio</button>
        <span className="text-slate-700 font-semibold whitespace-nowrap">{selectedCat ?? "Todos los productos"}</span>
      </div>

      <div className="flex flex-col gap-6 md:gap-8">
        {/* Sidebar - Horizontal centered for desktop */}
        <aside className="hidden lg:block">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
            <div>
              <p className="text-xs font-bold text-slate-800 uppercase tracking-widest mb-3">Categoría</p>
              <div className="space-y-0.5">
                <button onClick={() => onCategorySelect(null)} className={`w-full text-left px-3 py-2 rounded-xl text-sm transition-colors ${!selectedCat ? "bg-[#bfdbfe] text-[#0b1220] font-bold" : "text-slate-600 hover:bg-slate-100"}`}>
                  Todos ({products.length})
                </button>
                {availableCategories.map((category) => {
                  const count = products.filter((product) => product.category === category).length;
                  return (
                    <button key={category} onClick={() => onCategorySelect(category)} className={`w-full text-left px-3 py-2 rounded-xl text-sm transition-colors flex justify-between items-center ${selectedCat === category ? "bg-[#bfdbfe] text-[#0b1220] font-bold" : "text-slate-600 hover:bg-slate-100"}`}>
                      <span>{category}</span><span className="text-xs opacity-60">{count}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </aside>

        {/* Main */}
        <div className="w-full">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-3 mb-5">
            <h1 className="text-lg font-extrabold text-slate-900 flex-1">
              {selectedCat ?? "Todos los productos"}
              <span className="text-sm font-normal text-slate-400 ml-2">
                {productsStatus === "loading" ? "(cargando)" : productsStatus === "error" ? "(sin conexión)" : `(${filtered.length} resultados)`}
              </span>
            </h1>
            <button onClick={() => setMobileFiltersOpen((open) => !open)} className="lg:hidden flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-slate-200 text-sm text-slate-600 shadow-sm">
              <Filter size={14} /> Filtros
            </button>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}
              className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-none focus:border-[#1e3a8a]/50 cursor-pointer shadow-sm">
              <option value="relevancia">Más relevantes</option>
              <option value="novedades">Novedades</option>
              <option value="precio-asc">Precio: menor a mayor</option>
              <option value="precio-desc">Precio: mayor a menor</option>
              <option value="rating">Mejor calificados</option>
            </select>
            <div className="hidden sm:flex border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
              <button onClick={() => setViewMode("grid")}
                className={`p-2 transition-colors ${viewMode === "grid" ? "bg-[#bfdbfe] text-[#0b1220]" : "text-slate-500 hover:bg-slate-50"}`}>
                <Grid3X3 size={15} />
              </button>
              <button onClick={() => setViewMode("list")}
                className={`p-2 transition-colors ${viewMode === "list" ? "bg-[#bfdbfe] text-[#0b1220]" : "text-slate-500 hover:bg-slate-50"}`}>
                <Layers size={15} />
              </button>
            </div>
          </div>

          {mobileFiltersOpen && (
            <div className="mb-5 space-y-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm lg:hidden">
              <div className="grid gap-3">
                <button onClick={() => onCategorySelect(null)} className="px-4 py-3 rounded-2xl bg-[#bfdbfe] text-[#0b1220] text-sm font-semibold">Mostrar todos ({products.length})</button>
                <div>
                  <p className="text-xs font-bold text-slate-800 uppercase tracking-widest mb-2">Marca</p>
                  <div className="grid grid-cols-2 gap-2">
                    {allBrands.map((brand) => (
                      <button key={brand} onClick={() => { setSelectedBrand(brand === selectedBrand ? null : brand); }}
                        className={`rounded-2xl px-3 py-2 text-sm text-left ${selectedBrand === brand ? "bg-[#bfdbfe] text-[#0b1220]" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>
                        {brand}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-800 uppercase tracking-widest mb-2">Categoría</p>
                  <div className="grid grid-cols-2 gap-2">
                    {availableCategories.map((category) => (
                      <button key={category} onClick={() => onCategorySelect(category)}
                        className={`rounded-2xl px-3 py-2 text-sm text-left ${selectedCat === category ? "bg-[#bfdbfe] text-[#0b1220]" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>
                        {category}
                      </button>
                    ))}
                  </div>
                </div>
                <button onClick={() => { onCategorySelect(null); setSelectedBrand(null); setMobileFiltersOpen(false); }}
                  className="w-full px-4 py-3 rounded-2xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50">Limpiar filtros</button>
              </div>
            </div>
          )}

          {/* Active filters */}
          {(selectedCat || selectedBrand) && (
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <span className="text-xs text-slate-500">Filtros:</span>
              {selectedCat && (
                <button onClick={() => onCategorySelect(null)}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#bfdbfe]/10 text-[#1e3a8a] text-xs border border-[#bfdbfe]/20 hover:bg-[#bfdbfe]/20 transition-colors font-semibold">
                  {selectedCat} <X size={11} />
                </button>
              )}
              {selectedBrand && (
                <button onClick={() => setSelectedBrand(null)}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#bfdbfe]/10 text-[#1e3a8a] text-xs border border-[#bfdbfe]/20 hover:bg-[#bfdbfe]/20 transition-colors font-semibold">
                  {selectedBrand} <X size={11} />
                </button>
              )}
              <button onClick={() => { onCategorySelect(null); setSelectedBrand(null); }}
                className="text-xs text-slate-400 hover:text-slate-600 transition-colors underline">Limpiar todo</button>
            </div>
          )}

          {productsStatus !== "ready" ? (
            <ProductStatusNotice status={productsStatus} onRetry={onRetryProducts} />
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 sm:py-24 gap-4">
              <div className="w-14 sm:w-16 h-14 sm:h-16 rounded-2xl bg-slate-100 flex items-center justify-center">
                <Package size={24} className="text-slate-400" />
              </div>
              <p className="text-sm text-slate-500">{products.length === 0 ? "Aún no hay productos publicados." : "Sin resultados para estos filtros."}</p>
              <Btn variant="outline" onClick={() => { onCategorySelect(null); setSelectedBrand(null); }}>Limpiar filtros</Btn>
            </div>
          ) : (
            <div className="grid w-full min-w-0 grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 lg:gap-5 2xl:grid-cols-5">
              {filtered.map((p) => (
                <ProductCard key={p.id} product={p} onSelect={onSelectProduct} onAddToCart={onAddToCart} />
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

// ─── PRODUCT DETAIL ───────────────────────────────────────────────────────────

function ProductDetailPage({ product, products, onBack, onAddToCart, onNavigate, onSelectProduct, headerOffset }: {
  product: Product; products: Product[]; onBack: () => void;
  onAddToCart: (p: Product, size: string, color: string) => void;
  onNavigate: (v: View) => void;
  onSelectProduct: (product: Product) => void;
  headerOffset: number;
}) {
  const requiresSize = hasSelectableSizes(product.sizes);
  const [selectedSize, setSelectedSize] = useState(requiresSize ? "" : product.sizes[0] ?? "");
  const [selectedColor, setSelectedColor] = useState(product.colors[0]?.name ?? "");
  const [qty, setQty] = useState(1);
  const [tab, setTab] = useState<"specs" | "reviews">("specs");
  const [added, setAdded] = useState(false);
  const originalPrice = product.originalPrice;
  const hasRealDiscount = typeof originalPrice === "number" && originalPrice > product.price;
  const savings = hasRealDiscount ? (originalPrice ?? 0) - product.price : 0;

  const handleAdd = () => {
    if (product.stock <= 0 || (requiresSize && !selectedSize)) return false;
    for (let i = 0; i < qty; i++) onAddToCart(product, selectedSize, selectedColor);
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
    return true;
  };

  return (
    <main style={{ paddingTop: `${headerOffset + 16}px` }} className="pb-8 min-h-screen max-w-7xl mx-auto px-4 sm:px-6">
      {/* Breadcrumbs */}
      <button type="button" onClick={onBack} className="mb-4 inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-slate-700 hover:text-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
        <ChevronLeft size={16} /> Volver al catálogo
      </button>
      <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-6">
        <button onClick={() => onNavigate("home")} className="hover:text-slate-600">Inicio</button>
        <ChevronRight size={12} />
        <button onClick={onBack} className="hover:text-slate-600">{product.category}</button>
        <ChevronRight size={12} />
        <span className="text-slate-700 font-semibold truncate max-w-xs">{product.name}</span>
      </div>

      <div className="mb-14 grid min-w-0 grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1.08fr)_minmax(20rem,0.92fr)] lg:gap-10">
        <section aria-label={`Galería de ${product.name}`} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
          <ProductGallery key={product.id} main_image={product.image} images={product.images} productName={product.name} />
        </section>

        <section aria-label={`Información de ${product.name}`} className="min-w-0 space-y-6 py-1 sm:py-2">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-extrabold text-[#1e3a8a]">{product.brand}</span>
              <span className="text-slate-300">|</span>
              <span className="text-xs text-slate-400 font-mono">{product.sku}</span>
              {product.gender && <Badge>{product.gender}</Badge>}
            </div>
            <h1 className="font-display text-[32px] sm:text-[40px] text-slate-900 leading-[1.02] mb-3">{product.name}</h1>
            {product.reviews > 0 && product.rating > 0 && <StarRating rating={product.rating} reviews={product.reviews} />}
          </div>

          {/* Price */}
          <div className="border-y border-slate-200 py-4">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="price text-3xl text-slate-900">{fmt(product.price)}</span>
              {hasRealDiscount && originalPrice !== undefined && (
                <span className="price text-lg text-slate-400 line-through">{fmt(originalPrice)}</span>
              )}
              {hasRealDiscount && product.discount && <Badge variant="sale">-{product.discount}%</Badge>}
            </div>
            {savings > 0 && (
              <p className="price text-sm text-emerald-600 mt-1">Ahorras {fmt(savings)} COP</p>
            )}
            <p className="text-xs text-slate-400 mt-1">Precio COP incluye IVA</p>
          </div>

          {/* Stock */}
          <div className="flex items-center gap-2">
            {product.stock > 15 ? (
              <><div className="w-2 h-2 rounded-full bg-emerald-500" /><span className="text-sm text-emerald-700 font-semibold">En stock ({product.stock} disponibles)</span></>
            ) : product.stock > 0 ? (
              <><div className="w-2 h-2 rounded-full bg-amber-500" /><span className="text-sm text-amber-700 font-semibold">¡Solo {product.stock} unidades!</span></>
            ) : (
              <><div className="w-2 h-2 rounded-full bg-red-500" /><span className="text-sm text-red-600 font-semibold">Agotado</span></>
            )}
          </div>

          {/* Color selector */}
          {product.colors.length > 0 && (
            <div>
              <p className="text-sm font-bold text-slate-700 mb-2.5">Color</p>
              <ColorSelector colors={product.colors} selected={selectedColor} onSelect={setSelectedColor} />
            </div>
          )}

          {product.sizes.length > 0 && (
            <div>
              <div className="flex justify-between items-center mb-2.5">
                <p className="text-sm font-bold text-slate-700">Tallas disponibles</p>
              </div>
              <SizeSelector sizes={product.sizes} selected={selectedSize} onSelect={setSelectedSize} />
              {requiresSize && !selectedSize && <p role="status" className="mt-2 text-xs text-slate-500">Selecciona una talla para agregar este producto.</p>}
            </div>
          )}

          {/* Qty */}
          <div className="flex items-center gap-4">
            <p className="text-sm font-bold text-slate-700">Cantidad:</p>
            <div className="flex items-center border border-slate-200 rounded-xl overflow-hidden bg-white">
              <button type="button" disabled={product.stock <= 0} aria-label="Reducir cantidad" onClick={() => setQty(Math.max(1, qty - 1))}
                className="w-10 h-10 flex items-center justify-center text-slate-500 hover:bg-slate-100 transition-colors">
                <Minus size={14} />
              </button>
              <span className="w-10 text-center text-sm font-extrabold text-slate-800">{qty}</span>
              <button type="button" disabled={product.stock <= 0 || qty >= product.stock} aria-label="Aumentar cantidad" onClick={() => setQty(Math.min(product.stock, qty + 1))}
                className="w-10 h-10 flex items-center justify-center text-slate-500 hover:bg-slate-100 transition-colors">
                <Plus size={14} />
              </button>
            </div>
          </div>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row gap-3">
            <button type="button" disabled={product.stock <= 0 || (requiresSize && !selectedSize)} onClick={handleAdd}
              className={`flex-1 py-3.5 rounded-xl text-sm font-extrabold flex items-center justify-center gap-2 transition-all duration-300 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600 ${
                added ? "bg-emerald-500 text-white shadow-lg shadow-emerald-200" : "bg-black text-white hover:bg-slate-900 shadow-lg shadow-slate-800"
              }`}>
              {product.stock <= 0 ? "Agotado" : requiresSize && !selectedSize ? "Selecciona una talla" : added ? <><Check size={16} /> Agregado al carrito</> : <><ShoppingCart size={16} /> Agregar al carrito</>}
            </button>
            <button type="button" disabled={product.stock <= 0 || (requiresSize && !selectedSize)} onClick={() => { if (handleAdd()) onNavigate("checkout"); }}
              className="flex-1 py-3.5 rounded-xl text-sm font-extrabold border-2 border-black text-black hover:bg-slate-100 disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-100 disabled:text-slate-500 flex items-center justify-center gap-2 transition-colors">
              Comprar ahora
            </button>
          </div>
        </section>
      </div>

      <section aria-labelledby="product-description-title" className="mb-10 border-t border-slate-200 pt-8">
        <h2 id="product-description-title" className="mb-3 text-xl font-bold text-slate-900">Descripción</h2>
        {product.description.trim() ? (
          <p className="max-w-3xl whitespace-pre-line text-sm leading-7 text-slate-600">{product.description}</p>
        ) : (
          <p className="text-sm text-slate-500">Este producto aún no tiene descripción.</p>
        )}
      </section>

      {/* Tabs */}
      <div className="border-b border-slate-200 mb-6 flex gap-1">
        {(["specs", "reviews"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-5 py-3 text-sm font-bold border-b-2 transition-all ${
              tab === t ? "border-[#bfdbfe] text-[#1e3a8a]" : "border-transparent text-slate-400 hover:text-slate-700"
            }`}>
            {{ specs: "Especificaciones", reviews: "Reseñas" }[t]}
          </button>
        ))}
      </div>

      {tab === "specs" && product.specifications?.length ? (
        <div className="max-w-3xl overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <caption className="sr-only">Especificaciones de {product.name}</caption>
            <tbody>
              {product.specifications.map((specification, index) => (
                <tr key={`${specification.name}-${index}`} className="border-b border-slate-200">
                  <th scope="row" className="w-1/3 py-3 pr-4 font-semibold text-slate-700">{specification.name}</th>
                  <td className="whitespace-pre-line py-3 text-slate-600">{specification.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : tab === "specs" && product.specs?.length ? (
        <ul className="max-w-3xl space-y-2">
          {product.specs.map((specification, index) => (
            <li key={index} className="flex items-start gap-3 border-b border-slate-200 py-3 text-sm text-slate-600">
              <Check size={14} className="mt-0.5 shrink-0 text-[#1e3a8a]" />
              <span>{specification}</span>
            </li>
          ))}
        </ul>
      ) : tab === "specs" ? (
        <p className="max-w-2xl text-sm text-slate-500">Las especificaciones técnicas aún no están disponibles.</p>
      ) : null}

      {tab === "reviews" && (
        <p className="max-w-2xl rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
          Las reseñas aún no están disponibles para este producto.
        </p>
      )}

      {/* Related */}
      <div className="mt-16">
        <h3 className="font-display text-2xl sm:text-[28px] text-slate-900 leading-[1.05] mb-6">También te puede interesar</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 lg:gap-5 2xl:grid-cols-5">
          {products.filter((p) => p.id !== product.id && p.category === product.category).slice(0, 4).map((p) => (
            <ProductCard key={p.id} product={p} onSelect={onSelectProduct} onAddToCart={onAddToCart} />
          ))}
        </div>
      </div>
    </main>
  );
}

// ─── CHECKOUT ────────────────────────────────────────────────────────────────

function CheckoutPage({ cart, onNavigate, addresses, selectedAddressId, onSelectAddress, onCreateAddress, onPaymentStarted }: { cart: StorefrontCartLine[]; onNavigate: (v: View) => void; addresses: Address[]; selectedAddressId: string; onSelectAddress: (id: string) => void; onCreateAddress: (address: Omit<Address, 'id'>) => void; onPaymentStarted: () => void; }) {
  const [step, setStep] = useState(0);
  const [showNewAddress, setShowNewAddress] = useState(false);
  const [recipientName, setRecipientName] = useState('');
  const [paymentError, setPaymentError] = useState('');
  const [paymentStarting, setPaymentStarting] = useState(false);
  const [orderAwaitingPayment, setOrderAwaitingPayment] = useState<Order | null>(null);
  const [addressForm, setAddressForm] = useState<Omit<Address, 'id'>>({
    label: "",
    line1: "",
    line2: "",
    city: "",
    state: "",
    postalCode: "",
    country: "Colombia",
    phone: "",
    isDefault: false,
  });
  const subtotal = cart.reduce((s, i) => s + i.product.price * i.qty, 0);
  const STEPS = ["Dirección", "Envío", "Pago"];
  const selectedAddress = addresses.find((address) => address.id === selectedAddressId);

  useEffect(() => {
    setRecipientName(selectedAddress?.recipientName ?? '');
  }, [selectedAddressId, addresses]);

  const startPayment = async () => {
    if (paymentStarting) return;
    if (!selectedAddress || !recipientName.trim()) {
      setPaymentError('Selecciona una dirección e indica el nombre de quien recibe.');
      return;
    }

    const normalizedCountry = selectedAddress.country.trim().toUpperCase();
    const country = normalizedCountry === 'COLOMBIA' ? 'CO' : normalizedCountry;
    if (!/^[A-Z]{2}$/.test(country)) {
      setPaymentError('El país de la dirección debe usar su código de dos letras.');
      return;
    }

    setPaymentStarting(true);
    setPaymentError('');
    try {
      const order = orderAwaitingPayment ?? await createPendingOrder({
        address: {
          recipientName: recipientName.trim(),
          addressLine1: selectedAddress.line1,
          ...(selectedAddress.line2 ? { addressLine2: selectedAddress.line2 } : {}),
          city: selectedAddress.city,
          state: selectedAddress.state,
          postalCode: selectedAddress.postalCode,
          country,
          phone: selectedAddress.phone,
        },
        items: cart.map((item) => ({ productId: item.product.id, quantity: item.qty })),
      });
      setOrderAwaitingPayment(order);
      const session = await createWompiPaymentSession(order.id);
      onPaymentStarted();
      window.location.assign(session.checkoutUrl);
    } catch (error) {
      setPaymentError(error instanceof Error ? error.message : 'No fue posible iniciar el pago.');
    } finally {
      setPaymentStarting(false);
    }
  };

  return (
    <main className="pt-8 sm:pt-10 md:pt-12 pb-10 min-h-screen max-w-5xl mx-auto px-4 sm:px-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <button onClick={() => onNavigate("home")} className="flex items-center gap-2 text-slate-500 hover:text-slate-800 transition-colors text-sm">
          <ChevronLeft size={15} /> Volver
        </button>
        <div className="flex items-center gap-2 ml-2">
          <span className="font-bold text-slate-800">Checkout</span>
        </div>
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-2 mb-10 overflow-x-auto pb-1">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-2 shrink-0">
            <div className={`flex items-center gap-2 ${i <= step ? "text-[#1e3a8a]" : "text-slate-400"}`}>
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all ${
                i < step ? "bg-[#bfdbfe] border-[#bfdbfe] text-[#0b1220]" :
                i === step ? "border-[#bfdbfe] text-[#1e3a8a] bg-blue-50" :
                "border-slate-200 text-slate-400"
              }`}>
                {i < step ? <Check size={13} /> : i + 1}
              </div>
              <span className="text-sm font-bold hidden sm:block">{s}</span>
            </div>
            {i < STEPS.length - 1 && <div className={`h-0.5 w-8 sm:w-14 rounded ${i < step ? "bg-[#bfdbfe]" : "bg-slate-200"}`} />}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          {step === 0 && (
            <div className="space-y-3 sm:space-y-4">
              <h3 className="text-base sm:text-lg font-extrabold text-slate-900 mb-3 sm:mb-4">Dirección de entrega</h3>
              {addresses.length === 0 && (
                <p className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">Agrega una dirección de entrega para continuar con tu pedido.</p>
              )}
              {addresses.length > 0 && (
                <div>
                  <label htmlFor="checkout-recipient" className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-500">Nombre de quien recibe</label>
                  <input
                    id="checkout-recipient"
                    required
                    value={recipientName}
                    onChange={(event) => setRecipientName(event.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800"
                    autoComplete="name"
                  />
                </div>
              )}
              {addresses.map((a) => (
                <label key={a.id} className={"flex gap-2 sm:gap-3 p-3 sm:p-4 rounded-lg sm:rounded-2xl border-2 cursor-pointer transition-all " + (selectedAddressId === a.id ? "border-[#bfdbfe] bg-blue-50/50" : "border-slate-200 hover:border-slate-300")}>
                  <input type="radio" name="addr" checked={selectedAddressId === a.id} onChange={() => onSelectAddress(a.id)} className="mt-1 accent-[#1e3a8a] shrink-0" />
                  <div>
                    <p className="text-xs sm:text-sm font-bold text-slate-800 flex items-center gap-2 flex-wrap">
                      <MapPin size={13} className="text-[#1e3a8a] shrink-0" /> {a.label}
                      {a.isDefault && <Badge variant="new">Predeterminada</Badge>}
                    </p>
                    <p className="text-xs sm:text-sm text-slate-500 mt-0.5">{a.line1}{a.line2 ? ", " + a.line2 : ""}</p>
                    <p className="text-xs sm:text-sm text-slate-500">{a.city}, {a.state} · {a.postalCode}</p>
                    <p className="text-xs sm:text-sm text-slate-500">{a.country} · {a.phone}</p>
                  </div>
                </label>
              ))}
              <button type="button" onClick={() => setShowNewAddress((prev) => !prev)}
                className="w-full p-3 sm:p-4 rounded-lg sm:rounded-2xl border-2 border-dashed border-slate-200 text-slate-500 hover:border-[#bfdbfe]/50 hover:text-[#1e3a8a] transition-all flex items-center justify-center gap-2 text-xs sm:text-sm font-semibold">
                <Plus size={14} /> {showNewAddress ? "Cancelar" : "Agregar nueva dirección"}
              </button>
              {showNewAddress && (
                <form onSubmit={(event) => {
                  event.preventDefault();
                  onCreateAddress(addressForm);
                  setShowNewAddress(false);
                  setAddressForm({ label: "", line1: "", line2: "", city: "", state: "", postalCode: "", country: "Colombia", phone: "", isDefault: false });
                }} className="space-y-4 p-4 bg-white rounded-3xl border border-slate-200 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.16)]">
                  {[
                    { name: 'label', label: 'Etiqueta', placeholder: 'Casa, Oficina, etc.' },
                    { name: 'line1', label: 'Dirección', placeholder: 'Cra 15 #82-56' },
                    { name: 'line2', label: 'Complemento', placeholder: 'Apto 402 (opcional)', optional: true },
                    { name: 'city', label: 'Ciudad', placeholder: 'Bogotá' },
                    { name: 'state', label: 'Departamento', placeholder: 'Cundinamarca' },
                    { name: 'postalCode', label: 'Código postal', placeholder: '110221' },
                    { name: 'phone', label: 'Teléfono', placeholder: '+57 311 234 5678' },
                  ].map((field) => (
                    <div key={field.name}>
                      <label htmlFor={"checkout-" + field.name} className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">{field.label}</label>
                      <input
                        id={`checkout-${field.name}`}
                        required={field.name !== "line2"}
                        value={(addressForm as any)[field.name] ?? ""}
                        onChange={(e) => setAddressForm((prev) => ({ ...prev, [field.name]: e.target.value }))}
                        placeholder={field.placeholder}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:border-[#1e3a8a]/50"
                      />
                    </div>
                  ))}
                  <label className="flex items-center gap-2 text-sm text-slate-600">
                    <input type="checkbox" checked={addressForm.isDefault} onChange={(e) => setAddressForm((prev) => ({ ...prev, isDefault: e.target.checked }))} className="accent-[#1e3a8a]" />
                    Establecer como dirección predeterminada
                  </label>
                  <Btn type="submit" variant="primary" className="w-full">Guardar dirección</Btn>
                </form>
              )}
            </div>
          )}

          {step === 1 && (
            <div className="space-y-3 sm:space-y-4">
              <h3 className="text-base sm:text-lg font-extrabold text-slate-900 mb-3 sm:mb-4">Envío por confirmar</h3>
              <p role="status" className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
                No hay transportadora, cobertura, costo ni plazo configurados. No se puede cotizar ni prometer una entrega.
              </p>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <h3 className="text-lg font-extrabold text-slate-900 mb-4">Pago con Wompi Sandbox</h3>
              <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-700">
                <p>El pedido se registrará como pendiente y continuarás en el checkout alojado de Wompi.</p>
                <p className="mt-1">El estado solo cambiará cuando el servidor verifique la notificación de pago.</p>
              </div>
              {paymentError && <p role="alert" className="text-sm font-medium text-red-700">{paymentError}</p>}
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3 mt-6 sm:mt-8">
            {step > 0 && <Btn variant="secondary" onClick={() => setStep(step - 1)} className="flex-1 sm:flex-none justify-center"><ChevronLeft size={14} /> Atrás</Btn>}
            <Btn variant="primary" className="flex-1" size="lg" disabled={paymentStarting || (step === 0 && (!selectedAddressId || !selectedAddress || !recipientName.trim()))} onClick={() => step === 2 ? void startPayment() : setStep(step + 1)}>
              {step === 2 ? (paymentStarting ? "Conectando con Wompi…" : <>Pagar con Wompi <ArrowRight size={15} /></>) : <>Continuar <ChevronRight size={15} /></>}
            </Btn>
          </div>
        </div>

        {/* Summary */}
        <div className="lg:col-span-1">
          <div className="bg-white/95 rounded-lg sm:rounded-[30px] border border-slate-200/80 shadow-[0_22px_60px_-42px_rgba(15,23,42,0.18)] p-4 sm:p-5 sticky top-[152px] space-y-4">
            <h3 className="text-xs sm:text-sm font-extrabold text-slate-800">Resumen del pedido</h3>
            <div className="space-y-2 sm:space-y-3 max-h-40 sm:max-h-52 overflow-y-auto">
              {cart.map((item) => (
                    <div key={`${item.product.id}-${item.selectedSize}-${item.selectedColor}`} className="flex gap-2 sm:gap-3">
                  <div className="relative shrink-0">
                    <img src={item.product.image} alt="" onError={(event) => { event.currentTarget.style.display = "none"; }} className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg object-cover bg-slate-100" />
                    <span className="absolute -top-1.5 -right-1.5 w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-[#bfdbfe] text-[#0b1220] text-[8px] sm:text-[9px] font-bold flex items-center justify-center">{item.qty}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] sm:text-xs font-semibold text-slate-700 line-clamp-2 leading-tight">{item.product.name}</p>
                    {item.selectedSize !== "Talla única" && <p className="text-[9px] sm:text-[10px] text-slate-400 mt-0.5">T: {item.selectedSize}</p>}
                    <p className="price text-[11px] sm:text-xs text-slate-900 mt-0.5">{fmt(item.product.price * item.qty)}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="space-y-1 sm:space-y-1.5 text-xs sm:text-sm border-t border-slate-100 pt-3">
              <div className="flex justify-between text-slate-500"><span>Subtotal referencial</span><span className="price text-slate-800">{fmt(subtotal)}</span></div>
              <div className="flex justify-between text-slate-500"><span>Envío</span><span>Por confirmar</span></div>
              <div className="flex justify-between font-extrabold text-slate-900 text-sm sm:text-base border-t border-slate-100 pt-1.5">
                <span>Total</span><span>Por confirmar</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

// ─── LOGIN PAGE ───────────────────────────────────────────────────────────────

function getPasswordRecoveryRequestErrorMessage(error: unknown): string {
  const details = error && typeof error === "object"
    ? error as { status?: number; code?: string; message?: string }
    : {};

  if (details.status === 429 || details.code === "over_email_send_rate_limit" || /rate limit/i.test(details.message ?? "")) {
    return "Se solicitaron varios enlaces recientemente. Espera un momento e inténtalo de nuevo.";
  }
  if (/failed to fetch|network error/i.test(details.message ?? "")) {
    return "No fue posible conectar con el servicio de autenticación. Inténtalo de nuevo más tarde.";
  }
  return "No se pudo enviar el enlace en este momento. Inténtalo de nuevo más tarde.";
}

function getPasswordUpdateErrorMessage(error: unknown): string {
  const details = error && typeof error === "object"
    ? error as { status?: number; code?: string; message?: string }
    : {};

  if (details.code === "otp_expired" || details.code === "session_not_found" || /session.*missing|token.*expired|otp.*expired/i.test(details.message ?? "")) {
    return "El enlace venció o ya fue utilizado. Solicita un nuevo enlace de recuperación.";
  }
  if (details.status === 401 || details.status === 403) {
    return "El enlace de recuperación ya no es válido. Solicita uno nuevo e inténtalo otra vez.";
  }
  return "No se pudo actualizar la contraseña. Inténtalo de nuevo.";
}

function LoginPage({ isRegister, onNavigate, onLogin, headerOffset }: {
  isRegister: boolean; onNavigate: (v: View) => void; headerOffset: number;
  onLogin: (user: User | null, isAdmin: boolean, adminRole: string | null) => void;
}) {
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [legalConsent, setLegalConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recoveryMessage, setRecoveryMessage] = useState<string | null>(null);
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const recoveryRequestInFlight = useRef(false);
  const termsUrl = import.meta.env.VITE_TERMS_URL?.trim() || STORE_CONFIG.termsPath;
  const privacyPolicyUrl = import.meta.env.VITE_PRIVACY_POLICY_URL?.trim() || STORE_CONFIG.privacyPolicyPath;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading || recoveryRequestInFlight.current) return;
    setError(null);
    if (isRegister) {
      if (!name.trim()) {
        setError("Ingresa tu nombre completo.");
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        setError("Ingresa un correo electrónico válido.");
        return;
      }
      if (!password) {
        setError("Ingresa una contraseña.");
        return;
      }
      if (password.length < 8) {
        setError("Usa una contraseña de al menos 8 caracteres.");
        return;
      }
      if (!legalConsent) {
        setError("Debes aceptar los Términos y Condiciones y la Política de Privacidad para crear tu cuenta.");
        return;
      }
    }
    setLoading(true);

    try {
      let user = null;
      if (isRegister) {
        const signUpResult = await signUpWithEmail(email.trim(), password, { name: name.trim() });
        if (signUpResult.error) throw signUpResult.error;
        if (!signUpResult.data.user) throw new Error("No se pudo crear la cuenta.");

        user = signUpResult.data.user;
        const signUpNeedsConfirmation = 'needsConfirmation' in signUpResult && Boolean(signUpResult.needsConfirmation);
        if (signUpNeedsConfirmation) {
          logAuthDiagnostic("signup.confirmation_required", { userId: user.id, email: user.email, sessionPresent: false, redirectTo: "email-confirmation" });
          toast.success("Tu cuenta fue creada. Revisa tu correo electrónico para confirmar tu cuenta antes de iniciar sesión.");
          setName("");
          setEmail("");
          setPassword("");
          setLegalConsent(false);
          return;
        }

        const profileAccess = await getProfileAccess(user);
        if (profileAccess.status === "missing" || profileAccess.status === "inactive") {
          setError("No fue posible verificar los permisos de tu cuenta. Inténtalo de nuevo más tarde.");
          return;
        }
        onLogin(user, profileAccess.isAdmin, profileAccess.role);
        logAuthDiagnostic("login.redirect", { userId: user.id, email: user.email, sessionPresent: Boolean(signUpResult.data.session), isAdmin: profileAccess.isAdmin, redirectTo: profileAccess.isAdmin ? "admin" : "home" });
        toast.success("Registro exitoso. Ya puedes continuar en la tienda.");
        setEmail("");
        setPassword("");
        setName("");
        setLegalConsent(false);
        onNavigate(profileAccess.isAdmin ? "admin" : "home");
        return;
      }

      const signInResult = await signInWithEmail(email, password);
      if (signInResult.error) throw signInResult.error;
      if (!signInResult.data.user) throw new Error("No se pudo iniciar sesión.");
      user = signInResult.data.user;

      const profileAccess = await getProfileAccess(user);
      if (profileAccess.status === "missing" || profileAccess.status === "inactive") {
        setError("No fue posible verificar los permisos de tu cuenta. Inténtalo de nuevo más tarde.");
        return;
      }
      onLogin(user, profileAccess.isAdmin, profileAccess.role);
      logAuthDiagnostic("login.redirect", { userId: user.id, email: user.email, sessionPresent: Boolean(signInResult.data.session), isAdmin: profileAccess.isAdmin, redirectTo: profileAccess.isAdmin ? "admin" : "home" });
      onNavigate(profileAccess.isAdmin ? "admin" : "home");
    } catch (err) {
      if (err instanceof ProfileAccessVerificationError) {
        setError(isRegister
          ? "Tu cuenta se creó, pero no pudimos completar la verificación. Intenta iniciar sesión más tarde."
          : err.message);
        return;
      }
      if (isRegister) {
        setError(getSignUpErrorMessage(err));
        return;
      }
      const message = err instanceof Error ? err.message : "";
      setError(message === "Failed to fetch"
        ? "No fue posible conectar con el servicio de autenticación. Intenta nuevamente más tarde."
        : message || "Ocurrió un error inesperado.");
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordRecovery = async () => {
    if (loading || recoveryRequestInFlight.current) return;
    setError(null);
    setRecoveryMessage(null);

    const normalizedEmail = email.trim();
    if (!normalizedEmail) {
      setError("Escribe tu correo electrónico para recibir el enlace.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError("Escribe un correo electrónico válido para recibir el enlace.");
      return;
    }

    recoveryRequestInFlight.current = true;
    setLoading(true);
    setRecoveryLoading(true);
    try {
      await requestPasswordRecovery(normalizedEmail);
      setRecoveryMessage("Si existe una cuenta asociada a este correo, recibirás un enlace para restablecer tu contraseña.");
    } catch (err) {
      setError(getPasswordRecoveryRequestErrorMessage(err));
    } finally {
      recoveryRequestInFlight.current = false;
      setRecoveryLoading(false);
      setLoading(false);
    }
  };

  return (
    <main
      style={{ paddingTop: `${headerOffset + 24}px`, minHeight: `calc(100svh + ${headerOffset}px)` }}
      className="flex min-h-screen items-start justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100 px-4 pb-8 sm:items-center"
    >
      {/* Decorative elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-[#bfdbfe]/5 rounded-full blur-3xl" />
        <div className="absolute -bottom-32 left-1/3 w-96 h-96 bg-blue-400/5 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* Logo */}
        <div className="text-center mb-6 sm:mb-12">
          <div className="flex items-center justify-center gap-2 mb-4">
            <span className="font-extrabold text-slate-900 text-2xl">Urban<span className="text-[#1e3a8a]">Sport</span></span>
          </div>
          <h1 className="font-display text-[40px] sm:text-[48px] text-slate-900 leading-[1.02] mb-2">
            {isRegister ? "Crear cuenta" : "Bienvenido"}
          </h1>
          <p className="text-slate-600">
            {isRegister ? "Únete a UrbanSport Store hoy" : "Continúa tu aventura deportiva"}
          </p>
        </div>

        {/* Main form card */}
        <div className="bg-white/95 backdrop-blur-sm rounded-3xl border border-blue-200 p-5 shadow-xl space-y-5 sm:p-8 sm:space-y-6">
          <form noValidate={isRegister} onSubmit={handleSubmit} className="space-y-5">
            {/* Name field for register */}
            {isRegister && (
              <div>
                <label htmlFor="auth-name" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">Nombre completo</label>
                <input
                  id="auth-name"
                  required
                  autoComplete="name"
                  value={name}
                  onChange={(e) => { setName(e.target.value); setError(null); }}
                  placeholder="Tu nombre"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-900 placeholder-slate-500 focus:outline-none focus:border-[#1e3a8a] focus:bg-white transition-all duration-200"
                />
              </div>
            )}

            {/* Email */}
            <div>
              <label htmlFor="auth-email" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">Correo electrónico</label>
              <input 
                id="auth-email"
                type="email" 
                required
                autoComplete="email"
                value={email} 
                  onChange={(e) => { setEmail(e.target.value); setRecoveryMessage(null); setError(null); }}
                placeholder="tu@email.com" 
                className="w-full px-4 py-3.5 bg-slate-50 border border-slate-300 rounded-xl text-base text-slate-900 placeholder-slate-500 focus:outline-none focus:border-[#1e3a8a] focus:bg-white transition-all duration-200"
              />
            </div>

            {/* Password */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <label htmlFor="auth-password" className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Contraseña</label>
                {!isRegister && <span className="text-xs text-slate-500">Usa el enlace si necesitas cambiarla.</span>}
              </div>
              <div className="relative">
                <input 
                  id="auth-password"
                  type={showPass ? "text" : "password"} 
                  required
                  minLength={isRegister ? 8 : undefined}
                  autoComplete={isRegister ? "new-password" : "current-password"}
                  value={password} 
                  onChange={(e) => { setPassword(e.target.value); setError(null); }}
                  placeholder="••••••••"
                  className="w-full px-4 py-3.5 bg-slate-50 border border-slate-300 rounded-xl text-base text-slate-900 placeholder-slate-500 focus:outline-none focus:border-[#1e3a8a] focus:bg-white transition-all duration-200"
                />
                <button 
                  type="button" 
                  onClick={() => setShowPass(!showPass)} 
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-900 transition-colors"
                >
                  {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {!isRegister && (
              <div className="text-right">
                <button type="button" disabled={loading} onClick={() => void handlePasswordRecovery()} className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#1e3a8a] hover:text-blue-700 disabled:opacity-60">
                  {recoveryLoading ? <><RefreshCw size={14} className="animate-spin" /> Enviando enlace…</> : "¿Olvidaste tu contraseña?"}
                </button>
              </div>
            )}

            {/* Legal links for register */}
            {isRegister && (
              <label htmlFor="auth-legal-consent" className="flex items-start gap-2 text-sm leading-relaxed text-slate-700">
                <input
                  id="auth-legal-consent"
                  type="checkbox"
                  required
                  checked={legalConsent}
                  disabled={loading}
                  onChange={(event) => { setLegalConsent(event.target.checked); setError(null); }}
                  className="mt-1 accent-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                />
                <span>
                  He leído y acepto los <a href={termsUrl} target="_blank" rel="noreferrer" className="font-semibold text-[#1e3a8a] underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">Términos y Condiciones</a> y la <a href={privacyPolicyUrl} target="_blank" rel="noreferrer" className="font-semibold text-[#1e3a8a] underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">Política de Privacidad</a>.
                </span>
              </label>
            )}

            {/* Error message */}
            {error && (
              <div role="alert" aria-live="assertive" className="rounded-xl border border-red-200 bg-red-50 p-3.5">
                <p className="text-sm font-semibold text-red-800">{isRegister ? "No pudimos crear tu cuenta" : "No pudimos iniciar sesión"}</p>
                <p className="mt-1 text-sm text-red-800">{error}</p>
              </div>
            )}
            {recoveryMessage && <p role="status" aria-live="polite" className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">{recoveryMessage}</p>}

            {/* Submit button */}
            <button 
              type="submit" 
              disabled={loading}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-[#bfdbfe] to-[#93c5fd] text-[#0b1220] font-extrabold text-base hover:shadow-lg hover:shadow-blue-500/30 disabled:opacity-60 disabled:shadow-none transition-all duration-300 flex items-center justify-center gap-2 transform hover:scale-105"
            >
              {loading ? (
                <><RefreshCw size={18} className="animate-spin" /> Procesando…</>
              ) : (
                isRegister ? "Crear mi cuenta" : "Iniciar sesión"
              )}
            </button>
          </form>

        </div>

        {/* Sign up / Sign in toggle */}
        <p className="text-center text-slate-700 mt-8">
          {isRegister ? "¿Ya tienes cuenta? " : "¿No tienes cuenta? "}
          <button 
            onClick={() => onNavigate(isRegister ? "login" : "register")} 
            className="text-[#1e3a8a] font-bold hover:text-blue-600 transition-colors"
          >
            {isRegister ? "Inicia sesión" : "Regístrate"}
          </button>
        </p>
      </div>
    </main>
  );
}

function PasswordRecoveryPage({ onNavigate }: { onNavigate: (view: View) => void }) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [complete, setComplete] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (password.length < 12) {
      setError("La contraseña debe tener al menos 12 caracteres.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setLoading(true);
    try {
      await updatePassword(password);
      await signOut();
      setComplete(true);
    } catch (err) {
      setError(getPasswordUpdateErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100 px-4 py-12">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-7 shadow-xl sm:p-9">
        <p className="text-sm font-bold text-[#1e3a8a]">UrbanSport Store</p>
        <h1 className="mt-3 text-3xl font-extrabold text-slate-900">{complete ? "Contraseña actualizada" : "Crea una contraseña nueva"}</h1>
        {complete ? (
          <div className="mt-6 space-y-5">
            <p role="status" className="text-sm text-slate-600">Ya puedes iniciar sesión con tu contraseña nueva.</p>
            <button type="button" onClick={() => onNavigate("login")} className="w-full rounded-xl bg-[#bfdbfe] px-4 py-3 font-bold text-[#0b1220] hover:bg-[#a8caff]">Ir al inicio de sesión</button>
          </div>
        ) : (
          <form onSubmit={(event) => void handleSubmit(event)} className="mt-6 space-y-4">
            <div>
              <label htmlFor="recovery-password" className="mb-1.5 block text-sm font-semibold text-slate-700">Nueva contraseña</label>
              <input id="recovery-password" type="password" autoComplete="new-password" minLength={12} required value={password} onChange={(event) => setPassword(event.target.value)} className="w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-slate-900 focus:border-blue-600 focus:outline-none" />
            </div>
            <div>
              <label htmlFor="recovery-password-confirm" className="mb-1.5 block text-sm font-semibold text-slate-700">Confirma la contraseña</label>
              <input id="recovery-password-confirm" type="password" autoComplete="new-password" minLength={12} required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-slate-900 focus:border-blue-600 focus:outline-none" />
            </div>
            {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
            <button type="submit" disabled={loading} className="w-full rounded-xl bg-[#bfdbfe] px-4 py-3 font-bold text-[#0b1220] hover:bg-[#a8caff] disabled:opacity-60">{loading ? "Actualizando…" : "Actualizar contraseña"}</button>
          </form>
        )}
      </section>
    </main>
  );
}

// ─── ACCOUNT PAGE ─────────────────────────────────────────────────────────────

function AccountPage({ onNavigate, onLogout, authUser, addresses, onCreateAddress, onUpdateAddress, onDeleteAddress }: { onNavigate: (v: View) => void; onLogout: () => void; authUser: User | null; addresses: Address[]; onCreateAddress: (address: Omit<Address, 'id'>) => void; onUpdateAddress: (addressId: string, updates: Partial<Address>) => void; onDeleteAddress: (addressId: string) => void; }) {
  const [section, setSection] = useState<"orders" | "profile" | "addresses" | "activity">("orders");
  const [editingAddressId, setEditingAddressId] = useState<string | null>(null);
  const [showNewAddressForm, setShowNewAddressForm] = useState(false);
  const [addressForm, setAddressForm] = useState<Omit<Address, 'id'>>({
    label: "",
    line1: "",
    line2: "",
    city: "",
    state: "",
    postalCode: "",
    country: "Colombia",
    phone: "",
    isDefault: false,
  });
  const [auditEntries, setAuditEntries] = useState<{ id: string; ts: number; action: string; meta?: Record<string, any> }[]>([]);
  const [accountProfile, setAccountProfile] = useState<Awaited<ReturnType<typeof getMyProfile>> | null>(null);
  const [profileStatus, setProfileStatus] = useState<"loading" | "ready" | "unavailable">("loading");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState("");
  const [profileForm, setProfileForm] = useState({ firstName: "", lastName: "", phone: "" });
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersStatus, setOrdersStatus] = useState<"loading" | "ready" | "unavailable">("loading");
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [ordersRefresh, setOrdersRefresh] = useState(0);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [orderDetailTargetId, setOrderDetailTargetId] = useState<string | null>(null);
  const [orderDetailLoading, setOrderDetailLoading] = useState(false);
  const [orderDetailError, setOrderDetailError] = useState<string | null>(null);
  const orderDetailRequestId = useRef(0);
  const profileName = accountProfile?.fullName
    || [accountProfile?.firstName, accountProfile?.lastName].filter(Boolean).join(" ")
    || authUser?.email
    || "Cliente";
  const profileEmail = authUser?.email ?? "Correo no disponible";

  useEffect(() => {
    let active = true;
    setProfileStatus("loading");
    void getMyProfile()
      .then((profile) => {
        if (!active) return;
        setAccountProfile(profile);
        setProfileForm({
          firstName: profile.firstName ?? "",
          lastName: profile.lastName ?? "",
          phone: profile.phone ?? "",
        });
        setProfileStatus("ready");
      })
      .catch(() => {
        if (!active) return;
        setProfileStatus("unavailable");
      });
    return () => { active = false; };
  }, [authUser?.id]);

  useEffect(() => {
    let active = true;
    setOrdersStatus("loading");
    setOrdersError(null);
    setSelectedOrder(null);
    setOrderDetailTargetId(null);
    setOrderDetailLoading(false);
    setOrderDetailError(null);
    void listMyOrders()
      .then((result) => {
        if (!active) return;
        setOrders(result);
        setOrdersStatus("ready");
      })
      .catch((error) => {
        if (!active) return;
        setOrdersError(error instanceof Error ? error.message : "No se pudo cargar el historial de pedidos.");
        setOrdersStatus("unavailable");
      });
    return () => {
      active = false;
      orderDetailRequestId.current += 1;
    };
  }, [authUser?.id, ordersRefresh]);

  const handleViewOrder = async (orderId: string) => {
    if (selectedOrder?.id === orderId) {
      setSelectedOrder(null);
      setOrderDetailTargetId(null);
      setOrderDetailError(null);
      return;
    }
    const requestId = ++orderDetailRequestId.current;
    setOrderDetailLoading(true);
    setOrderDetailTargetId(orderId);
    setOrderDetailError(null);
    setSelectedOrder(null);
    try {
      const order = await getMyOrder(orderId);
      if (requestId === orderDetailRequestId.current) setSelectedOrder(order);
    } catch (error) {
      if (requestId === orderDetailRequestId.current) {
        setOrderDetailError(error instanceof Error ? error.message : "No se pudo cargar el detalle del pedido.");
      }
    } finally {
      if (requestId === orderDetailRequestId.current) setOrderDetailLoading(false);
    }
  };

  const handleProfileSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setProfileSaving(true);
    setProfileMessage("");
    try {
      const updates = {
        firstName: profileForm.firstName.trim(),
        lastName: profileForm.lastName.trim(),
        ...(profileForm.phone.trim() ? { phone: profileForm.phone.trim() } : {}),
      };
      const updatedProfile = await updateMyProfile(updates);
      setAccountProfile(updatedProfile);
      setProfileForm({
        firstName: updatedProfile.firstName ?? "",
        lastName: updatedProfile.lastName ?? "",
        phone: updatedProfile.phone ?? "",
      });
      setProfileMessage("Perfil actualizado.");
    } catch (error) {
      setProfileMessage(error instanceof Error ? error.message : "No se pudo actualizar el perfil.");
    } finally {
      setProfileSaving(false);
    }
  };

  const startEdit = (address: Address) => {
    setEditingAddressId(address.id);
    setShowNewAddressForm(true);
    setAddressForm({
      label: address.label,
      line1: address.line1,
      line2: address.line2 ?? "",
      city: address.city,
      state: address.state,
      postalCode: address.postalCode,
      country: address.country,
      phone: address.phone,
      isDefault: address.isDefault ?? false,
    });
  };

  const resetAddressForm = () => {
    setEditingAddressId(null);
    setShowNewAddressForm(false);
    setAddressForm({
      label: "",
      line1: "",
      line2: "",
      city: "",
      state: "",
      postalCode: "",
      country: "Colombia",
      phone: "",
      isDefault: false,
    });
  };

  return (
    <main className="pt-8 sm:pt-10 md:pt-12 pb-8 min-h-screen max-w-5xl mx-auto px-4 sm:px-6">
      <nav aria-label="Secciones de cuenta" className="mb-5 grid grid-cols-2 gap-2 sm:hidden">
        {([
          { key: "orders", label: "Mis pedidos" },
          { key: "profile", label: "Mi perfil" },
          { key: "addresses", label: "Direcciones" },
          { key: "activity", label: "Actividad" },
        ] as const).map((item) => (
          <button key={item.key} type="button" aria-pressed={section === item.key} onClick={() => setSection(item.key)} className={`min-h-11 rounded-lg px-3 text-sm font-semibold ${section === item.key ? "bg-[#bfdbfe] text-[#0b1220]" : "bg-white text-slate-700 border border-slate-200"}`}>
            {item.label}
          </button>
        ))}
      </nav>
      <div className="flex gap-8">
        <aside className="hidden sm:block w-56 shrink-0">
          <div className="bg-white/95 rounded-[30px] border border-slate-200/80 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.18)] overflow-hidden">
            <div className="p-4 border-b border-slate-100 bg-gradient-to-br from-[#1e3a8a] to-[#0b1220]">
              <div className="w-12 h-12 rounded-full bg-white/20 border-2 border-white/30 flex items-center justify-center text-xl font-extrabold text-white mb-2">{profileName.charAt(0).toUpperCase()}</div>
              <p className="text-sm font-extrabold text-white">{profileName}</p>
              <p className="text-xs text-blue-200">{profileEmail}</p>
            </div>
            <div className="p-2 space-y-0.5">
              {([
                { key: "orders", label: "Mis pedidos", icon: <Package size={15} /> },
                { key: "profile", label: "Mi perfil", icon: <Users size={15} /> },
                { key: "addresses", label: "Direcciones", icon: <MapPin size={15} /> },
                { key: "activity", label: "Actividad", icon: <Grid3X3 size={15} /> },
              ] as const).map((item) => (
                <button key={item.key} onClick={() => setSection(item.key)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm transition-colors ${section === item.key ? "bg-blue-50 text-[#1e3a8a] font-bold" : "text-slate-600 hover:bg-slate-50"}`}>
                  {item.icon} {item.label}
                </button>
              ))}
              <button onClick={onLogout}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-red-500 hover:bg-red-50 transition-colors">
                <LogOut size={15} /> Cerrar sesión
              </button>
            </div>
          </div>
        </aside>

        <div className="flex-1 min-w-0">
          {section === "orders" && (
            <div className="space-y-4">
              <h2 className="font-display text-[28px] sm:text-[32px] text-slate-900 leading-[1.05] mb-6">Mis pedidos</h2>
              {ordersStatus === "loading" && (
                <p role="status" className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
                  <LoaderCircle size={16} className="animate-spin" /> Cargando pedidos…
                </p>
              )}
              {ordersStatus === "unavailable" && (
                <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">
                  <p>{ordersError ?? "No se pudo cargar el historial de pedidos."}</p>
                  <button type="button" onClick={() => setOrdersRefresh((value) => value + 1)} className="mt-2 font-semibold underline">Intentar de nuevo</button>
                </div>
              )}
              {ordersStatus === "ready" && orders.length === 0 && (
                <p role="status" className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
                  Todavía no tienes pedidos pendientes.
                </p>
              )}
              {ordersStatus === "ready" && orders.map((order) => (
                <article key={order.id} className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-bold text-slate-900">{order.orderNumber}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {new Date(order.createdAt).toLocaleString("es-CO")}
                      </p>
                    </div>
                    <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900">
                      {order.status === "pending_payment" ? "Pendiente de pago" : order.status}
                    </span>
                  </div>
                  <p className="mt-3 text-sm text-slate-600">
                    Pedido registrado; no se ha iniciado ni cobrado ningún pago.
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-800">
                    Subtotal provisional: {fmt(order.subtotal)} · envío por confirmar
                  </p>
                  {order.reservationExpiresAt && (
                    <p className="mt-1 text-xs text-slate-500">
                      Reserva de inventario hasta {new Date(order.reservationExpiresAt).toLocaleString("es-CO")}.
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => void handleViewOrder(order.id)}
                    disabled={orderDetailLoading}
                    className="mt-4 min-h-10 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                  >
                    {orderDetailLoading && orderDetailTargetId === order.id ? "Cargando…" : selectedOrder?.id === order.id ? "Ocultar detalle" : "Ver detalle"}
                  </button>
                  {orderDetailError && orderDetailTargetId === order.id && selectedOrder === null && (
                    <p role="alert" className="mt-3 text-sm text-red-700">{orderDetailError}</p>
                  )}
                  {selectedOrder?.id === order.id && (
                    <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
                      <div>
                        <h3 className="text-sm font-bold text-slate-800">Dirección registrada</h3>
                        <p className="mt-1 text-sm text-slate-600">
                          {selectedOrder.shippingAddress.recipientName} · {selectedOrder.shippingAddress.addressLine1}
                          {selectedOrder.shippingAddress.addressLine2 ? `, ${selectedOrder.shippingAddress.addressLine2}` : ""}
                        </p>
                        <p className="text-sm text-slate-600">
                          {selectedOrder.shippingAddress.city}, {selectedOrder.shippingAddress.state} · {selectedOrder.shippingAddress.postalCode}
                        </p>
                      </div>
                      <ul className="space-y-2">
                        {selectedOrder.items.map((item) => (
                          <li key={item.id ?? item.productId} className="flex justify-between gap-3 text-sm text-slate-600">
                            <span>{item.quantity} × {item.productName}</span>
                            <span className="shrink-0">{fmt(item.totalPrice)}</span>
                          </li>
                        ))}
                      </ul>
                      <p className="text-xs text-slate-500">
                        El pedido no incluye pago ni checkout. El valor de envío y el total final se confirmarán posteriormente.
                      </p>
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}

          {section === "profile" && (
            <div className="space-y-5 max-w-lg">
              <h2 className="font-display text-[28px] sm:text-[32px] text-slate-900 leading-[1.05] mb-2">Mi perfil</h2>
              <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
                La edición remota del perfil permanece pendiente de validación del esquema. No se guardan cambios localmente.
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Nombre</label>
                  <input value={profileName} readOnly className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Correo electrónico</label>
                  <input value={profileEmail} readOnly className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800" />
                </div>
              </div>
            </div>
          )}

          {section === "addresses" && (
            <div>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                <div>
                  <h2 className="font-display text-[28px] sm:text-[32px] text-slate-900 leading-[1.05]">Mis direcciones</h2>
                  <p className="text-sm text-slate-500">Se guardan solo en este dispositivo; aún no están vinculadas a tu cuenta.</p>
                </div>
                <button type="button" onClick={() => {
                  resetAddressForm();
                  setShowNewAddressForm((prev) => !prev);
                }} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 transition-colors">
                  <Plus size={14} /> {showNewAddressForm ? "Cancelar" : "Agregar nueva dirección"}
                </button>
              </div>
              {showNewAddressForm && (
                <form onSubmit={(e) => {
                  e.preventDefault();
                  if (editingAddressId) {
                    onUpdateAddress(editingAddressId, addressForm);
                  } else {
                    onCreateAddress(addressForm);
                  }
                  resetAddressForm();
                }} className="space-y-4 p-4 mb-6 bg-white rounded-[30px] border border-slate-200 shadow-[0_18px_48px_-40px_rgba(15,23,42,0.16)]">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {[
                      { name: 'label', label: 'Etiqueta', placeholder: 'Casa, Oficina, etc.' },
                      { name: 'line1', label: 'Dirección', placeholder: 'Cra 15 #82-56' },
                      { name: 'line2', label: 'Complemento', placeholder: 'Apto 402 (opcional)' },
                      { name: 'city', label: 'Ciudad', placeholder: 'Bogotá' },
                      { name: 'state', label: 'Departamento', placeholder: 'Cundinamarca' },
                      { name: 'postalCode', label: 'Código postal', placeholder: '110221' },
                    ].map((field) => (
                      <div key={field.name}>
                        <label htmlFor={`account-address-${field.name}`} className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">{field.label}</label>
                        <input
                          id={`account-address-${field.name}`}
                          required={field.name !== "line2"}
                          value={(addressForm as any)[field.name] ?? ''}
                          onChange={(e) => setAddressForm((prev) => ({ ...prev, [field.name]: e.target.value }))}
                          placeholder={field.placeholder}
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:border-[#1e3a8a]/50"
                        />
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="account-address-country" className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">País</label>
                      <input
                        id="account-address-country"
                        required
                        value={addressForm.country}
                        onChange={(e) => setAddressForm((prev) => ({ ...prev, country: e.target.value }))}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:border-[#1e3a8a]/50"
                      />
                    </div>
                    <div>
                      <label htmlFor="account-address-phone" className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Teléfono</label>
                      <input
                        id="account-address-phone"
                        required
                        value={addressForm.phone}
                        onChange={(e) => setAddressForm((prev) => ({ ...prev, phone: e.target.value }))}
                        placeholder="+57 311 234 5678"
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:border-[#1e3a8a]/50"
                      />
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-slate-600">
                    <input type="checkbox" checked={addressForm.isDefault} onChange={(e) => setAddressForm((prev) => ({ ...prev, isDefault: e.target.checked }))} className="accent-[#1e3a8a]" />
                    Establecer como dirección predeterminada
                  </label>
                  <div className="flex gap-3 flex-wrap">
                    <Btn type="submit" variant="primary">{editingAddressId ? 'Guardar cambios' : 'Guardar dirección'}</Btn>
                    <Btn type="button" variant="secondary" onClick={resetAddressForm}>Cancelar</Btn>
                  </div>
                </form>
              )}
              <div className="space-y-4">
                {addresses.map((a) => (
                  <div key={a.id} className="p-4 bg-white/95 rounded-[30px] border border-slate-200/80 shadow-[0_18px_48px_-40px_rgba(15,23,42,0.16)] flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <MapPin size={14} className="text-[#1e3a8a]" />
                        <span className="text-sm font-bold text-slate-800">{a.label}</span>
                        {a.isDefault && <Badge variant="new">Predeterminada</Badge>}
                      </div>
                      <p className="text-sm text-slate-500">{a.line1}{a.line2 ? `, ${a.line2}` : ''}</p>
                      <p className="text-sm text-slate-500">{a.city}, {a.state} · {a.postalCode}</p>
                      <p className="text-sm text-slate-500">{a.country} · {a.phone}</p>
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => startEdit(a)} className="w-10 h-10 rounded-lg bg-slate-100 text-slate-600 hover:bg-blue-50 hover:text-[#1e3a8a] transition-colors"><Edit size={16} /></button>
                      <button type="button" onClick={() => onDeleteAddress(a.id)} className="w-10 h-10 rounded-lg bg-slate-100 text-slate-600 hover:bg-red-50 hover:text-red-500 transition-colors"><Trash2 size={16} /></button>
                    </div>
                  </div>
                ))}
                {addresses.length === 0 && <p className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">Aún no tienes direcciones guardadas.</p>}
              </div>
            </div>
          )}

          {section === "activity" && (
            <div>
              <h2 className="font-display text-[28px] sm:text-[32px] text-slate-900 leading-[1.05] mb-6">Actividad reciente</h2>
              <div className="space-y-3">
                {auditEntries.length === 0 && <p className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">Sin actividad registrada.</p>}
                {auditEntries.map((entry) => (
                  <div key={entry.id} className="rounded-xl border border-slate-100 bg-white p-4">
                    <p className="text-sm font-bold text-slate-800">{entry.action}</p>
                    <p className="mt-1 text-xs text-slate-500">{new Date(entry.ts).toLocaleString("es-CO")}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

// ─── ADMIN DASHBOARD ──────────────────────────────────────────────────────────

function AdminDashboard({ onNavigate, products, productsStatus, productsError, onRetryProducts, categories, createProduct, updateProduct, setProductActive, archiveProduct, adjustStock, productRefresh, initialSection, adminRole, homeContent, setHomeContent, homePreviewProducts, setHomePreviewProducts, homeSaleProducts, setHomeSaleProducts, homeNewArrivals, setHomeNewArrivals, saveHomeContent, homeContentSaving, backendAdminAvailable }: {
  onNavigate: (v: View) => void;
  products: Product[];
  productsStatus: ProductsStatus;
  productsError: string | null;
  onRetryProducts: () => void;
  categories: CategoryOption[];
  createProduct: (product: Omit<Product, "id">) => Promise<void>;
  updateProduct: (productId: string, updates: Partial<Product>) => Promise<void>;
  setProductActive: (productId: string, isActive: boolean) => Promise<void>;
  archiveProduct: (productId: string) => Promise<ProductArchiveResult>;
  adjustStock: (productId: string, movementType: 'in' | 'out' | 'correction', quantity: number, reason: string) => Promise<void>;
  productRefresh: number;
  initialSection?: string;
  adminRole: string;
  homeContent: HomePageContent;
  setHomeContent: React.Dispatch<React.SetStateAction<HomePageContent>>;
  homePreviewProducts: Product[];
  setHomePreviewProducts: React.Dispatch<React.SetStateAction<Product[]>>;
  homeSaleProducts: Product[];
  setHomeSaleProducts: React.Dispatch<React.SetStateAction<Product[]>>;
  homeNewArrivals: Product[];
  setHomeNewArrivals: React.Dispatch<React.SetStateAction<Product[]>>;
  saveHomeContent: () => Promise<void>;
  homeContentSaving: boolean;
  backendAdminAvailable?: boolean;
}) {
  const [adminSection, setAdminSection] = useState(initialSection ?? "dashboard");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null);
  const productDialogRef = useRef<HTMLDialogElement>(null);
  const [isProductFormOpen, setIsProductFormOpen] = useState(false);
  const [isProductFormDirty, setIsProductFormDirty] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [productStatusFilter, setProductStatusFilter] = useState<AdminProductStatusFilter>("all");
  const [availabilityUpdatingId, setAvailabilityUpdatingId] = useState<string | null>(null);
  const [deletingProductId, setDeletingProductId] = useState<string | null>(null);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [activeProduct, setActiveProduct] = useState<Product | null>(null);
  const [productForm, setProductForm] = useState<Omit<Product, "id">>({
    name: "", brand: "", price: 0, originalPrice: undefined, discount: undefined,
    rating: 0, reviews: 0, image: "", images: [], category: "", categoryId: undefined, subcategory: "",
    stock: 0, sku: "", description: "", colors: [], sizes: [], gender: "Unisex",
    isNew: false, isFeatured: false, specs: [], specifications: [],
  });
  const [newProductSize, setNewProductSize] = useState('');

  const selectedCategoryOption = useMemo(() => categories.find((option) => option.id === productForm.categoryId || option.name === productForm.category), [categories, productForm.category, productForm.categoryId]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [productImageSelections, setProductImageSelections] = useState<AdminProductImageSelection[]>([]);
  const [primaryImageSelectionId, setPrimaryImageSelectionId] = useState<string | null>(null);
  const [imageUploadProgress, setImageUploadProgress] = useState<{ completed: number; total: number } | null>(null);
  const objectUrlsRef = useRef(new Set<string>());
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [dashboardData, setDashboardData] = useState<Awaited<ReturnType<typeof adminApi.fetchAdminDashboard>> | null>(null);
  const [dashboardStatus, setDashboardStatus] = useState<ProductsStatus>("loading");
  const [dashboardRefresh, setDashboardRefresh] = useState(0);
  const [inventoryFilter, setInventoryFilter] = useState<"all" | "low" | "out" | "active" | "inactive">("all");
  const [inventoryPage, setInventoryPage] = useState(1);
  const [stockAdjustment, setStockAdjustment] = useState<{ productId: string | null; movementType: 'in' | 'out' | 'correction'; quantity: string; reason: string; error: string | null }>({
    productId: null,
    movementType: 'in',
    quantity: '1',
    reason: '',
    error: null,
  });
  const [stockAdjustmentSubmittingId, setStockAdjustmentSubmittingId] = useState<string | null>(null);
  const availableCategories = [...new Set([...categories.map((category) => category.name), ...getProductCategories(products)])];

  useEffect(() => () => {
    objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    objectUrlsRef.current.clear();
  }, []);

  useEffect(() => {
    if (!mobileSidebarOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusFrame = window.requestAnimationFrame(() => {
      document.querySelector<HTMLButtonElement>(".admin-mobile-drawer__nav button")?.focus();
    });
    const handleMobileNavigationKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileSidebarOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(document.querySelectorAll<HTMLButtonElement>("#admin-mobile-navigation button:not([disabled])"));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleMobileNavigationKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener("keydown", handleMobileNavigationKeyDown);
      document.body.style.overflow = previousOverflow;
      mobileMenuButtonRef.current?.focus();
    };
  }, [mobileSidebarOpen]);

  useEffect(() => {
    const dialog = productDialogRef.current;
    if (!dialog) return;
    if (isProductFormOpen && !dialog.open) dialog.showModal();
    if (!isProductFormOpen && dialog.open) dialog.close();
  }, [isProductFormOpen]);

  const activeInventoryProducts = products.filter((product) => product.isActive !== false);
  const inventoryUnits = products.reduce((sum, product) => sum + Math.max(Number(product.stock ?? 0), 0), 0);
  const inventoryValue = products.reduce((sum, product) => sum + Math.max(Number(product.price ?? 0), 0) * Math.max(Number(product.stock ?? 0), 0), 0);
  const outOfStockProducts = activeInventoryProducts.filter((product) => Number(product.stock ?? 0) <= 0);
  const lowStockProducts = activeInventoryProducts.filter((product) => Number(product.stock ?? 0) > 0 && Number(product.stock ?? 0) <= LOW_STOCK_THRESHOLD);
  const inactiveProducts = products.filter((product) => product.isActive === false);
  const inventoryUpdatedAt = products.reduce<number | null>((latest, product) => {
    const updatedAt = product.updatedAt ? Date.parse(product.updatedAt) : Number.NaN;
    return Number.isFinite(updatedAt) && (latest === null || updatedAt > latest) ? updatedAt : latest;
  }, null);
  const inventoryUpdateLabel = productsStatus === "loading"
    ? "Cargando…"
    : productsStatus === "error"
      ? "No disponible"
      : products.length === 0
        ? "Sin productos"
        : inventoryUpdatedAt === null
          ? "No disponible"
          : new Date(inventoryUpdatedAt).toLocaleString("es-CO");
  const productMetric = (value: number | string) => {
    if (productsStatus === "loading") return "Cargando…";
    if (productsStatus === "error") return "No disponible";
    if (products.length === 0) return "Sin productos";
    return typeof value === "number" ? value.toLocaleString("es-CO") : value;
  };
  const remoteCountMetric = (metric: { status: string; total: number | null } | undefined, emptyLabel: string) => {
    if (dashboardStatus === "loading") return "Cargando…";
    if (dashboardStatus === "error" || !metric) return "No disponible";
    if (metric.status === "forbidden") return "Sin permiso";
    if (metric.status === "error") return "No disponible";
    if (metric.status === "empty") return emptyLabel;
    return metric.status === "ready" && metric.total !== null ? metric.total.toLocaleString("es-CO") : "Pendiente";
  };
  const salesMetric = dashboardStatus === "loading"
    ? "Cargando…"
    : dashboardStatus === "error" || !dashboardData
      ? "No disponible"
      : dashboardData.sales.status === "forbidden"
        ? "Sin permiso"
        : dashboardData.sales.status === "error"
          ? "No disponible"
          : dashboardData.sales.status === "empty"
            ? "Sin ventas"
            : dashboardData.sales.total_7d === null
              ? "No disponible"
              : fmt(dashboardData.sales.total_7d);
  const paidOrdersMetric = dashboardStatus === "loading"
    ? "Cargando…"
    : dashboardStatus === "error" || !dashboardData
      ? "No disponible"
      : dashboardData.sales.status === "forbidden"
        ? "Sin permiso"
        : dashboardData.sales.status === "error" || dashboardData.sales.paid_orders === null
          ? "No disponible"
          : dashboardData.sales.paid_orders === 0
            ? "Sin pedidos pagados"
            : dashboardData.sales.paid_orders.toLocaleString("es-CO");
  const metrics = [
    { label: "Productos activos", value: productMetric(activeInventoryProducts.length), icon: <Package size={18} /> },
    { label: "Unidades en inventario", value: productMetric(inventoryUnits), icon: <Layers size={18} /> },
    { label: "Productos agotados", value: productMetric(outOfStockProducts.length), icon: <AlertTriangle size={18} /> },
    { label: `Stock bajo (≤${LOW_STOCK_THRESHOLD})`, value: productMetric(lowStockProducts.length), icon: <TrendingUp size={18} /> },
    { label: "Productos inactivos", value: productMetric(inactiveProducts.length), icon: <Package size={18} /> },
    { label: "Valor estimado del inventario", value: productMetric(fmt(inventoryValue)), icon: <DollarSign size={18} /> },
    { label: "Pedidos registrados", value: remoteCountMetric(dashboardData?.orders, "Sin pedidos"), icon: <Tag size={18} /> },
    { label: "Clientes registrados", value: remoteCountMetric(dashboardData?.customers, "Sin clientes"), icon: <Users size={18} /> },
    { label: "Pedidos pagados", value: paidOrdersMetric, icon: <Tag size={18} /> },
    { label: "Ventas últimos 7 días (COP)", value: salesMetric, icon: <BarChart2 size={18} /> },
  ];

  const SIDEBAR_LINKS = [
    { id: "dashboard", icon: <Home size={16} />, label: "Inicio" },
    { id: "homepage", icon: <Home size={16} />, label: "Página principal" },
    { id: "products", icon: <Package size={16} />, label: "Productos" },
    { id: "orders", icon: <Tag size={16} />, label: "Pedidos" },
    { id: "inventory", icon: <Layers size={16} />, label: "Inventario" },
    { id: "coupons", icon: <Award size={16} />, label: "Cupones" },
    { id: "reports", icon: <BarChart2 size={16} />, label: "Reportes" },
    { id: "activity", icon: <Grid3X3 size={16} />, label: "Actividad" },
    { id: "settings", icon: <Settings size={16} />, label: "Ajustes" },
  ];

  const SECTIONS_BY_ROLE: Record<string, string[]> = {
    OWNER: SIDEBAR_LINKS.map((link) => link.id),
    ADMIN: SIDEBAR_LINKS.filter((link) => link.id !== "settings").map((link) => link.id),
    CATALOG_MANAGER: ["dashboard", "homepage", "products"],
    LOGISTICS: ["dashboard", "orders", "inventory"],
    ACCOUNTANT: ["dashboard", "orders", "reports"],
  };
  const allowedSections = SECTIONS_BY_ROLE[adminRole.toUpperCase()] ?? [];
  const visibleSidebarLinks = SIDEBAR_LINKS.filter((link) => allowedSections.includes(link.id));

  const SECTION_TITLES: Record<string, string> = {
    dashboard: "Panel de administración",
    homepage: "Página principal",
    products: "Productos",
    orders: "Pedidos",
    inventory: "Inventario",
    coupons: "Cupones",
    reports: "Reportes",
    activity: "Actividad",
    settings: "Ajustes",
  };

  const pageTitle = SECTION_TITLES[adminSection] ?? "Panel de administración";
  const SECTION_DESCRIPTIONS: Record<string, string> = {
    dashboard: "Resumen operativo y estado actual de la tienda.",
    homepage: "Edita el contenido que se muestra en la página principal.",
    products: "Consulta y administra el catálogo de productos.",
    orders: "Consulta los pedidos recientes y su estado.",
    inventory: "Revisa existencias y movimientos de inventario.",
    coupons: "Estado de la gestión de promociones y cupones.",
    reports: "Revisa los datos de ventas disponibles.",
    activity: "Historial de cambios registrados en el panel.",
    settings: "Preferencias disponibles para esta cuenta.",
  };

  const updateAdminSectionUrl = (section: string) => {
    if (typeof window === "undefined") return;
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("view", "admin");
      url.searchParams.set("adminSection", section);
      window.history.replaceState({}, "", url.pathname + url.search);
    } catch (err) {
      // Diagnostic log in case URL manipulation fails
      // eslint-disable-next-line no-console
      console.error('updateAdminSectionUrl failed', err, section, window.location.href);
    }
  };

  const HOME_CONTENT_FIELDS = {
    heroTitle: "VISTE TU ESTILO. MARCA LA DIFERENCIA.",
    heroSubtitle: "Explora calzado, ropa deportiva y accesorios para completar tu estilo.",
    featuredSectionTitle: "Productos destacados",
    newArrivalsSectionTitle: "Novedades",
    saleSectionTitle: "En descuento ahora",
    categorySectionLabel: "DESCUBRE",
    categorySectionTitle: "Colecciones para ti",
    featuredSectionLabel: "Lo más buscado",
    newArrivalsLabel: "Recién llegados",
    saleSectionLabel: "Oferta especial",
    featuredSectionSubtitle: "Los productos más buscados por nuestros clientes.",
    featuredSectionDiscount: "",
    newArrivalsSectionSubtitle: "Novedades directamente desde las marcas.",
    newArrivalsSectionDiscount: "",
    saleSectionSubtitle: "Promociones y descuentos por tiempo limitado.",
    saleSectionDiscount: "",
    categorySectionImage: "",
    featuredSectionImage: "",
    newArrivalsSectionImage: "",
    saleSectionImage: "",
  } as const;

  

  const updateHomeContentField = (field: keyof HomePageContent, value: string) => {
    setHomeContent((prev) => ({ ...prev, [field]: value }));
  };

  const handleSectionImageFileChange = async (field: keyof HomePageContent, e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const data = await uploadProductImage(file, `home/${field}-${Date.now()}-${file.name}`);
      const path = (data as any)?.path ?? (data as any)?.Key ?? null;
      if (path) {
        const publicUrl = getPublicUrl(STORAGE_BUCKET, path);
        updateHomeContentField(field, publicUrl as string);
        toast.success('Imagen subida y asignada.');
      }
    } catch (err) {
      console.warn('Section image upload failed', err);
      toast.error(err instanceof Error ? err.message : 'La carga de imágenes no está disponible.');
    }
  };

  const toggleHomeProductSelection = (section: "preview" | "sale" | "newArrivals", product: Product) => {
    const toggle = (items: Product[], setter: React.Dispatch<React.SetStateAction<Product[]>>) => {
      const alreadySelected = items.some((item) => item.id === product.id);
      if (alreadySelected) {
        setter(items.filter((item) => item.id !== product.id));
        return;
      }
      setter(items.length >= 9 ? [product, ...items.slice(0, 8)] : [product, ...items]);
    };

    if (section === "preview") {
      toggle(homePreviewProducts, setHomePreviewProducts);
      return;
    }
    if (section === "sale") {
      toggle(homeSaleProducts, setHomeSaleProducts);
      return;
    }
    if (section === "newArrivals") {
      toggle(homeNewArrivals, setHomeNewArrivals);
    }
  };

  const HOME_SECTION_OPTIONS = [
    {
      id: "preview" as const,
      title: "Productos destacados",
      selected: homePreviewProducts,
      options: products.filter((p) => p.isActive !== false && (p.isFeatured || p.rating >= 4.5)).slice(0, 9),
      description: "Selecciona hasta 9 productos que aparecerán en la sección destacada.",
    },
    {
      id: "newArrivals" as const,
      title: "Novedades",
      selected: homeNewArrivals,
      options: products.filter((p) => p.isActive !== false && p.isNew).slice(0, 9),
      description: "Selecciona hasta 9 lanzamientos recientes que quieras mostrar.",
    },
    {
      id: "sale" as const,
      title: "En descuento ahora",
      selected: homeSaleProducts,
      options: products.filter((p) => p.isActive !== false && p.discount).slice(0, 9),
      description: "Selecciona hasta 9 productos en descuento para destacar en la home.",
    },
  ];

  const handleSidebarClick = (section: string) => {
    if (!allowedSections.includes(section)) {
      toast.error("No tienes permisos para acceder a esta sección.");
      return;
    }
    if (isProductFormOpen && !requestCloseProductForm()) return;
    updateAdminSectionUrl(section);
    setAdminSection(section);
    setMobileSidebarOpen(false);
  };

  const LOW_STOCK = products.filter((product) => product.isActive !== false && product.stock > 0 && product.stock <= LOW_STOCK_THRESHOLD).map((product) => ({
    name: product.name, stock: product.stock, sku: product.sku,
  }));
  const inventorySearch = searchTerm.trim().toLowerCase();
  const inventoryProducts = products.filter((product) => {
    const matchesSearch = !inventorySearch || [product.name, product.sku, product.brand, product.category]
      .some((value) => value?.toLowerCase().includes(inventorySearch));
    const stock = Number(product.stock ?? 0);
    const matchesFilter = inventoryFilter === "all"
      || (inventoryFilter === "low" && product.isActive !== false && stock > 0 && stock <= LOW_STOCK_THRESHOLD)
      || (inventoryFilter === "out" && product.isActive !== false && stock <= 0)
      || (inventoryFilter === "active" && product.isActive !== false)
      || (inventoryFilter === "inactive" && product.isActive === false);
    return matchesSearch && matchesFilter;
  });
  const inventoryPageSize = 12;
  const inventoryTotalPages = Math.max(1, Math.ceil(inventoryProducts.length / inventoryPageSize));
  const paginatedInventoryProducts = inventoryProducts.slice((inventoryPage - 1) * inventoryPageSize, inventoryPage * inventoryPageSize);

  useEffect(() => {
    setInventoryPage((currentPage) => Math.min(currentPage, inventoryTotalPages));
  }, [inventoryTotalPages]);

  const filteredProducts = filterAdminProducts(products, searchTerm, productStatusFilter);

  const [page, setPage] = useState(1);
  const perPage = 12;
  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / perPage));
  const paginatedProducts = filteredProducts.slice((page - 1) * perPage, page * perPage);

  useEffect(() => {
    setPage((currentPage) => Math.min(currentPage, totalPages));
  }, [totalPages]);

  const handleProductAvailabilityChange = async (product: Product) => {
    const isActive = product.isActive === false;
    const action = isActive ? "Activar producto" : "Desactivar producto";
    const consequence = isActive
      ? "volverá a aparecer en el catálogo público."
      : "se ocultará del catálogo público y se conservarán pedidos e imágenes.";
    if (!window.confirm(`${action} "${product.name}"? El producto ${consequence}`)) return;

    setAvailabilityUpdatingId(product.id);
    try {
      await setProductActive(product.id, isActive);
      toast.success(isActive ? "Producto activado correctamente" : "Producto desactivado correctamente");
    } catch (error) {
      toast.error(formatAdminApiError(error, "No se pudo actualizar el estado del producto."));
    } finally {
      setAvailabilityUpdatingId(null);
    }
  };

  const handleProductArchive = async (product: Product) => {
    const confirmation = `¿Archivar "${product.name}"?\n\nEl producto dejará de aparecer en la tienda y permanecerá en administración como inactivo. Sus imágenes y datos históricos se conservarán.`;
    if (!window.confirm(confirmation)) return;

    setDeletingProductId(product.id);
    try {
      const result = await archiveProduct(product.id);
      if (result.audit_status === "pending") {
        toast.error("Producto archivado; auditoría pendiente.");
      } else {
        toast.success("Producto archivado correctamente.");
      }
    } catch (error) {
      toast.error(formatAdminApiError(error, "No se pudo archivar el producto."));
    } finally {
      setDeletingProductId(null);
    }
  };

  const closeRowActions = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.currentTarget.closest("details")?.removeAttribute("open");
  };

  const renderProductActions = (product: Product) => (
    <details className="admin-row-actions">
      <summary className="admin-icon-button" aria-label={`Acciones para ${product.name}`} title="Acciones">
        <MoreHorizontal size={18} aria-hidden="true" />
      </summary>
      <div className="admin-row-actions__menu" aria-label={`Acciones para ${product.name}`}>
        <button type="button" onClick={(event) => { closeRowActions(event); handleEditProduct(product); }}>
          <Edit size={15} aria-hidden="true" /> Editar
        </button>
        <button type="button" disabled={availabilityUpdatingId !== null || deletingProductId !== null} aria-busy={availabilityUpdatingId === product.id} onClick={(event) => { closeRowActions(event); void handleProductAvailabilityChange(product); }}>
          <Check size={15} aria-hidden="true" /> {availabilityUpdatingId === product.id ? "Actualizando…" : product.isActive === false ? "Activar" : "Desactivar"}
        </button>
        <button type="button" className="is-danger" disabled={availabilityUpdatingId !== null || deletingProductId !== null || product.isActive === false} aria-busy={deletingProductId === product.id} onClick={(event) => { closeRowActions(event); void handleProductArchive(product); }}>
          <Archive size={15} aria-hidden="true" /> {deletingProductId === product.id ? "Archivando…" : "Archivar"}
        </button>
      </div>
    </details>
  );

  const releaseImagePreview = (url?: string) => {
    if (!url || !objectUrlsRef.current.delete(url)) return;
    URL.revokeObjectURL(url);
  };

  const resetForm = () => {
    productImageSelections.forEach((entry) => releaseImagePreview(entry.previewUrl));
    setNewProductSize('');
    setProductImageSelections([]);
    setPrimaryImageSelectionId(null);
    setImageUploadProgress(null);
    setFormErrors({});
    setIsProductFormDirty(false);
    setIsProductFormOpen(false);
    setFormMode("create");
    setActiveProduct(null);
    setProductForm({
      name: "", brand: "", price: 0, originalPrice: undefined, discount: undefined,
      rating: 0, reviews: 0, image: "", images: [], category: "", categoryId: undefined, subcategory: "",
      stock: 0, sku: "", description: "", colors: [], sizes: [], gender: "Unisex",
      isNew: false, isFeatured: false, specs: [], specifications: [],
    });
  };

  const openNewProductForm = () => {
    resetForm();
    setFormMode("create");
    setIsProductFormOpen(true);
  };

  const requestCloseProductForm = () => {
    if (isSubmitting) return false;
    if (isProductFormDirty && !window.confirm("Hay cambios sin guardar. ¿Quieres descartarlos?")) return false;
    resetForm();
    return true;
  };

  const navigateToStore = () => {
    if (isProductFormOpen && !requestCloseProductForm()) return;
    onNavigate("home");
  };

  const [auditEntries, setAuditEntries] = useState<{ id: string; ts: number; action: string; meta?: Record<string, any> }[]>([]);
  const [auditStatus, setAuditStatus] = useState<"loading" | "ready" | "empty" | "error" | "forbidden">("loading");
  const refreshAudit = async () => {
    if (!allowedSections.includes("activity")) {
      setAuditEntries([]);
      setAuditStatus("forbidden");
      return;
    }
    setAuditStatus("loading");
    try {
      const rows = await adminApi.fetchAuditLogs(200);
      if (!Array.isArray(rows)) throw new Error("Invalid audit response");
      const entries = rows.flatMap((row: Record<string, unknown>) => {
        const timestamp = typeof row.created_at === "string" ? Date.parse(row.created_at) : Number.NaN;
        if (typeof row.id !== "string" || typeof row.action !== "string" || !Number.isFinite(timestamp)) return [];
        return [{
          id: row.id,
          ts: timestamp,
          action: row.action,
          meta: {
            entity: typeof row.entity === "string" ? row.entity : undefined,
            entityId: typeof row.entity_id === "string" ? row.entity_id : undefined,
          },
        }];
      });
      setAuditEntries(entries);
      setAuditStatus(entries.length > 0 ? "ready" : "empty");
    } catch (error) {
      const details = error && typeof error === "object" ? error as { status?: unknown; code?: unknown } : {};
      console.error("[Admin Dashboard] Activity query failed", {
        status: typeof details.status === "number" ? details.status : undefined,
        code: typeof details.code === "string" ? details.code : undefined,
      });
      setAuditEntries([]);
      setAuditStatus("error");
    }
  };

  useEffect(() => {
    if (adminSection !== "dashboard" && adminSection !== "orders" && adminSection !== "reports") return;

    let isActive = true;
    let requestInFlight = false;
    const loadDashboard = async () => {
      if (requestInFlight) return;
      requestInFlight = true;
      try {
        const data = await adminApi.fetchAdminDashboard();
        if (!isActive) return;
        setDashboardData(data);
        setDashboardStatus("ready");
      } catch (error) {
        if (!isActive) return;
        const details = error && typeof error === "object" ? error as { status?: unknown; code?: unknown } : {};
        console.error("[Admin Dashboard] Summary query failed", {
          status: typeof details.status === "number" ? details.status : undefined,
          code: typeof details.code === "string" ? details.code : undefined,
        });
        setDashboardStatus("error");
      } finally {
        requestInFlight = false;
      }
    };

    if (!dashboardData) setDashboardStatus("loading");
    void loadDashboard();
    const intervalId = window.setInterval(() => void loadDashboard(), 60_000);
    return () => {
      isActive = false;
      window.clearInterval(intervalId);
    };
  }, [adminSection, dashboardRefresh]);

  const handleEditProduct = (product: Product) => {
    productImageSelections.forEach((entry) => releaseImagePreview(entry.previewUrl));
    setNewProductSize('');
    const normalizedImages = normalizeProductImageList(
      product.image,
      product.images ?? [],
      (path) => getPublicUrl(STORAGE_BUCKET, path),
    );
    const existingImages = [normalizedImages.mainImage, ...normalizedImages.gallery]
      .filter(Boolean)
      .map((url, index) => ({ id: `existing-${product.id}-${index}`, src: url, permanentUrl: url }));
    setProductImageSelections(existingImages);
    setPrimaryImageSelectionId(existingImages[0]?.id ?? null);
    setActiveProduct(product);
    setFormMode("edit");
    setIsProductFormDirty(false);
    setIsProductFormOpen(true);
    setProductForm({
      name: product.name,
      brand: product.brand,
      price: product.price,
      originalPrice: product.originalPrice,
      discount: product.discount,
      rating: product.rating,
      reviews: product.reviews,
      image: product.image,
      images: product.images ?? [],
      category: product.category,
      categoryId: product.categoryId,
      subcategory: product.subcategory,
      stock: product.stock,
      sku: product.sku,
      description: product.description,
      colors: product.colors,
      sizes: product.sizes,
      specifications: product.specifications ?? [],
      gender: product.gender ?? "Unisex",
      isNew: product.isNew ?? false,
      isFeatured: product.isFeatured ?? false,
      specs: product.specs ?? [],
    });
  };

  const handleFormSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;
    const normalizedCategoryId = productForm.categoryId && /^[0-9a-fA-F-]{36}$/.test(productForm.categoryId) ? productForm.categoryId : undefined;
    const normalizedSizes = normalizeProductSizes(productForm.sizes);
    const normalizedSpecifications = normalizeProductSpecifications(productForm.specifications ?? []);

    const payload: Omit<Product, "id"> = {
      ...productForm,
      categoryId: normalizedCategoryId,
      category: productForm.category || selectedCategoryOption?.name || '',
      colors: productForm.colors.map((color) => ({ name: color.name, hex: color.hex })),
      sizes: normalizedSizes,
      specifications: normalizedSpecifications,
      rating: Number(productForm.rating) || 0,
      reviews: Number(productForm.reviews) || 0,
      price: Number(productForm.price) || 0,
      stock: Number(productForm.stock) || 0,
      originalPrice: productForm.originalPrice ? Number(productForm.originalPrice) : undefined,
      discount: productForm.discount ? Number(productForm.discount) : undefined,
    };

    const selectedPrimaryImage = productImageSelections.find((entry) => entry.id === primaryImageSelectionId);
    const selectedGalleryImages = productImageSelections.filter((entry) => entry.id !== selectedPrimaryImage?.id);
    const errors = validateProductForm({
      name: productForm.name,
      brand: productForm.brand,
      sku: productForm.sku,
      price: productForm.price,
      stock: productForm.stock,
      categoryId: normalizedCategoryId,
      image: selectedPrimaryImage?.permanentUrl ?? "",
      images: selectedGalleryImages.flatMap((entry) => entry.permanentUrl ? [entry.permanentUrl] : []),
      pendingImageCount: productImageSelections.filter((entry) => Boolean(entry.file)).length,
      sizes: normalizedSizes,
      specifications: normalizedSpecifications,
    });

    if (productImageSelections.length > MAX_PRODUCT_TOTAL_IMAGES) {
      errors.gallery = `Máximo ${MAX_PRODUCT_TOTAL_IMAGES} imágenes en total: 1 principal y hasta ${MAX_PRODUCT_GALLERY_IMAGES} adicionales.`;
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      toast.error(Object.values(errors)[0]);
      return;
    }

    try {
      productSchema.parse(payload as any);
    } catch (err: any) {
      const message = err?.errors?.[0]?.message ?? 'Datos de producto inválidos';
      toast.error(String(message));
      return;
    }
    if (!payload.sku) payload.sku = `SKU-${Date.now().toString().slice(-6)}`;

    setIsSubmitting(true);
    const executeSave = async () => {
      try {
        const pendingUploads = productImageSelections.filter((entry) => Boolean(entry.file)).length;
        if (pendingUploads) setImageUploadProgress({ completed: 0, total: pendingUploads });
        const imagePayload = await uploadSelectedProductImages(
          productImageSelections,
          primaryImageSelectionId,
          uploadProductImage,
          (path) => getPublicUrl(STORAGE_BUCKET, path),
          (images, completed, total, uploadedImage) => {
            const originalPreview = productImageSelections.find((entry) => entry.id === uploadedImage.id)?.previewUrl;
            releaseImagePreview(originalPreview);
            setProductImageSelections(images);
            setImageUploadProgress({ completed, total });
          },
        );
        const productPayload = {
          ...payload,
          image: imagePayload.mainImage,
          images: imagePayload.images,
        };

        const save = formMode === "edit" && activeProduct
          ? () => updateProduct(activeProduct.id, productPayload)
          : () => createProduct(productPayload);
        await submitAdminProductForm(save, () => {
          resetForm();
          setAdminSection("products");
        });
      } catch (error) {
        toast.error(formatAdminApiError(error, "No se pudo guardar el producto."));
      } finally {
        setImageUploadProgress(null);
        setIsSubmitting(false);
      }
    };

    void executeSave();
  };

  useEffect(() => { refreshAudit(); }, [productRefresh]);

  const renderAdminSection = () => {
    if (!allowedSections.includes(adminSection)) {
      return (
        <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          No tienes permisos para acceder a esta sección.
        </div>
      );
    }

    switch (adminSection) {
      case "dashboard":
        return (
          <>
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 mb-8">
              <div className="admin-dashboard-hero xl:col-span-2 p-8 rounded-[30px] bg-slate-950 text-white shadow-[0_20px_60px_-40px_rgba(15,23,42,0.36)]">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="uppercase text-xs tracking-[0.26em] text-slate-400 font-semibold mb-3">Administrador</p>
                    <h2 className="font-display text-[40px] sm:text-[52px] text-white leading-[1.02]">Control total de la tienda</h2>
                    <p className="mt-3 max-w-2xl text-sm text-slate-300">Administra pedidos, productos, inventarios y reportes desde un panel unificado y seguro.</p>
                  </div>
                  <div className="rounded-full border border-white/10 bg-white/10 px-4 py-3 text-xs uppercase tracking-[0.22em] font-semibold text-slate-100">Acceso rápido</div>
                </div>
                <div className="admin-dashboard-hero__shortcuts grid grid-cols-1 sm:grid-cols-2 gap-4 mt-8">
                  {[
                    { title: 'Pedidos', subtitle: 'Revisa todos los pedidos recientes.', action: () => handleSidebarClick('orders'), icon: <Tag size={18} /> },
                    { title: 'Productos', subtitle: 'Gestiona el catálogo y precios.', action: () => { resetForm(); handleSidebarClick('products'); }, icon: <Package size={18} /> },
                    { title: 'Inventario', subtitle: 'Controla stock crítico.', action: () => handleSidebarClick('inventory'), icon: <Layers size={18} /> },
                    { title: 'Reportes', subtitle: 'Analiza rendimiento rápido.', action: () => handleSidebarClick('reports'), icon: <BarChart2 size={18} /> },
                  ].map((item) => (
                    <button key={item.title} onClick={item.action} className="group rounded-[26px] border border-white/10 bg-white/10 p-5 text-left transition hover:bg-white/20">
                      <div className="inline-flex items-center justify-center w-11 h-11 rounded-2xl bg-white/15 text-white mb-4 group-hover:bg-white/20">
                        {item.icon}
                      </div>
                      <p className="text-base font-semibold">{item.title}</p>
                      <p className="mt-2 text-sm text-slate-300">{item.subtitle}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-6 rounded-[30px] bg-white/95 border border-slate-200/80 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.16)]">
                <div className="mb-4">
                  <p className="text-xs uppercase tracking-[0.24em] text-slate-400 font-semibold">Resumen rápido</p>
                </div>
                <div className="space-y-3">
                  <div className="rounded-3xl bg-slate-50 p-4">
                    <p className="text-sm text-slate-500">Clientes registrados</p>
                    <p className="text-base font-bold text-slate-700">{remoteCountMetric(dashboardData?.customers, "Sin clientes")}</p>
                  </div>
                  <div className="rounded-3xl bg-slate-50 p-4">
                    <p className="text-sm text-slate-500">Pedidos</p>
                    <p className="text-base font-bold text-slate-700">{remoteCountMetric(dashboardData?.orders, "Sin pedidos")}</p>
                  </div>
                  <div className="rounded-3xl bg-slate-50 p-4">
                    <p className="text-sm text-slate-500">Productos marcados como nuevos</p>
                    <p className="text-2xl font-extrabold text-slate-900">{productMetric(products.filter((product) => product.isNew).length)}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5 mb-8">
              {metrics.map((m) => (
                <div key={m.label} className="p-5 bg-white/95 rounded-[30px] border border-slate-200/80 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.16)]">
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-slate-100 text-slate-900">
                      {m.icon}
                    </div>
                  </div>
                  <p className="text-2xl font-extrabold text-slate-900">{m.value}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{m.label}</p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
              <div className="lg:col-span-2 p-5 bg-white/95 rounded-[30px] border border-slate-200/80 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.16)]">
                <div className="flex items-center justify-between mb-5">
                  <h2 className="text-sm font-extrabold text-slate-800">Ventas últimos 7 días (COP)</h2>
                </div>
                <div role={dashboardStatus === "error" || dashboardData?.sales.status === "error" ? "alert" : "status"} className="flex h-[200px] items-center justify-center px-4 text-center text-sm text-slate-600">
                  {dashboardStatus === "loading" ? "Cargando ventas…" : dashboardStatus === "error" || dashboardData?.sales.status === "error" ? "No fue posible cargar las ventas." : dashboardData?.sales.status === "forbidden" ? "No tienes permisos para consultar las ventas." : dashboardData?.sales.status === "empty" ? "No hay pedidos con pago confirmado en los últimos 7 días." : !dashboardData || dashboardData.sales.total_7d === null ? "El importe no está disponible." : `${fmt(dashboardData.sales.total_7d)} COP · ${new Date(dashboardData.sales.period_start ?? "").toLocaleDateString("es-CO")}–${new Date(dashboardData.sales.period_end ?? "").toLocaleDateString("es-CO")}`}
                </div>
              </div>

              <div className="p-5 bg-white/95 rounded-[30px] border border-slate-200/80 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.16)]">
                <h2 className="text-sm font-extrabold text-slate-800 mb-5">Ventas por categoría</h2>
                <div role={dashboardStatus === "error" || dashboardData?.sales.status === "error" ? "alert" : "status"} className="flex h-[200px] items-center justify-center px-4 text-center text-sm text-slate-600">
                  {dashboardStatus === "loading" ? "Cargando datos de ventas…" : dashboardStatus === "error" || dashboardData?.category_sales_status === "error" ? "No fue posible cargar las ventas por categoría." : dashboardData?.category_sales_status === "forbidden" ? "No tienes permisos para consultar los reportes." : dashboardData?.category_sales_status === "empty" ? "No hay datos de ventas por categoría para el periodo seleccionado." : "Hay pedidos pagados, pero la categoría histórica del artículo no está guardada en el pedido. Reporte pendiente de migración aprobada."}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 bg-white/95 rounded-[30px] border border-slate-200/80 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.16)] overflow-hidden">
                <div className="flex items-center justify-between p-5 border-b border-slate-50">
                  <h2 className="text-sm font-extrabold text-slate-800">Pedidos recientes</h2>
                  <button onClick={() => handleSidebarClick('orders')} className="text-xs text-[#1e3a8a] hover:underline flex items-center gap-1">Ver todos <ChevronRight size={11} /></button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-50">
                        {['Pedido', 'Cliente', 'Fecha', 'Estado', 'Artículos', 'Total'].map((h) => (
                          <th key={h} className="text-left px-5 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wide">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {dashboardData?.orders.recent.map((order) => (
                        <tr key={order.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                          <td className="px-5 py-3 text-xs font-mono font-bold text-[#1e3a8a]">{order.order_number || order.id.slice(0, 8)}</td>
                          <td className="px-5 py-3 text-sm text-slate-700">{order.customer_name ?? "—"}</td>
                          <td className="px-5 py-3 text-xs text-slate-400">{formatAdminProductDate(order.created_at)}</td>
                          <td className="px-5 py-3">
                            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${STATUS_STYLE[order.status] ?? "border border-slate-200 bg-slate-50 text-slate-700"}`}>{ORDER_STATUS_LABELS[order.status] ?? order.status}</span>
                          </td>
                          <td className="px-5 py-3 text-sm text-slate-700">{order.item_count}</td>
                          <td className="price px-5 py-3 text-sm text-slate-900">{fmt(Number(order.total))}</td>
                        </tr>
                      ))}
                      {dashboardStatus === "loading" && <tr><td colSpan={6} role="status" className="px-5 py-8 text-center text-sm text-slate-500">Cargando pedidos…</td></tr>}
                      {dashboardStatus === "error" && <tr><td colSpan={6} role="alert" className="px-5 py-8 text-center text-sm text-red-700">No fue posible cargar los pedidos. <button type="button" onClick={() => setDashboardRefresh((value) => value + 1)} className="font-semibold underline">Intentar de nuevo</button></td></tr>}
                      {dashboardStatus === "ready" && dashboardData?.orders.status === "forbidden" && <tr><td colSpan={6} role="status" className="px-5 py-8 text-center text-sm text-slate-500">No tienes permisos para consultar los pedidos.</td></tr>}
                      {dashboardStatus === "ready" && dashboardData?.orders.status === "error" && <tr><td colSpan={6} role="alert" className="px-5 py-8 text-center text-sm text-red-700">No fue posible cargar los pedidos. <button type="button" onClick={() => setDashboardRefresh((value) => value + 1)} className="font-semibold underline">Intentar de nuevo</button></td></tr>}
                      {dashboardStatus === "ready" && dashboardData?.orders.status === "empty" && <tr><td colSpan={6} role="status" className="px-5 py-8 text-center text-sm text-slate-500">Todavía no hay pedidos registrados.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="bg-white/95 rounded-[30px] border border-slate-200/80 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.16)] overflow-hidden">
                <div className="flex items-center gap-2 p-5 border-b border-slate-50">
                  <AlertTriangle size={15} className="text-amber-500" />
                  <h2 className="text-sm font-extrabold text-slate-800">Inventario bajo</h2>
                </div>
                <div className="p-4 space-y-3">
                  {productsStatus === "loading" && <p role="status" className="text-sm text-slate-500">Cargando inventario…</p>}
                  {productsStatus === "error" && <p role="alert" className="text-sm text-red-700">No fue posible cargar el inventario.</p>}
                  {productsStatus === "ready" && LOW_STOCK.map((item) => (
                    <div key={item.sku} className="p-3 bg-amber-50 border border-amber-100 rounded-xl">
                      <p className="text-xs font-bold text-slate-700 line-clamp-1 mb-0.5">{item.name}</p>
                      <p className="text-[10px] font-mono text-slate-400 mb-2">{item.sku}</p>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-extrabold text-amber-700">{item.stock}</span>
                      </div>
                    </div>
                  ))}
                  {productsStatus === "ready" && LOW_STOCK.length === 0 && <p role="status" className="text-sm text-slate-500">No hay productos con stock bajo.</p>}
                  <button onClick={() => handleSidebarClick('inventory')} className="w-full py-2.5 rounded-xl text-xs font-bold text-white bg-black border border-black hover:bg-slate-900 transition-colors">
                    Gestionar inventario
                  </button>
                </div>
              </div>
            </div>
          </>
        );

      case "homepage":
        return (
          <div className="space-y-6 mb-6">
            <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
              <div className="bg-white/95 rounded-[30px] border border-slate-200/80 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.16)] p-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
                  <div>
                    <p className="text-xs uppercase tracking-[0.24em] text-slate-400 font-semibold mb-2">Página principal</p>
                    <h2 className="font-display text-[28px] sm:text-[32px] text-slate-900 leading-[1.05]">Editar secciones de la home</h2>
                    <p className="text-sm text-slate-500 mt-1">Actualiza el texto y las colecciones que se muestran en la tienda.</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-600">Vista previa en vivo</span>
                  </div>
                </div>

                <div className="grid gap-4">
                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-500 mb-2">Título hero</label>
                    <input value={homeContent.heroTitle} onChange={(e) => updateHomeContentField("heroTitle", e.target.value)} className="w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-500 mb-2">Subtítulo hero</label>
                    <textarea value={homeContent.heroSubtitle} onChange={(e) => updateHomeContentField("heroSubtitle", e.target.value)} rows={3} className="w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-500 mb-2">Etiqueta sección categorías</label>
                    <input value={homeContent.categorySectionLabel} onChange={(e) => updateHomeContentField("categorySectionLabel", e.target.value)} className="w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-500 mb-2">Título sección categorías</label>
                    <input value={homeContent.categorySectionTitle} onChange={(e) => updateHomeContentField("categorySectionTitle", e.target.value)} className="w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-500 mb-2">Imagen sección categorías (opcional)</label>
                    <div className="flex flex-col gap-3">
                      <input type="file" accept="image/*" onChange={(e) => handleSectionImageFileChange("categorySectionImage", e)} className="text-sm text-slate-700" />
                      <input value={homeContent.categorySectionImage ?? ""} onChange={(e) => updateHomeContentField("categorySectionImage", e.target.value)} placeholder="URL de imagen (opcional)" className="w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-[30px] bg-[#0f172a] p-6 text-white shadow-[0_20px_60px_-40px_rgba(15,23,42,0.36)]">
                <p className="text-xs uppercase tracking-[0.24em] text-slate-400 font-semibold mb-4">Vista previa</p>
                <div className="space-y-6">
                  <div className="rounded-[28px] border border-white/10 bg-slate-950 p-5">
                    <p className="text-xs uppercase text-slate-400 tracking-[0.24em] mb-2">Hero</p>
                    <h3 className="text-2xl font-extrabold text-white">{homeContent.heroTitle}</h3>
                    <p className="mt-3 text-sm text-slate-300 leading-relaxed">{homeContent.heroSubtitle}</p>
                      <div className="mt-5 rounded-3xl bg-slate-900/80 p-4">
                        <p className="text-xs uppercase text-slate-400 tracking-[0.24em] mb-2">{homeContent.categorySectionLabel}</p>
                        <h4 className="text-lg font-bold text-white">{homeContent.categorySectionTitle}</h4>
                        {homeContent.categorySectionImage ? (
                          <img src={homeContent.categorySectionImage} alt="Category" className="mt-3 w-full max-h-36 object-cover rounded-md" />
                        ) : null}
                      </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-6 xl:grid-cols-3">
              {HOME_SECTION_OPTIONS.map((section) => (
                <div key={section.id} className="bg-white/95 rounded-[30px] border border-slate-200/80 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.16)] p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-lg font-extrabold text-slate-900">{section.title}</h3>
                      <p className="text-sm text-slate-500">{section.description}</p>
                    </div>
                    <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{section.selected.length}/9</span>
                  </div>
                  <div className="space-y-3">
                    <div className="grid gap-3 mb-2">
                      <label className="text-xs font-bold uppercase text-slate-500">Etiqueta (sección)</label>
                      <input
                        value={section.id === 'preview' ? homeContent.featuredSectionLabel : section.id === 'newArrivals' ? homeContent.newArrivalsLabel : homeContent.saleSectionLabel}
                        onChange={(e) => updateHomeContentField(section.id === 'preview' ? 'featuredSectionLabel' : section.id === 'newArrivals' ? 'newArrivalsLabel' : 'saleSectionLabel', e.target.value)}
                        className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                      />
                      <label className="text-xs font-bold uppercase text-slate-500">Título</label>
                      <input
                        value={section.id === 'preview' ? homeContent.featuredSectionTitle : section.id === 'newArrivals' ? homeContent.newArrivalsSectionTitle : homeContent.saleSectionTitle}
                        onChange={(e) => updateHomeContentField(section.id === 'preview' ? 'featuredSectionTitle' : section.id === 'newArrivals' ? 'newArrivalsSectionTitle' : 'saleSectionTitle', e.target.value)}
                        className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                      />
                      <label className="text-xs font-bold uppercase text-slate-500">Subtítulo (opcional)</label>
                      <input
                        value={section.id === 'preview' ? homeContent.featuredSectionSubtitle ?? '' : section.id === 'newArrivals' ? homeContent.newArrivalsSectionSubtitle ?? '' : homeContent.saleSectionSubtitle ?? ''}
                        onChange={(e) => updateHomeContentField(section.id === 'preview' ? 'featuredSectionSubtitle' : section.id === 'newArrivals' ? 'newArrivalsSectionSubtitle' : 'saleSectionSubtitle', e.target.value)}
                        className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                      />
                      <label className="text-xs font-bold uppercase text-slate-500">Texto de descuento (opcional)</label>
                      <input
                        value={section.id === 'preview' ? homeContent.featuredSectionDiscount ?? '' : section.id === 'newArrivals' ? homeContent.newArrivalsSectionDiscount ?? '' : homeContent.saleSectionDiscount ?? ''}
                        onChange={(e) => updateHomeContentField(section.id === 'preview' ? 'featuredSectionDiscount' : section.id === 'newArrivals' ? 'newArrivalsSectionDiscount' : 'saleSectionDiscount', e.target.value)}
                        className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                      />
                      <label className="text-xs font-bold uppercase text-slate-500">Imagen de sección (opcional)</label>
                      <div className="flex items-center gap-3">
                        <input type="file" accept="image/*" onChange={(e) => handleSectionImageFileChange(section.id === 'preview' ? ('featuredSectionImage' as keyof HomePageContent) : section.id === 'newArrivals' ? ('newArrivalsSectionImage' as keyof HomePageContent) : ('saleSectionImage' as keyof HomePageContent), e)} />
                        <input
                          value={section.id === 'preview' ? homeContent.featuredSectionImage ?? '' : section.id === 'newArrivals' ? homeContent.newArrivalsSectionImage ?? '' : homeContent.saleSectionImage ?? ''}
                          onChange={(e) => updateHomeContentField(section.id === 'preview' ? 'featuredSectionImage' : section.id === 'newArrivals' ? 'newArrivalsSectionImage' : 'saleSectionImage', e.target.value)}
                          placeholder="URL de imagen (opcional)"
                          className="flex-1 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                        />
                      </div>
                    </div>

                    <div>
                      <p className="text-xs uppercase tracking-[0.24em] text-slate-400 mb-3">Productos disponibles</p>
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                        {section.options.map((product) => {
                          const selected = section.selected.some((item) => item.id === product.id);
                          return (
                            <button key={product.id} type="button" onClick={() => toggleHomeProductSelection(section.id, product)}
                              className={`rounded-3xl border p-3 text-left transition ${selected ? "border-black bg-slate-900 text-white" : "border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300"}`}>
                              <p className="text-sm font-semibold leading-tight">{product.name}</p>
                              <p className="text-xs text-slate-500 mt-1">{product.brand}</p>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="rounded-3xl bg-slate-50 p-4">
                      <p className="text-xs uppercase tracking-[0.24em] text-slate-400 mb-3">Productos seleccionados</p>
                      {section.selected.length === 0 ? (
                        <p className="text-sm text-slate-500">Selecciona hasta 4 productos para mostrar.</p>
                      ) : (
                        <ul className="space-y-2">
                          {section.selected.map((product) => (
                            <li key={product.id} className="flex items-center justify-between rounded-2xl bg-white border border-slate-200 px-4 py-3">
                              <div>
                                <p className="text-sm font-semibold text-slate-900">{product.name}</p>
                                <p className="text-xs text-slate-500">{product.brand}</p>
                              </div>
                              <button type="button" onClick={() => toggleHomeProductSelection(section.id, product)} className="text-xs font-semibold text-[#1e3a8a]">Quitar</button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );

      case "products":
        return (
          <div className="admin-products-page space-y-4">
            <div className="admin-product-list-panel">
              <div className="admin-product-toolbar">
                <div className="admin-product-search">
                  <Search size={16} aria-hidden="true" />
                  <input value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }} placeholder="Buscar por nombre, marca o SKU" aria-label="Buscar productos por nombre, marca o SKU" className="bg-white pr-3" />
                </div>
                <select aria-label="Filtrar productos por estado" value={productStatusFilter} onChange={(event) => { setProductStatusFilter(event.target.value as AdminProductStatusFilter); setPage(1); }}
                  className="min-h-10 w-full bg-white px-3 sm:w-auto">
                  <option value="all">Todos</option>
                  <option value="active">Activos</option>
                  <option value="inactive">Inactivos</option>
                </select>
              </div>

              <div className="admin-table-scroll hidden lg:block">
                <table className="w-full min-w-[940px] admin-product-table">
                  <thead>
                    <tr className="border-b border-slate-50">
                      {['Imagen', 'Nombre', 'Marca', 'Categoría', 'Precio', 'Stock', 'Estado', 'Creado', 'Acciones'].map((h) => (
                        <th key={h} className={h === "Precio" || h === "Stock" ? "is-numeric" : ""}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {productsStatus === "loading" ? (
                      <tr><td colSpan={9} role="status" className="px-4 py-10 text-center text-sm text-slate-500">Cargando productos…</td></tr>
                    ) : productsStatus === "error" ? (
                      <tr><td colSpan={9} className="px-4 py-10 text-center text-sm text-red-700"><div role="alert">{productsError ?? "No fue posible cargar los productos. Intenta nuevamente."}</div><button type="button" onClick={onRetryProducts} className="mt-2 font-semibold underline">Reintentar</button></td></tr>
                    ) : paginatedProducts.length === 0 ? (
                      <tr><td colSpan={9} role="status" className="px-4 py-10 text-center text-sm text-slate-500">{products.length === 0 ? "No hay productos registrados." : "No encontramos productos con esos criterios."}</td></tr>
                    ) : paginatedProducts.map((p) => (
                      <tr key={p.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                        <td className="px-4 py-3"><img src={p.image} alt={p.name} className="w-12 h-12 object-cover rounded-lg" /></td>
                        <td className="px-4 py-3 text-sm font-semibold text-slate-800">{p.name}</td>
                        <td className="px-4 py-3 text-sm text-slate-600">{p.brand}</td>
                        <td className="px-4 py-3 text-sm text-slate-600">{p.category || "—"}</td>
                        <td className="price px-4 py-3 text-sm text-slate-900">{fmt(p.price)}</td>
                        <td className="px-4 py-3 text-sm text-slate-700">{p.stock}</td>
                        <td className="px-4 py-3 text-sm">
                          <span className={p.isActive === false ? "inline-flex rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700" : "inline-flex rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800"}>
                            {p.isActive === false ? "Inactivo" : "Activo"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600">{formatAdminProductDate(p.createdAt)}</td>
                        <td>{renderProductActions(p)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="space-y-3 lg:hidden">
                {productsStatus === "loading" ? (
                  <div role="status" className="rounded-lg border border-slate-200 px-4 py-8 text-center text-sm text-slate-500">Cargando productos…</div>
                ) : productsStatus === "error" ? (
                  <div className="rounded-lg border border-red-200 px-4 py-6 text-center text-sm text-red-700"><div role="alert">{productsError ?? "No fue posible cargar los productos. Intenta nuevamente."}</div><button type="button" onClick={onRetryProducts} className="mt-2 font-semibold underline">Reintentar</button></div>
                ) : paginatedProducts.length === 0 ? (
                  <div role="status" className="rounded-lg border border-slate-200 px-4 py-8 text-center text-sm text-slate-500">{products.length === 0 ? "No hay productos registrados." : "No encontramos productos con esos criterios."}</div>
                ) : paginatedProducts.map((p) => (
                  <article key={p.id} className="min-w-0 rounded-lg border border-slate-200 bg-white p-3">
                    <div className="flex min-w-0 gap-3">
                      <img src={p.image} alt={p.name} className="h-16 w-16 shrink-0 rounded-md object-cover" />
                      <div className="min-w-0 flex-1">
                        <h3 className="break-words text-sm font-semibold text-slate-900">{p.name}</h3>
                        <p className="break-words text-xs text-slate-600">{p.brand} · {p.category || "Sin categoría"}</p>
                        <p className="mt-1 break-words text-xs text-slate-500">SKU {p.sku || "—"}</p>
                        <p className="mt-1 text-xs text-slate-700">{fmt(p.price)} · Stock {p.stock}</p>
                        <p className="mt-1 text-xs text-slate-500">Creado {formatAdminProductDate(p.createdAt)}</p>
                        <span className={p.isActive === false ? "mt-2 inline-flex rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700" : "mt-2 inline-flex rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800"}>
                          {p.isActive === false ? "Inactivo" : "Activo"}
                        </span>
                      </div>
                    </div>
                    <div className="mt-3 flex justify-end">{renderProductActions(p)}</div>
                  </article>
                ))}
              </div>
              {productsStatus === "ready" && filteredProducts.length > 0 && <div className="flex items-center justify-between mt-3">
                <div className="text-sm text-slate-500">Mostrando {(page - 1) * perPage + 1} - {Math.min(page * perPage, filteredProducts.length)} de {filteredProducts.length}</div>
                <div className="flex items-center gap-2">
                  <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="px-3 py-1 rounded-md bg-slate-100">Anterior</button>
                  <div className="text-sm text-slate-600">{page} / {totalPages}</div>
                  <button disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} className="px-3 py-1 rounded-md bg-slate-100">Siguiente</button>
                </div>
              </div>}
            </div>

            <dialog
              ref={productDialogRef}
              className="admin-product-dialog"
              aria-labelledby="admin-product-dialog-title"
              onCancel={(event) => { event.preventDefault(); requestCloseProductForm(); }}
              onClick={(event) => { if (event.target === productDialogRef.current) requestCloseProductForm(); }}
            >
              <div className="admin-product-dialog__panel">
                <header className="admin-product-dialog__header">
                  <div>
                    <h2 id="admin-product-dialog-title">{formMode === 'edit' ? 'Editar producto' : 'Crear producto'}</h2>
                    <p>{formMode === 'edit' ? `ID ${activeProduct?.id ?? ""}` : "Completa los datos del producto."}</p>
                  </div>
                  <button type="button" className="admin-icon-button" aria-label="Cerrar formulario de producto" onClick={() => requestCloseProductForm()} disabled={isSubmitting}>
                    <X size={18} aria-hidden="true" />
                  </button>
                </header>
                <div className="admin-product-dialog__body">
              <form onSubmit={handleFormSubmit} className="space-y-4">
                {/* Nombre y Marca */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="admin-product-name" className="text-xs font-bold text-slate-600 uppercase block mb-2">Nombre *</label>
                    <input 
                      id="admin-product-name"
                      autoFocus
                      value={productForm.name} 
                      aria-invalid={Boolean(formErrors.name)}
                      aria-describedby={formErrors.name ? "product-name-error" : undefined}
                      onChange={(e) => { updateField('name', e.target.value); setFormErrors({...formErrors, name: ''}) }}
                      placeholder="Ej: Nike Air Force 1" 
                      className={`w-full px-4 py-3 rounded-xl border-2 transition-colors ${formErrors.name ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-white hover:border-slate-300 focus:border-slate-500'} focus:outline-none`} 
                    />
                    {formErrors.name && <p id="product-name-error" role="alert" className="text-xs text-red-600 mt-1">{formErrors.name}</p>}
                  </div>
                  <div>
                    <label htmlFor="admin-product-brand" className="text-xs font-bold text-slate-600 uppercase block mb-2">Marca</label>
                    <input 
                      id="admin-product-brand"
                      value={productForm.brand} 
                      aria-invalid={Boolean(formErrors.brand)}
                      aria-describedby={formErrors.brand ? "admin-product-brand-error" : undefined}
                      onChange={(e) => {
                        updateField('brand', e.target.value);
                        setFormErrors((prev) => ({ ...prev, brand: '' }));
                      }}
                      placeholder="Ej: Nike" 
                      className={`w-full px-4 py-3 rounded-xl border-2 transition-colors ${formErrors.brand ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-white hover:border-slate-300 focus:border-slate-500'} focus:outline-none`}
                    />
                    {formErrors.brand && <p id="admin-product-brand-error" role="alert" className="text-xs text-red-600 mt-1">{formErrors.brand}</p>}
                  </div>
                </div>

                {/* Precio y Stock */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="admin-product-price" className="text-xs font-bold text-slate-600 uppercase block mb-2">Precio *</label>
                    <div className="relative">
                      <span className="absolute left-4 top-3 text-slate-600 font-semibold">$</span>
                      <input 
                        id="admin-product-price"
                        type="number" 
                        value={productForm.price as any} 
                        aria-invalid={Boolean(formErrors.price)}
                        aria-describedby={formErrors.price ? "admin-product-price-error" : undefined}
                        onChange={(e) => { updateField('price', Number(e.target.value)); setFormErrors({...formErrors, price: ''}) }}
                        placeholder="0" 
                        className={`w-full pl-8 pr-4 py-3 rounded-xl border-2 transition-colors ${formErrors.price ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-white hover:border-slate-300 focus:border-slate-500'} focus:outline-none`}
                      />
                    </div>
                    {formErrors.price && <p id="admin-product-price-error" role="alert" className="text-xs text-red-600 mt-1">{formErrors.price}</p>}
                  </div>
                  <div>
                    <label htmlFor="admin-product-stock" className="text-xs font-bold text-slate-600 uppercase block mb-2">Stock *</label>
                    <input 
                      id="admin-product-stock"
                      type="number" 
                      value={productForm.stock as any} 
                      aria-invalid={Boolean(formErrors.stock)}
                      aria-describedby={formErrors.stock ? "admin-product-stock-error" : undefined}
                      onChange={(e) => { updateField('stock', Number(e.target.value)); setFormErrors({...formErrors, stock: ''}) }}
                      placeholder="0" 
                      className={`w-full px-4 py-3 rounded-xl border-2 transition-colors ${formErrors.stock ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-white hover:border-slate-300 focus:border-slate-500'} focus:outline-none`}
                    />
                    {formErrors.stock && <p id="admin-product-stock-error" role="alert" className="text-xs text-red-600 mt-1">{formErrors.stock}</p>}
                  </div>
                </div>

                {/* SKU y Categoría */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="admin-product-sku" className="text-xs font-bold text-slate-600 uppercase block mb-2">SKU *</label>
                    <input 
                      id="admin-product-sku"
                      value={productForm.sku} 
                      aria-invalid={Boolean(formErrors.sku)}
                      aria-describedby={formErrors.sku ? "admin-product-sku-error" : undefined}
                      onChange={(e) => { updateField('sku', e.target.value); setFormErrors({...formErrors, sku: ''}) }}
                      placeholder="Ej: NKE-AF1-001" 
                      className={`w-full px-4 py-3 rounded-xl border-2 transition-colors ${formErrors.sku ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-white hover:border-slate-300 focus:border-slate-500'} focus:outline-none`}
                    />
                    {formErrors.sku && <p id="admin-product-sku-error" role="alert" className="text-xs text-red-600 mt-1">{formErrors.sku}</p>}
                  </div>
                  <div>
                    <label htmlFor="admin-product-category" className="text-xs font-bold text-slate-600 uppercase block mb-2">Categoría *</label>
                    <select 
                      id="admin-product-category"
                      value={productForm.categoryId ?? ""}
                      onChange={(e) => {
                        const nextCategoryId = e.target.value;
                        const selectedOption = categories.find((option) => option.id === nextCategoryId);
                        if (!selectedOption) {
                          updateField('categoryId', undefined);
                          updateField('category', "");
                          return;
                        }
                        updateField('categoryId', selectedOption.id);
                        updateField('category', selectedOption.name);
                        const subcategories = getProductSubcategories(products, selectedOption.name);
                        const [defaultSubcategory] = subcategories;
                        if (!subcategories.includes(productForm.subcategory)) {
                          updateField('subcategory', defaultSubcategory ?? "");
                        }
                      }}
                      disabled={categories.length === 0}
                      className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 bg-white hover:border-slate-300 focus:border-slate-500 focus:outline-none transition-colors text-slate-700 disabled:bg-slate-100 disabled:text-slate-400"
                    >
                      <option value="" disabled>
                        {categories.length ? 'Selecciona una categoría' : 'Primero crea una categoría antes de agregar productos.'}
                      </option>
                      {categories.filter((option) => option.slug === "urbano" || option.slug === "running").map((option) => (
                        <option key={option.id} value={option.id}>{option.slug === "running" ? "Running / entrenamiento" : option.name}</option>
                      ))}
                    </select>
                    {categories.length === 0 && (
                      <p className="mt-2 text-xs text-amber-700">Primero crea una categoría antes de agregar productos.</p>
                    )}
                  </div>
                </div>

                <section aria-labelledby="product-information-heading" className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
                  <h4 id="product-information-heading" className="text-sm font-bold text-slate-800">Información del producto</h4>
                  <div className="space-y-3 border-b border-slate-200 pb-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h5 className="text-sm font-semibold text-slate-800">Tallas disponibles</h5>
                        <p className="text-xs text-slate-500">Las tallas se guardan como texto y conservan el orden.</p>
                      </div>
                      <span className="text-xs text-slate-500">{productForm.sizes.length} disponibles</span>
                    </div>
                    <div className="flex gap-2">
                      <input
                        aria-label="Nueva talla"
                        value={newProductSize}
                        onChange={(event) => { setNewProductSize(event.target.value); setIsProductFormDirty(true); }}
                        onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addProductSize(); } }}
                        placeholder="Ej: 40 EU, 7.5, M"
                        className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                      />
                      <button type="button" onClick={addProductSize} className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-700">Agregar</button>
                    </div>
                    {productForm.sizes.map((size, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <input
                          aria-label={`Editar talla ${index + 1}`}
                          value={size}
                          onChange={(event) => updateProductSize(index, event.target.value)}
                          className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                        />
                        <button type="button" aria-label={`Subir talla ${size || index + 1}`} title="Subir talla" disabled={index === 0} onClick={() => moveProductSize(index, -1)} className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 disabled:opacity-40"><ChevronUp size={16} /></button>
                        <button type="button" aria-label={`Bajar talla ${size || index + 1}`} title="Bajar talla" disabled={index === productForm.sizes.length - 1} onClick={() => moveProductSize(index, 1)} className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 disabled:opacity-40"><ChevronDown size={16} /></button>
                        <button type="button" aria-label={`Quitar talla ${size || index + 1}`} onClick={() => removeProductSize(index)} className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:border-red-200 hover:text-red-700"><X size={16} /></button>
                      </div>
                    ))}
                    {formErrors.sizes && <p role="alert" className="text-xs text-red-600">{formErrors.sizes}</p>}
                  </div>

                  <div className="space-y-3 border-b border-slate-200 pb-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h5 className="text-sm font-semibold text-slate-800">Especificaciones</h5>
                        <p className="text-xs text-slate-500">Agrega nombre y valor; se mostrarán en este orden.</p>
                      </div>
                      <button type="button" onClick={addProductSpecification} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Agregar fila</button>
                    </div>
                    {(productForm.specifications ?? []).map((specification, index) => (
                      <div key={index} className="grid grid-cols-[1fr_1fr_auto] items-start gap-2">
                        <input
                          aria-label={`Nombre de especificación ${index + 1}`}
                          value={specification.name}
                          onChange={(event) => updateProductSpecification(index, 'name', event.target.value)}
                          placeholder="Nombre"
                          className="min-w-0 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                        />
                        <input
                          aria-label={`Valor de especificación ${index + 1}`}
                          value={specification.value}
                          onChange={(event) => updateProductSpecification(index, 'value', event.target.value)}
                          placeholder="Valor"
                          className="min-w-0 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                        />
                        <div className="flex gap-1">
                          <button type="button" aria-label={`Subir especificación ${index + 1}`} title="Subir especificación" disabled={index === 0} onClick={() => moveProductSpecification(index, -1)} className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 disabled:opacity-40"><ChevronUp size={16} /></button>
                          <button type="button" aria-label={`Bajar especificación ${index + 1}`} title="Bajar especificación" disabled={index === (productForm.specifications?.length ?? 0) - 1} onClick={() => moveProductSpecification(index, 1)} className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 disabled:opacity-40"><ChevronDown size={16} /></button>
                          <button type="button" aria-label={`Quitar especificación ${index + 1}`} onClick={() => removeProductSpecification(index)} className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:border-red-200 hover:text-red-700"><X size={16} /></button>
                        </div>
                      </div>
                    ))}
                    {formErrors.specifications && <p role="alert" className="text-xs text-red-600">{formErrors.specifications}</p>}
                  </div>

                  <div>
                    <label htmlFor="product-description" className="mb-2 block text-xs font-bold uppercase text-slate-600">Descripción del producto</label>
                    <textarea
                      id="product-description"
                      value={productForm.description}
                      onChange={(event) => updateField('description', event.target.value)}
                      rows={6}
                      placeholder="Describe materiales, ajuste, uso y otros detalles del producto."
                      className="w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm leading-6 text-slate-800 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                    />
                  </div>
                </section>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-4">
                  <div>
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-sm font-bold text-slate-800">Imágenes del producto</h3>
                      <span className="text-xs font-medium text-slate-500">{productImageSelections.length} seleccionadas</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">Máximo {MAX_PRODUCT_TOTAL_IMAGES} fotos: 1 principal y hasta {MAX_PRODUCT_GALLERY_IMAGES} adicionales.</p>
                    {imageUploadProgress && (
                      <p role="status" className="mt-2 text-xs font-semibold text-blue-700">
                        Subiendo imágenes: {imageUploadProgress.completed}/{imageUploadProgress.total}
                      </p>
                    )}
                  </div>

                  <label className="flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-slate-300 bg-white px-4 py-4 text-center hover:border-blue-500 hover:bg-blue-50/40">
                    <span className="text-sm font-semibold text-slate-700">Seleccionar imágenes</span>
                    <span className="text-xs text-slate-500">JPG, PNG o WebP · máximo 5 MB cada una</span>
                    <input
                      type="file"
                      aria-label="Seleccionar imágenes del producto"
                      accept="image/jpeg,image/png,image/webp"
                      multiple
                      onChange={handleProductImageFilesChange}
                      disabled={isSubmitting || productImageSelections.length >= MAX_PRODUCT_TOTAL_IMAGES}
                      className="sr-only"
                    />
                  </label>

                  {productImageSelections.length > 0 && (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                      {productImageSelections.map((entry, index) => {
                        const isPrimary = entry.id === primaryImageSelectionId;
                        return (
                          <div key={entry.id} className={`overflow-hidden rounded-lg border bg-white ${isPrimary ? 'border-blue-600 ring-1 ring-blue-600' : 'border-slate-200'}`}>
                            <div className="relative aspect-square bg-slate-100">
                              <img src={entry.src} alt={`Foto ${index + 1} de ${productForm.name || 'producto'}`} className="h-full w-full object-contain" />
                              {isPrimary && <span className="absolute left-2 top-2 rounded bg-blue-700 px-2 py-1 text-[11px] font-bold text-white">Principal</span>}
                              <button type="button" aria-label={`Quitar foto ${index + 1}`} onClick={() => removeProductImage(entry.id)} disabled={isSubmitting} className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-white text-slate-700 shadow hover:bg-red-50 hover:text-red-700 disabled:opacity-50">
                                <X size={16} />
                              </button>
                            </div>
                            <div className="min-h-12 p-2">
                              {!isPrimary ? (
                                <button type="button" onClick={() => { setPrimaryImageSelectionId(entry.id); setIsProductFormDirty(true); }} disabled={isSubmitting} className="text-left text-xs font-semibold text-blue-700 hover:underline disabled:opacity-50">Usar como principal</button>
                              ) : (
                                <span className="text-xs font-medium text-slate-600">Imagen principal</span>
                              )}
                              {entry.file && <span className="mt-1 block text-[11px] text-amber-700">Pendiente de carga</span>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {formErrors.image && <p className="text-xs text-red-600">{formErrors.image}</p>}
                  {formErrors.gallery && <p className="text-xs text-red-600">{formErrors.gallery}</p>}
                </div>

                {/* Botones de acción mejorados */}
                <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
                  <button 
                    type="submit" 
                    disabled={isSubmitting}
                      className="admin-page-action w-full disabled:cursor-not-allowed"
                  >
                    {isSubmitting ? (
                      <>
                        <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
                        {formMode === 'edit' ? 'Guardando cambios...' : 'Creando producto...'}
                      </>
                    ) : (
                      <>
                        {formMode === 'edit' ? <Check size={16} aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}
                        {formMode === 'edit' ? 'Guardar cambios' : 'Crear producto'}
                      </>
                    )}
                  </button>
                  <button 
                    type="button" 
                    onClick={() => requestCloseProductForm()}
                    disabled={isSubmitting}
                    className="flex-1 rounded-lg border border-slate-200 bg-white px-5 py-3 font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
              </div>
            </div>
            </dialog>
          </div>
        );

      case "orders":
        return (
          <div className="bg-white/95 rounded-[30px] border border-slate-200/80 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.16)] overflow-hidden">
            <div className="flex items-center justify-between gap-3 p-5 border-b border-slate-50">
              <div>
                <h2 className="text-lg font-extrabold text-slate-900">Pedidos recientes</h2>
                <p className="mt-1 text-xs text-slate-500">{remoteCountMetric(dashboardData?.orders, "Todavía no hay pedidos registrados.")}</p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px]">
                <thead>
                  <tr className="border-b border-slate-50">
                    {['Pedido', 'Cliente', 'Fecha', 'Estado', 'Artículos', 'Total'].map((heading) => (
                      <th key={heading} className="text-left px-5 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wide">{heading}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dashboardStatus === "loading" && <tr><td colSpan={6} role="status" className="px-5 py-8 text-center text-sm text-slate-500">Cargando pedidos…</td></tr>}
                  {dashboardStatus === "error" && <tr><td colSpan={6} role="alert" className="px-5 py-8 text-center text-sm text-red-700">No fue posible cargar los pedidos. Intenta nuevamente.</td></tr>}
                  {dashboardStatus === "ready" && dashboardData?.orders.status === "forbidden" && <tr><td colSpan={6} role="status" className="px-5 py-8 text-center text-sm text-slate-500">No tienes permisos para consultar los pedidos.</td></tr>}
                  {dashboardStatus === "ready" && dashboardData?.orders.status === "error" && <tr><td colSpan={6} role="alert" className="px-5 py-8 text-center text-sm text-red-700">No fue posible cargar los pedidos. Intenta nuevamente.</td></tr>}
                  {dashboardStatus === "ready" && dashboardData?.orders.status === "empty" && <tr><td colSpan={6} role="status" className="px-5 py-8 text-center text-sm text-slate-500">Todavía no hay pedidos registrados.</td></tr>}
                  {dashboardStatus === "ready" && dashboardData?.orders.status === "ready" && dashboardData.orders.recent.map((order) => (
                    <tr key={order.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                      <td className="px-5 py-3 text-xs font-mono font-bold text-[#1e3a8a]">{order.order_number || order.id.slice(0, 8)}</td>
                      <td className="px-5 py-3 text-sm text-slate-700">{order.customer_name ?? "—"}</td>
                      <td className="px-5 py-3 text-xs text-slate-500">{formatAdminProductDate(order.created_at)}</td>
                      <td className="px-5 py-3"><span className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${STATUS_STYLE[order.status] ?? "border border-slate-200 bg-slate-50 text-slate-700"}`}>{ORDER_STATUS_LABELS[order.status] ?? order.status}</span></td>
                      <td className="px-5 py-3 text-sm text-slate-700">{order.item_count}</td>
                      <td className="price px-5 py-3 text-sm text-slate-900">{fmt(Number(order.total))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );

      case "inventory":
        return (
          <div className="space-y-5 mb-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-lg font-extrabold text-slate-900">Inventario</h2>
                <p className="mt-1 text-sm text-slate-600">Fuente actual: stock por producto. La gestión de variantes no está activa.</p>
                <p className="mt-1 text-xs text-slate-500">Última actualización: {inventoryUpdateLabel}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {metrics.slice(1, 6).map((metric) => (
                <div key={metric.label} className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-lg font-bold text-slate-900">{metric.value}</p>
                  <p className="mt-1 text-xs text-slate-500">{metric.label}</p>
                </div>
              ))}
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row">
                <input value={searchTerm} onChange={(event) => { setSearchTerm(event.target.value); setInventoryPage(1); }} placeholder="Buscar por nombre, SKU, marca o categoría" className="min-h-10 min-w-0 flex-1 rounded-lg border border-slate-200 px-3 text-sm text-slate-800" />
                <select aria-label="Filtrar inventario" value={inventoryFilter} onChange={(event) => { setInventoryFilter(event.target.value as typeof inventoryFilter); setInventoryPage(1); }} className="min-h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700">
                  <option value="all">Todos</option>
                  <option value="low">Stock bajo</option>
                  <option value="out">Agotados</option>
                  <option value="active">Activos</option>
                  <option value="inactive">Inactivos</option>
                </select>
              </div>
              {productsStatus === "loading" && <p role="status" className="py-8 text-center text-sm text-slate-500">Cargando inventario…</p>}
              {productsStatus === "error" && <div role="alert" className="py-8 text-center text-sm text-red-700">No fue posible cargar el inventario. <button type="button" onClick={onRetryProducts} className="font-semibold underline">Intentar de nuevo</button></div>}
              {productsStatus === "ready" && products.length === 0 && <p role="status" className="py-8 text-center text-sm text-slate-500">No hay productos registrados.</p>}
              {productsStatus === "ready" && products.length > 0 && inventoryProducts.length === 0 && <p role="status" className="py-8 text-center text-sm text-slate-500">No hay productos para este filtro.</p>}
              {productsStatus === "ready" && inventoryProducts.length > 0 && (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {paginatedInventoryProducts.map((product) => {
                    const stock = Number(product.stock ?? 0);
                    const stockLabel = stock <= 0 ? "Agotado" : stock <= LOW_STOCK_THRESHOLD ? "Stock bajo" : "Stock normal";
                    return (
                      <article key={product.id} className="min-w-0 rounded-xl border border-slate-200 p-4">
                        <div className="flex gap-3">
                          <img src={product.image} alt="" className="h-14 w-14 shrink-0 rounded-lg bg-slate-100 object-cover" />
                          <div className="min-w-0 flex-1">
                            <h3 className="break-words text-sm font-semibold text-slate-900">{product.name}</h3>
                            <p className="mt-1 break-words text-xs text-slate-500">{product.sku} · {product.category}</p>
                          </div>
                        </div>
                        <div className="mt-4 flex items-center justify-between gap-2">
                          <div>
                            <p className="text-base font-bold text-slate-900">{stock.toLocaleString("es-CO")} unidades</p>
                            <p className="text-xs text-slate-500">{stockLabel} · {product.isActive === false ? "Inactivo" : "Activo"}</p>
                          </div>
                          <div className="flex gap-2">
                            <button type="button" onClick={() => { handleEditProduct(product); handleSidebarClick("products"); }} className="min-h-9 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50">Editar</button>
                            <button type="button" onClick={() => setStockAdjustment({ productId: product.id, movementType: "in", quantity: "1", reason: "", error: null })} className="min-h-9 rounded-lg border border-blue-200 bg-blue-50 px-3 text-xs font-semibold text-blue-700 hover:bg-blue-100">Ajustar</button>
                          </div>
                        </div>
                        {stockAdjustment.productId === product.id && (
                          <form className="mt-4 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3" onSubmit={async (event) => {
                            event.preventDefault();
                            if (!stockAdjustment.productId) return;
                            const quantity = Number(stockAdjustment.quantity);
                            if (!Number.isFinite(quantity) || quantity <= 0) {
                              setStockAdjustment((current) => ({ ...current, error: "La cantidad debe ser mayor que cero." }));
                              return;
                            }
                            if (!stockAdjustment.reason.trim()) {
                              setStockAdjustment((current) => ({ ...current, error: "Debes indicar el motivo del ajuste." }));
                              return;
                            }
                            setStockAdjustmentSubmittingId(stockAdjustment.productId);
                            setStockAdjustment((current) => ({ ...current, error: null }));
                            try {
                              await adjustStock(stockAdjustment.productId, stockAdjustment.movementType, quantity, stockAdjustment.reason);
                              setStockAdjustment({ productId: null, movementType: 'in', quantity: '1', reason: '', error: null });
                              toast.success('Stock actualizado correctamente.');
                            } catch (error) {
                              setStockAdjustment((current) => ({ ...current, error: formatAdminApiError(error, 'No se pudo ajustar el stock.') }));
                            } finally {
                              setStockAdjustmentSubmittingId(null);
                            }
                          }}>
                            <label className="block text-xs font-medium text-slate-700">
                              Tipo de ajuste
                              <select aria-label={`Tipo de ajuste para ${product.name}`} value={stockAdjustment.movementType} onChange={(event) => setStockAdjustment((current) => ({ ...current, movementType: event.target.value as 'in' | 'out' | 'correction' }))} className="mt-1 min-h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800">
                                <option value="in">Entrada</option>
                                <option value="out">Salida</option>
                                <option value="correction">Corrección</option>
                              </select>
                            </label>
                            <label className="block text-xs font-medium text-slate-700">
                              Cantidad
                              <input aria-label={`Cantidad para ${product.name}`} type="number" min="1" step="1" value={stockAdjustment.quantity} onChange={(event) => setStockAdjustment((current) => ({ ...current, quantity: event.target.value }))} className="mt-1 min-h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800" />
                            </label>
                            <label className="block text-xs font-medium text-slate-700">
                              Motivo
                              <input aria-label={`Motivo para ${product.name}`} type="text" value={stockAdjustment.reason} onChange={(event) => setStockAdjustment((current) => ({ ...current, reason: event.target.value }))} placeholder="Ej. Ajuste de inventario / devolución / conteo" className="mt-1 min-h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800" />
                            </label>
                            {stockAdjustment.error && <p role="alert" className="text-xs text-red-700">{stockAdjustment.error}</p>}
                            <div className="flex gap-2 pt-1">
                              <button type="submit" disabled={stockAdjustmentSubmittingId === product.id} className="min-h-9 rounded-lg bg-[#bfdbfe] px-3 text-xs font-semibold text-[#0b1220] disabled:opacity-60">{stockAdjustmentSubmittingId === product.id ? "Guardando…" : "Guardar"}</button>
                              <button type="button" onClick={() => setStockAdjustment({ productId: null, movementType: 'in', quantity: '1', reason: '', error: null })} className="min-h-9 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700">Cancelar</button>
                            </div>
                          </form>
                        )}
                        <p className="mt-3 text-xs text-slate-400">Actualizado: {formatAdminProductDate(product.updatedAt)}</p>
                      </article>
                    );
                  })}
                </div>
              )}
              {productsStatus === "ready" && inventoryProducts.length > inventoryPageSize && (
                <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4">
                  <p className="text-xs text-slate-500">Página {inventoryPage} de {inventoryTotalPages}</p>
                  <div className="flex gap-2">
                    <button type="button" disabled={inventoryPage <= 1} onClick={() => setInventoryPage((currentPage) => Math.max(1, currentPage - 1))} className="min-h-9 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 disabled:opacity-50">Anterior</button>
                    <button type="button" disabled={inventoryPage >= inventoryTotalPages} onClick={() => setInventoryPage((currentPage) => Math.min(inventoryTotalPages, currentPage + 1))} className="min-h-9 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 disabled:opacity-50">Siguiente</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        );

      case "coupons":
        return (
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="text-lg font-bold text-slate-900">Promociones y cupones</h2>
            <p role="status" className="mt-2 text-sm text-slate-600">
              La gestión de promociones no está conectada a persistencia. No se muestran ejemplos ni se guardan cambios desde este panel.
            </p>
          </div>
        );

      case "reports":
        return (
          <div className="space-y-5 rounded-xl border border-slate-200 bg-white p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Reportes</h2>
                <p className="mt-1 text-sm text-slate-500">Pedidos con pago confirmado en los últimos 7 días.</p>
              </div>
            </div>
            {dashboardStatus === "loading" && <p role="status" className="text-sm text-slate-600">Cargando reportes…</p>}
            {(dashboardStatus === "error" || dashboardData?.sales.status === "error") && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">No fue posible cargar los reportes. Intenta nuevamente.</p>}
            {(dashboardData?.sales.status === "forbidden" || dashboardData?.category_sales_status === "forbidden") && <p role="status" className="text-sm text-slate-600">No tienes permisos para consultar los reportes.</p>}
            {dashboardStatus === "ready" && dashboardData?.sales.status === "empty" && <p role="status" className="text-sm text-slate-600">No hay pedidos con pago confirmado para el periodo seleccionado.</p>}
            {dashboardStatus === "ready" && dashboardData?.sales.status === "ready" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs text-slate-500">Ingresos · últimos 7 días</p>
                  <p className="mt-1 text-2xl font-bold text-slate-900">{dashboardData.sales.total_7d === null ? "No disponible" : `${fmt(dashboardData.sales.total_7d)} COP`}</p>
                  <p className="mt-1 text-xs text-slate-500">{dashboardData.sales.period_start ? new Date(dashboardData.sales.period_start).toLocaleDateString("es-CO") : "—"} – {dashboardData.sales.period_end ? new Date(dashboardData.sales.period_end).toLocaleDateString("es-CO") : "—"}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs text-slate-500">Pedidos pagados · últimos 7 días</p>
                  <p className="mt-1 text-2xl font-bold text-slate-900">{dashboardData.sales.paid_orders?.toLocaleString("es-CO") ?? "No disponible"}</p>
                </div>
              </div>
            )}
            <div className="rounded-lg border border-slate-200 p-4">
              <h3 className="text-sm font-semibold text-slate-800">Ventas por categoría</h3>
              <p role="status" className="mt-1 text-sm text-slate-600">
                {dashboardData?.category_sales_status === "empty" ? "No hay datos de ventas por categoría para el periodo seleccionado." : dashboardData?.category_sales_status === "pending" ? "Pendiente: los artículos del pedido no conservan la categoría histórica del producto." : dashboardData?.category_sales_status === "forbidden" ? "No tienes permisos para consultar este reporte." : dashboardStatus === "error" ? "No fue posible cargar los datos de categoría." : "Cargando o sin datos disponibles."}
              </p>
            </div>
          </div>
        );

      case "activity":
        return (
          <div className="bg-white/95 rounded-[30px] border border-slate-200/80 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.16)] p-5 mb-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-extrabold text-slate-900">Actividad</h2>
                <p className="text-sm text-slate-600">Registros recientes de auditoría y cambios en el panel.</p>
              </div>
            </div>
            {auditStatus === "loading" && <p role="status" className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">Cargando actividad…</p>}
            {auditStatus === "error" && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">No fue posible cargar la actividad. Intenta nuevamente.</div>}
            {auditStatus === "empty" && <p role="status" className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">No hay actividad registrada.</p>}
            {auditStatus === "ready" ? (
              <div className="space-y-3">
                {auditEntries.map((entry) => (
                  <div key={entry.id} className="rounded-3xl bg-slate-50 p-4">
                    <p className="text-sm font-semibold text-slate-800">{{ create_product: "Producto creado", update_product: "Producto actualizado", activate_product: "Producto activado", deactivate_product: "Producto desactivado", archive_product: "Producto archivado", delete_product: "Producto eliminado", inventory_movement: "Inventario ajustado" }[entry.action] ?? entry.action.replaceAll("_", " ")}</p>
                    {entry.meta?.entity && <p className="mt-1 text-xs text-slate-500">Tipo: {String(entry.meta.entity)}</p>}
                    <p className="mt-1 text-xs text-slate-500">{new Date(entry.ts).toLocaleString('es-CO')}</p>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        );

      case "settings":
        return (
          <div className="bg-white/95 rounded-[30px] border border-slate-200/80 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.16)] p-5 mb-6">
            <h2 className="text-lg font-extrabold text-slate-900 mb-4">Ajustes</h2>
            <div className="space-y-4">
              <div className="rounded-3xl bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-800">Preferencias del panel</p>
                <p className="text-sm text-slate-500">Activa o desactiva notificaciones y personaliza la vista del administrador.</p>
              </div>
              <p role="status" className="text-sm text-slate-600">La configuración de tienda y usuarios administradores aún no tiene endpoints ni almacenamiento conectados.</p>
            </div>
          </div>
        );

      default:
        return (
          <div className="bg-white/95 rounded-[30px] border border-slate-200/80 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.16)] p-5">
            <p className="text-sm text-slate-600">Sección no disponible todavía.</p>
          </div>
        );
    }
  };

  type UpdateFieldFn = <K extends keyof Omit<Product, "id">>(field: K, value: Omit<Product, "id">[K]) => void;
  const updateField: UpdateFieldFn = (field, value) => {
    setProductForm((prev) => ({ ...prev, [field]: value }));
    setIsProductFormDirty(true);
  };

  const addProductSize = () => {
    const size = newProductSize.trim();
    if (!size) return;
    if (productForm.sizes.some((existingSize) => existingSize.trim().toLowerCase() === size.toLowerCase())) {
      toast.error('Esa talla ya está agregada.');
      return;
    }
    updateField('sizes', [...productForm.sizes, size]);
    setNewProductSize('');
  };

  const updateProductSize = (index: number, size: string) => {
    updateField('sizes', productForm.sizes.map((existingSize, currentIndex) => currentIndex === index ? size : existingSize));
  };

  const moveProductSize = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= productForm.sizes.length) return;
    const reordered = [...productForm.sizes];
    [reordered[index], reordered[nextIndex]] = [reordered[nextIndex], reordered[index]];
    updateField('sizes', reordered);
  };

  const removeProductSize = (index: number) => {
    updateField('sizes', productForm.sizes.filter((_, currentIndex) => currentIndex !== index));
  };

  const updateProductSpecification = (index: number, field: 'name' | 'value', value: string) => {
    const specifications = productForm.specifications ?? [];
    updateField('specifications', specifications.map((specification, currentIndex) => (
      currentIndex === index ? { ...specification, [field]: value } : specification
    )));
  };

  const addProductSpecification = () => {
    updateField('specifications', [...(productForm.specifications ?? []), { name: '', value: '' }]);
  };

  const moveProductSpecification = (index: number, direction: -1 | 1) => {
    const specifications = [...(productForm.specifications ?? [])];
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= specifications.length) return;
    [specifications[index], specifications[nextIndex]] = [specifications[nextIndex], specifications[index]];
    updateField('specifications', specifications);
  };

  const removeProductSpecification = (index: number) => {
    updateField('specifications', (productForm.specifications ?? []).filter((_, currentIndex) => currentIndex !== index));
  };

  const validateImageFile = (file: File) => {
    const supportedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    const maxSizeBytes = 5 * 1024 * 1024;

    if (!supportedTypes.includes(file.type)) return 'Formato no válido. Usa JPG, PNG o WebP.';
    if (file.size === 0) return 'El archivo está vacío.';
    if (file.size > maxSizeBytes) return 'El archivo excede el límite de 5 MB.';
    return null;
  };

  const handleProductImageFilesChange = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (!files.length) return;

    let remainingSlots = MAX_PRODUCT_TOTAL_IMAGES - productImageSelections.length;
    const additions: AdminProductImageSelection[] = [];
    for (const file of files) {
      const validationError = validateImageFile(file);
      if (validationError) {
        toast.error(`${file.name}: ${validationError}`);
        continue;
      }
      if (remainingSlots <= 0) {
        toast.error(`Máximo ${MAX_PRODUCT_TOTAL_IMAGES} imágenes en total: 1 principal y hasta ${MAX_PRODUCT_GALLERY_IMAGES} adicionales.`);
        break;
      }

      const previewUrl = URL.createObjectURL(file);
      objectUrlsRef.current.add(previewUrl);
      additions.push({ id: crypto.randomUUID(), src: previewUrl, file, previewUrl });
      remainingSlots -= 1;
    }

    if (!additions.length) return;
    setProductImageSelections((previous) => [...previous, ...additions]);
    setPrimaryImageSelectionId((previous) => previous ?? additions[0].id);
    setFormErrors((previous) => ({ ...previous, image: '', gallery: '' }));
    setIsProductFormDirty(true);
  };

  const removeProductImage = (imageId: string) => {
    const removed = productImageSelections.find((entry) => entry.id === imageId);
    releaseImagePreview(removed?.previewUrl);
    const remaining = productImageSelections.filter((entry) => entry.id !== imageId);
    setProductImageSelections(remaining);
    if (primaryImageSelectionId === imageId) setPrimaryImageSelectionId(remaining[0]?.id ?? null);
    setIsProductFormDirty(true);
  };

  const pageAction = (() => {
    if (adminSection === "products") return { label: "Nuevo producto", icon: <Plus size={16} />, onClick: () => openNewProductForm() };
    if (adminSection === "homepage") return { label: homeContentSaving ? "Guardando…" : "Guardar contenido", icon: <Check size={16} />, onClick: () => void saveHomeContent(), disabled: homeContentSaving };
    if (adminSection === "inventory") return { label: productsStatus === "loading" ? "Actualizando…" : "Actualizar inventario", icon: <RefreshCw size={15} />, onClick: onRetryProducts, disabled: productsStatus === "loading" };
    if (adminSection === "activity") return { label: auditStatus === "loading" ? "Actualizando…" : "Actualizar actividad", icon: <RefreshCw size={15} />, onClick: () => void refreshAudit(), disabled: auditStatus === "loading" };
    if (adminSection === "dashboard") return { label: "Actualizar resumen", icon: <RefreshCw size={15} />, onClick: () => { setDashboardRefresh((value) => value + 1); onRetryProducts(); void refreshAudit(); } };
    if (adminSection === "orders" || adminSection === "reports") return { label: "Actualizar datos", icon: <RefreshCw size={15} />, onClick: () => setDashboardRefresh((value) => value + 1) };
    return null;
  })();

  return (
    <div className={`admin-shell${sidebarCollapsed ? " is-sidebar-collapsed" : ""}`}>
      <aside className="admin-sidebar" aria-label="Navegación administrativa">
        <div className="admin-sidebar__brand">
          <div className="admin-sidebar__brand-copy">
            <p>UrbanSport Store</p>
            <p>Administración</p>
          </div>
          <button type="button" className="admin-sidebar__collapse" onClick={() => setSidebarCollapsed((collapsed) => !collapsed)} aria-label={sidebarCollapsed ? "Expandir navegación" : "Contraer navegación"} title={sidebarCollapsed ? "Expandir navegación" : "Contraer navegación"}>
            {sidebarCollapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
          </button>
        </div>
        <nav className="admin-sidebar__nav">
          {visibleSidebarLinks.map((link) => (
            <button type="button" key={link.id} onClick={() => handleSidebarClick(link.id)} className="admin-sidebar__link" aria-current={adminSection === link.id ? "page" : undefined} aria-label={sidebarCollapsed ? link.label : undefined} title={sidebarCollapsed ? link.label : undefined}>
              {link.icon}<span className="admin-sidebar__label">{link.label}</span>
            </button>
          ))}
        </nav>
        <div className="admin-sidebar__footer">
          <button type="button" onClick={navigateToStore}>
            <ArrowRight size={16} /><span className="admin-sidebar__label">Ir a la tienda</span>
          </button>
        </div>
      </aside>

      <main className="admin-main">
        <div className="admin-toolbar">
          <button type="button" className="admin-menu-button" onClick={() => setSidebarCollapsed((collapsed) => !collapsed)} aria-label={sidebarCollapsed ? "Expandir navegación" : "Contraer navegación"} title={sidebarCollapsed ? "Expandir navegación" : "Contraer navegación"}>
            {sidebarCollapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
          </button>
          <button type="button" className="admin-toolbar__store" onClick={navigateToStore}><ArrowRight size={15} />Ir a la tienda</button>
        </div>

        <div className="admin-mobile-bar">
          <button ref={mobileMenuButtonRef} type="button" className="admin-menu-button" onClick={() => setMobileSidebarOpen(true)} aria-label="Abrir navegación" aria-controls="admin-mobile-navigation" aria-expanded={mobileSidebarOpen}>
            <Menu size={19} />
          </button>
          <span className="admin-mobile-bar__identity">UrbanSport · {pageTitle}</span>
          <button type="button" className="admin-menu-button" onClick={navigateToStore} aria-label="Ir a la tienda" title="Ir a la tienda"><ArrowRight size={17} /></button>
        </div>

        {mobileSidebarOpen && <>
          <button type="button" className="admin-mobile-backdrop" aria-label="Cerrar navegación" onClick={() => setMobileSidebarOpen(false)} />
          <aside id="admin-mobile-navigation" className="admin-mobile-drawer" role="dialog" aria-modal="true" aria-label="Navegación administrativa">
            <div className="admin-mobile-drawer__header">
              <span>Secciones</span>
              <button type="button" className="admin-icon-button" onClick={() => setMobileSidebarOpen(false)} aria-label="Cerrar menú"><X size={17} /></button>
            </div>
            <nav className="admin-mobile-drawer__nav">
              {visibleSidebarLinks.map((link) => (
                <button type="button" key={link.id} onClick={() => handleSidebarClick(link.id)} className="admin-sidebar__link" aria-current={adminSection === link.id ? "page" : undefined}>
                  {link.icon}<span>{link.label}</span>
                </button>
              ))}
            </nav>
            <div className="admin-sidebar__footer">
              <button type="button" onClick={navigateToStore}><ArrowRight size={16} /><span>Ir a la tienda</span></button>
            </div>
          </aside>
        </>}

        <header className="admin-page-header">
          <div>
            <h1>{pageTitle}</h1>
            <p>{SECTION_DESCRIPTIONS[adminSection] ?? "Administración de UrbanSport Store."}</p>
          </div>
          {pageAction && <button type="button" className="admin-page-action" onClick={pageAction.onClick} disabled={"disabled" in pageAction ? pageAction.disabled : false}>
            {pageAction.icon}{pageAction.label}
          </button>}
        </header>

        <div className="admin-content">
        {(() => {
          try {
            return renderAdminSection();
          } catch (err) {
            // eslint-disable-next-line no-console
            console.error('renderAdminSection error', err);
            return (
              <div className="p-6 bg-red-50 text-red-700 rounded-lg">
                <h3 className="font-bold">Error al renderizar la sección</h3>
                <pre className="text-xs mt-2">{String(err)}</pre>
              </div>
            );
          }
        })()}
        </div>
      </main>
    </div>
  );
}

// ─── APP ─────────────────────────────────────────────────────────────────────

export default function App() {
  const [view, setView] = useState<View>(getInitialView);
  const [backendHomeAvailable, setBackendHomeAvailable] = useState<boolean | null>(null);
  const [initialAdminSection, setInitialAdminSection] = useState<string | undefined>(getInitialAdminSection);
  const [products, setProducts] = useState<Product[]>([]);
  const [productsStatus, setProductsStatus] = useState<ProductsStatus>("loading");
  const [adminProducts, setAdminProducts] = useState<Product[]>([]);
  const [adminProductsStatus, setAdminProductsStatus] = useState<ProductsStatus>("loading");
  const [adminProductsError, setAdminProductsError] = useState<string | null>(null);
  const [categoryOptions, setCategoryOptions] = useState<CategoryOption[]>([]);
  const [productRefresh, setProductRefresh] = useState(0);
  const [headerOffset, setHeaderOffset] = useState<number>(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const calcHeader = () => {
      const hdr = document.querySelector('header.fixed.top-0.left-0.right-0.z-50');
      if (hdr && hdr instanceof HTMLElement) {
        setHeaderOffset(hdr.offsetHeight || 0);
      }
    };
    calcHeader();
    window.addEventListener('resize', calcHeader);
    window.addEventListener('orientationchange', calcHeader);
    return () => {
      window.removeEventListener('resize', calcHeader);
      window.removeEventListener('orientationchange', calcHeader);
    };
  }, []);

  const bannerMarginStyle = headerOffset ? { marginTop: `${headerOffset}px` } : undefined;

  useEffect(() => {
    let isActive = true;

    const normalizeApiRoot = (url?: string) => resolveApiBaseUrl(url);

    const normalizeHomeContentResponse = (data: Record<string, unknown>): Partial<HomePageContent> => {
      const normalized: Partial<HomePageContent> = {
        ...data,
        heroTitle: typeof data.hero_title === 'string' ? data.hero_title : typeof data.heroTitle === 'string' ? data.heroTitle : undefined,
        heroSubtitle: typeof data.hero_subtitle === 'string' ? data.hero_subtitle : typeof data.heroSubtitle === 'string' ? data.heroSubtitle : undefined,
        heroImage: typeof data.hero_image === 'string' ? data.hero_image : typeof data.heroImage === 'string' ? data.heroImage : undefined,
        featuredCategoryIds: typeof data.featured_category_ids === 'string' ? data.featured_category_ids : typeof data.featuredCategoryIds === 'string' ? data.featuredCategoryIds : undefined,
        featuredProductIds: typeof data.featured_product_ids === 'string' ? data.featured_product_ids : typeof data.featuredProductIds === 'string' ? data.featuredProductIds : undefined,
        discountedProductIds: typeof data.discounted_product_ids === 'string' ? data.discounted_product_ids : typeof data.discountedProductIds === 'string' ? data.discountedProductIds : undefined,
        promoBanner: typeof data.promo_banner === 'string' ? data.promo_banner : typeof data.promoBanner === 'string' ? data.promoBanner : undefined,
        newsletterEnabled: typeof data.newsletter_enabled === 'boolean' ? data.newsletter_enabled : typeof data.newsletterEnabled === 'boolean' ? data.newsletterEnabled : undefined,
      };

      const undesiredHeroTitle = ['Urban Sport Store', 'Bienvenido a Urban Sport Store', 'URBAN SPORT STORE'].includes(normalized.heroTitle ?? '');
      const undesiredHeroSubtitle = ['Descubre productos deportivos seleccionados', 'Explora el catálogo principal con categorías y productos mínimos para pruebas públicas'].includes(normalized.heroSubtitle ?? '');

      if (undesiredHeroTitle || undesiredHeroSubtitle) {
        return {
          ...normalized,
          heroTitle: DEFAULT_HERO_TITLE,
          heroSubtitle: DEFAULT_HERO_SUBTITLE,
          heroImage: DEFAULT_HERO_IMAGE,
        };
      }

      return normalized;
    };

    const loadHomeContent = async () => {
      const apiUrl = normalizeApiRoot(import.meta.env.VITE_API_URL);
      try {
        const res = await fetch(`${apiUrl}/home`);
        if (!res.ok) {
          setBackendHomeAvailable(false);
          return;
        }

        setBackendHomeAvailable(true);
        const json = await res.json();
        if (json?.data) {
          setHomeContent((prev) => ({ ...prev, ...(normalizeHomeContentResponse(json.data) as Partial<HomePageContent>) }));
        }
      } catch (error) {
        console.warn('No se pudo cargar el contenido de la home desde backend.', error);
        setBackendHomeAvailable(false);
      }
    };

    if (typeof window !== 'undefined') {
      void loadHomeContent();
    }

    const loadProducts = async () => {
      const apiUrl = normalizeApiRoot(import.meta.env.VITE_API_URL);
      setProductsStatus("loading");

      try {
        const [res, categories] = await Promise.all([
          fetch(`${apiUrl}/products`),
          fetchPublicCategories().catch((error) => {
            console.warn('No se pudieron cargar categorías desde el API.', error);
            return [];
          }),
        ]);
        setCategoryOptions(categories);
        if (!res.ok) {
          throw new Error(`Products API returned ${res.status}`);
        }

        const json = await res.json();
        if (!isActive) return;
        if (!Array.isArray(json?.data)) {
          throw new Error('Public API returned invalid payload');
        }

        setProducts(json.data.map((record: ProductRecord) => mapProductRecordToAppProduct(record, categories)));
        setProductsStatus("ready");
      } catch (error) {
        if (!isActive) return;
        console.warn('No se pudo cargar productos desde el backend público.', error);
        setProducts([]);
        setProductsStatus("error");
      }
    };

    void loadProducts();
    return () => {
      isActive = false;
    };
  }, [productRefresh]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [filterCategory, setFilterCategory] = useState<Category | null>(() => {
    if (typeof window === "undefined") return null;
    return new URLSearchParams(window.location.search).get("category") || null;
  });
  const [catalogBrand, setCatalogBrand] = useState<string | null>(null);
  const [catalogSort, setCatalogSort] = useState("relevancia");

  useEffect(() => {
    if (view !== "product" || productsStatus !== "ready") return;
    const productKey = new URLSearchParams(window.location.search).get("product");
    if (!productKey) return;
    const matchedProduct = products.find((product) => product.id === productKey || product.slug === productKey);
    if (matchedProduct) {
      setSelectedProduct(matchedProduct);
      return;
    }

    setSelectedProduct(null);
    setView("catalog");
    const url = new URL(window.location.href);
    url.searchParams.delete("product");
    url.searchParams.set("view", "catalog");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }, [products, productsStatus, view]);

  useEffect(() => {
    const isPublicImageUrl = (value: string | null | undefined): value is string => {
      if (!value) return false;
      try {
        const url = new URL(value);
        return url.protocol === "https:" || url.protocol === "http:";
      } catch {
        return false;
      }
    };

    const productPage = view === "product" ? selectedProduct : null;
    const pageTitles: Partial<Record<View, string>> = {
      home: STORE_CONFIG.homeTitle,
      catalog: `Catálogo | ${STORE_CONFIG.brand}`,
      checkout: `Checkout no disponible | ${STORE_CONFIG.brand}`,
      login: `Iniciar sesión | ${STORE_CONFIG.brand}`,
      register: `Crear cuenta | ${STORE_CONFIG.brand}`,
      account: `Mi cuenta | ${STORE_CONFIG.brand}`,
      "admin-login": `Administración | ${STORE_CONFIG.brand}`,
      admin: `Administración | ${STORE_CONFIG.brand}`,
      privacy: `Privacidad | ${STORE_CONFIG.brand}`,
      terms: `Términos | ${STORE_CONFIG.brand}`,
      shipping: `Envíos | ${STORE_CONFIG.brand}`,
      returns: `Cambios y devoluciones | ${STORE_CONFIG.brand}`,
      contact: `Contacto | ${STORE_CONFIG.brand}`,
      "password-reset": `Restablecer contraseña | ${STORE_CONFIG.brand}`,
    };
    const pageTitle = productPage ? `${productPage.name} | ${STORE_CONFIG.brand}` : pageTitles[view] ?? STORE_CONFIG.homeTitle;
    const productDescription = productPage?.description?.trim();
    const pageDescription = productDescription && productDescription !== "Producto cargado desde Supabase"
      ? productDescription
      : STORE_CONFIG.homeDescription;
    const pageImage = productPage && isPublicImageUrl(productPage.image) ? productPage.image : DEFAULT_HERO_IMAGE;
    const canonicalUrl = new URL(window.location.pathname, window.location.origin).toString();

    document.title = pageTitle;

    const setMeta = (selector: string, value: string, attribute: "content" | "href" = "content") => {
      const element = document.querySelector<HTMLMetaElement | HTMLLinkElement>(selector);
      if (element) element.setAttribute(attribute, value);
    };

    const homeMetaTitle = STORE_CONFIG.homeTitle;
    const homeMetaDescription = STORE_CONFIG.homeDescription;

    if (view === "home") {
      setMeta('meta[name="description"]', homeMetaDescription);
      setMeta('meta[property="og:title"]', homeMetaTitle);
      setMeta('meta[property="og:description"]', homeMetaDescription);
      setMeta('meta[name="twitter:title"]', homeMetaTitle);
      setMeta('meta[name="twitter:description"]', homeMetaDescription);
      setMeta('link[rel="canonical"]', canonicalUrl, "href");
      return;
    }

    setMeta('meta[name="description"]', pageDescription);
    setMeta('meta[property="og:title"]', pageTitle);
    setMeta('meta[property="og:description"]', pageDescription);
    setMeta('meta[property="og:type"]', productPage ? "product" : "website");
    setMeta('meta[property="og:url"]', canonicalUrl);
    setMeta('meta[property="og:image"]', pageImage);
    setMeta('meta[name="twitter:title"]', pageTitle);
    setMeta('meta[name="twitter:description"]', pageDescription);
    setMeta('meta[name="twitter:image"]', pageImage);
    setMeta('link[rel="canonical"]', canonicalUrl, "href");
  }, [selectedProduct, view]);

  const [cart, setCart] = useState<StorefrontCartLine[]>([]);
  const [unavailableCartItems, setUnavailableCartItems] = useState<GuestCartItem[]>([]);
  const [cartRestoreComplete, setCartRestoreComplete] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);

  useEffect(() => {
    if (productsStatus !== "ready" || cartRestoreComplete) return;

    const resolvedCart = resolveGuestCartEntries(loadStoredCartEntries(), products);
    setCart(resolvedCart.restoredItems);
    setUnavailableCartItems(resolvedCart.unavailableItems);
    setCartRestoreComplete(true);
  }, [cartRestoreComplete, products, productsStatus]);

  useEffect(() => {
    if (productsStatus !== "ready") {
      setCartRestoreComplete(false);
    }
  }, [productsStatus]);

  useEffect(() => {
    if (!cartRestoreComplete) return;
    try {
      const entries: GuestCartItem[] = [
        ...cart.map((item) => ({
          productId: item.product.id,
          quantity: item.qty,
          selectedSize: item.selectedSize,
          selectedColor: item.selectedColor,
        })),
        ...unavailableCartItems,
      ];
      window.localStorage.setItem(LOCAL_CART_STORAGE, JSON.stringify(entries));
    } catch (error) {
      console.warn("No se pudo guardar el carrito en este dispositivo.", error);
    }
  }, [cart, cartRestoreComplete, unavailableCartItems]);
  const [addresses, setAddresses] = useState<Address[]>(loadStoredAddresses);
  const [selectedAddressId, setSelectedAddressId] = useState<string>(() => {
    const stored = loadStoredAddresses();
    return stored[0]?.id ?? "";
  });
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [profileRole, setProfileRole] = useState<string | null>(null);
  const [profileAccessError, setProfileAccessError] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [homeContent, setHomeContent] = useState<HomePageContent>({
    heroTitle: DEFAULT_HERO_TITLE,
    heroSubtitle: DEFAULT_HERO_SUBTITLE,
    featuredSectionTitle: "Productos destacados",
    newArrivalsSectionTitle: "Novedades",
    saleSectionTitle: "En descuento ahora",
    categorySectionLabel: "DESCUBRE",
    categorySectionTitle: "Colecciones para ti",
    featuredSectionLabel: "Lo más buscado",
    newArrivalsLabel: "Recién llegados",
    saleSectionLabel: "Oferta especial",
    categorySectionImage: "",
    featuredSectionImage: "",
    newArrivalsSectionImage: "",

    saleSectionImage: "",
    featuredSectionSubtitle: "Los productos más buscados por nuestros clientes.",
    featuredSectionDiscount: "",
    newArrivalsSectionSubtitle: "Novedades directamente desde las marcas.",
    newArrivalsSectionDiscount: "",
    saleSectionSubtitle: "Promociones y descuentos por tiempo limitado.",
    saleSectionDiscount: "",
  });
  const [homeContentSaving, setHomeContentSaving] = useState(false);

  const saveHomeContent = async () => {
    setHomeContentSaving(true);
    try {
      await updateHomeContentApi(homeContent as unknown as Record<string, unknown>);
      toast.success('Contenido de la home guardado.');
    } catch (error) {
      console.error('Error guardando contenido de la home:', error);
      toast.error('No se pudo guardar el contenido. Intenta nuevamente.');
    } finally {
      setHomeContentSaving(false);
    }
  };

  const [homePreviewProducts, setHomePreviewProducts] = useState<Product[]>([]);
  const [homeSaleProducts, setHomeSaleProducts] = useState<Product[]>([]);
  const [homeNewArrivals, setHomeNewArrivals] = useState<Product[]>([]);

  useEffect(() => {
    setHomePreviewProducts(products.slice(0, 9));
    setHomeSaleProducts(products.filter((p) => p.discount).slice(0, 9));
    setHomeNewArrivals(products.filter((p) => p.isNew).slice(0, 9));
  }, [products]);

  useEffect(() => {
    const handlePopState = () => {
      const nextView = getInitialView();
      setView(nextView);
      setInitialAdminSection(getInitialAdminSection());
      if (nextView === "product") {
        const productKey = new URLSearchParams(window.location.search).get("product");
        const matchedProduct = products.find((product) => product.id === productKey || product.slug === productKey);
        if (matchedProduct) setSelectedProduct(matchedProduct);
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [products]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(LOCAL_ADDRESS_STORAGE, JSON.stringify(addresses));
  }, [addresses]);

  const createAddress = (address: Omit<Address, "id">) => {
    const newAddress: Address = {
      ...address,
      id: crypto.randomUUID?.() ?? `addr-${Date.now()}`,
      isDefault: address.isDefault ?? true,
    };

    setAddresses((prev) => {
      const updated = prev.map((addr) => ({
        ...addr,
        isDefault: newAddress.isDefault ? false : addr.isDefault,
      }));
      return [...updated, newAddress];
    });
    setSelectedAddressId(newAddress.id);
  };

  const updateAddress = (addressId: string, updates: Partial<Address>) => {
    setAddresses((prev) => prev.map((addr) => {
      if (addr.id !== addressId) {
        return updates.isDefault ? { ...addr, isDefault: false } : addr;
      }
      return { ...addr, ...updates };
    }));
    if (updates.isDefault) setSelectedAddressId(addressId);
  };

  const deleteAddress = (addressId: string) => {
    setAddresses((prev) => {
      const next = prev.filter((addr) => addr.id !== addressId);
      if (selectedAddressId === addressId) {
        setSelectedAddressId(next[0]?.id ?? "");
      }
      return next;
    });
  };

  useEffect(() => {
    let subscription: { unsubscribe: () => void } | null = null;
    let profileRequest = 0;

    const syncProfileAccess = async (user: User | null) => {
      const requestId = ++profileRequest;
      try {
        const access = await getProfileAccess(user);
        if (requestId !== profileRequest) return;
        setIsAdmin(access.isAdmin);
        setProfileRole(access.role);
        setProfileAccessError(Boolean(user) && (access.status === "missing" || access.status === "inactive"));
      } catch {
        if (requestId !== profileRequest) return;
        console.warn("No se pudo verificar el acceso del perfil.", { reason: "verification_failed" });
        setIsAdmin(false);
        setProfileRole(null);
        setProfileAccessError(Boolean(user));
      } finally {
        if (requestId === profileRequest) setAuthReady(true);
      }
    };

    const syncSession = async () => {
      try {
        const user = await getCurrentUser();
        setAuthUser(user);
        setIsLoggedIn(Boolean(user));
        await syncProfileAccess(user);
      } catch (error) {
        console.warn("No se pudo cargar la sesión de usuario.", error);
        setIsAdmin(false);
        setProfileRole(null);
      } finally {
        setAuthReady(true);
      }
    };

    void syncSession();
    subscription = onAuthStateChange((_event, session) => {
      const user = session?.user ?? null;
      setAuthUser(user);
      setIsLoggedIn(Boolean(user));
      queueMicrotask(() => void syncProfileAccess(user));
    });

    return () => {
      profileRequest += 1;
      subscription?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!authReady) return;
    if (!isAdmin && view === "admin") {
      logAuthDiagnostic("route-guard.redirect", { userId: authUser?.id, email: authUser?.email, sessionPresent: Boolean(authUser), isAdmin: false, redirectTo: "admin-login" });
      navigate("admin-login");
      return;
    }
    if (isAdmin && view === "admin-login") {
      logAuthDiagnostic("route-guard.redirect", { userId: authUser?.id, email: authUser?.email, sessionPresent: Boolean(authUser), isAdmin: true, redirectTo: "admin" });
      navigate("admin");
      return;
    }
    if (!isAdmin && view === "account") {
      // allow account for normal users only
      return;
    }
  }, [view, isAdmin, authReady]);

  useEffect(() => {
    if (!authReady || !isAdmin || view !== "admin") return;

    let isActive = true;
    setAdminProducts([]);
    setAdminProductsError(null);
    setAdminProductsStatus("loading");
    logAuthDiagnostic("admin-data.started", { userId: authUser?.id, email: authUser?.email, sessionPresent: Boolean(authUser), isAdmin: true, redirectTo: "admin" });

    void adminApi.fetchProducts().then((records) => {
      if (!Array.isArray(records)) throw new Error("La API administrativa devolvió una respuesta inválida.");
      if (!isActive) return;
      logAuthDiagnostic("admin-data.succeeded", { userId: authUser?.id, email: authUser?.email, sessionPresent: true, isAdmin: true, itemCount: records.length });
      setAdminProducts(records.map((record: ProductRecord) => mapProductRecordToAppProduct(record, categoryOptions)));
      setAdminProductsStatus("ready");
    }).catch((error: unknown) => {
      if (!isActive) return;
      const details = error && typeof error === "object" ? error as { status?: unknown; code?: unknown } : {};
      logAuthDiagnostic("admin-data.failed", {
        userId: authUser?.id,
        email: authUser?.email,
        sessionPresent: true,
        isAdmin: true,
        httpStatus: typeof details.status === "number" ? details.status : null,
        code: typeof details.code === "string" ? details.code : null,
        message: error instanceof Error ? error.message : null,
      });
      const message = isAdminAuthenticationError(error)
        ? "Sesión administrativa requerida"
        : error instanceof AdminApiError && error.status === 403
          ? "No tienes permisos para consultar los productos."
          : error instanceof AdminApiError && error.status === 404
            ? "No se encontró el endpoint de productos. Verifica la URL base de la API."
          : "No fue posible cargar los productos. Intenta nuevamente.";
      setAdminProducts([]);
      setAdminProductsError(message);
      setAdminProductsStatus("error");
      toast.error(message);
    });

    return () => {
      isActive = false;
    };
  }, [authReady, isAdmin, view, productRefresh, categoryOptions]);

  const handleAuthSuccess = (user: User | null, adminStatus: boolean, role: string | null) => {
    setAuthUser(user);
    setIsLoggedIn(Boolean(user) || adminStatus);
    setIsAdmin(adminStatus);
    setProfileRole(role);
    setProfileAccessError(false);
  };

  const handleLogout = async () => {
    const hasSupabase = Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);
    if (hasSupabase) {
      try {
        await signOut();
      } catch (error) {
        console.warn("Error al cerrar sesión.", error);
      }
    }

    setAuthUser(null);
    setIsLoggedIn(false);
    setIsAdmin(false);
    setProfileRole(null);
    setProfileAccessError(false);
    navigate("home");
  };

  const refreshProducts = () => setProductRefresh((value) => value + 1);

  const createProduct = async (product: Omit<Product, "id">) => {
    const record = mapAppProductToProductRecord({ ...product, id: crypto.randomUUID() });
    const adminPayload = buildAdminProductPayload({
      ...product,
      id: record.id,
      slug: record.slug ?? undefined,
      categoryId: record.category_id ?? product.categoryId,
      image: record.image || product.image || "",
      images: product.images ?? record.images ?? [],
      brand: product.brand ?? record.brand ?? "",
      sku: product.sku ?? record.sku ?? "",
      price: Number(product.price ?? record.price ?? 0),
      stock: Number(product.stock ?? record.stock ?? 0),
      description: product.description ?? record.description ?? "",
      originalPrice: product.originalPrice ?? record.original_price ?? undefined,
    }, true);

    if (!adminPayload.category_id || typeof adminPayload.category_id !== 'string' || !/^[0-9a-fA-F-]{36}$/.test(String(adminPayload.category_id))) {
      throw new Error('Selecciona una categoría válida.');
    }

    const created = await createProductViaAdminApi(adminPayload);
    if (!created || typeof created.id !== 'string' || !created.id) {
      throw new Error('La API no confirmó el ID del producto creado.');
    }
    const createdAppProduct = mapProductRecordToAppProduct(created);
    refreshProducts();
    toast.success("Producto creado y guardado correctamente.");
    try { recordAction('create_product', { id: createdAppProduct.id, name: createdAppProduct.name }); } catch (e) { }
  };

  const updateProduct = async (productId: string, updates: Partial<Product>) => {
    const productToUpdate = adminProducts.find((product) => product.id === productId);
    if (!productToUpdate) {
      throw new Error('Producto no encontrado');
    }

    const record = mapAppProductToProductRecord({ ...productToUpdate, ...updates, id: productId });
    const adminUpdates = buildAdminProductPayload({
      ...productToUpdate,
      ...updates,
      id: productId,
      slug: record.slug ?? undefined,
      brand: updates.brand ?? productToUpdate.brand ?? record.brand ?? "",
      categoryId: record.category_id ?? updates.categoryId ?? productToUpdate.categoryId,
      image: updates.image ?? productToUpdate.image ?? record.image ?? "",
      images: updates.images ?? productToUpdate.images ?? record.images ?? [],
      price: Number(updates.price ?? productToUpdate.price ?? record.price ?? 0),
      stock: Number(updates.stock ?? productToUpdate.stock ?? record.stock ?? 0),
      originalPrice: updates.originalPrice ?? productToUpdate.originalPrice ?? record.original_price ?? undefined,
      description: updates.description ?? productToUpdate.description ?? record.description ?? "",
      sku: updates.sku ?? productToUpdate.sku ?? record.sku ?? "",
    });

    const updated = await updateProductViaAdminApi(productId, adminUpdates);
    const updatedAppProduct = mapProductRecordToAppProduct(updated);
    refreshProducts();
    toast.success("Producto actualizado correctamente.");
    try { recordAction('update_product', { id: updatedAppProduct.id, name: updatedAppProduct.name }); } catch (e) { }
  };

  const setProductActive = async (productId: string, isActive: boolean) => {
    const updated = await adminApi.updateProductAvailabilityApi(productId, isActive) as ProductRecord;
    if (updated?.is_active !== isActive) {
      throw new Error('La API no confirmó el cambio de estado del producto.');
    }

    const updatedProduct = mapProductRecordToAppProduct(updated, categoryOptions);
    setAdminProducts((current) => current.map((product) => product.id === productId ? updatedProduct : product));
    try { recordAction(isActive ? 'activate_product' : 'deactivate_product', { id: productId }); } catch (error) { }
  };

  const archiveProduct = async (productId: string): Promise<ProductArchiveResult> => {
    const result = await adminApi.archiveProductApi(productId);
    if (!result.archived || result.is_active !== false) {
      throw new Error('La API no confirmó el archivado del producto.');
    }
    setAdminProducts((current) => current.map((product) => product.id === productId ? { ...product, isActive: false } : product));
    try { recordAction('archive_product', { id: productId }); } catch (error) { }
    return result;
  };

  const adjustStock = async (productId: string, movementType: 'in' | 'out' | 'correction', quantity: number, reason: string) => {
    const normalizedReason = reason.trim();
    if (!normalizedReason) {
      throw new Error('Debes indicar el motivo del ajuste.');
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error('La cantidad debe ser mayor que cero.');
    }
    const result = await adminApi.adjustProductStock({ productId, movementType, quantity, reason: normalizedReason });
    setAdminProducts((current) => current.map((product) => product.id === productId ? { ...product, stock: result.new_stock, updatedAt: new Date().toISOString() } : product));
    refreshProducts();
    try { recordAction('inventory_movement', { id: productId, movementType, quantity, newStock: result.new_stock }); } catch (e) { }
    return;
  };

  const navigate = (v: View, product?: Product) => {
    try {
      setView(v);

      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        const routePaths: Record<View, string> = {
          home: "/",
          catalog: "/",
          product: "/",
          checkout: "/",
          login: "/login",
          register: "/register",
          "password-reset": "/reset-password",
          account: "/",
          "admin-login": "/admin/login",
          admin: "/admin",
          privacy: "/privacidad",
          terms: "/terminos",
          shipping: "/envios",
          returns: "/cambios-y-devoluciones",
          contact: "/contacto",
        };
        url.pathname = routePaths[v];
        if (v === "catalog") {
          url.searchParams.delete("product");
          url.searchParams.set("view", "catalog");
        } else if (v === "product") {
          const selected = product ?? selectedProduct;
          if (selected) url.searchParams.set("product", selected.slug ?? selected.id);
          else url.searchParams.delete("product");
        } else {
          url.searchParams.delete("view");
          url.searchParams.delete("product");
        }
        if (v !== "admin") url.searchParams.delete("adminSection");
        window.history.pushState({}, "", `${url.pathname}${url.search}${url.hash}`);
      }

      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('navigate failed', err, v);
    }
  };

  useEffect(() => {
    const handleAdminSessionRequired = () => {
      setAuthUser(null);
      setIsLoggedIn(false);
      setIsAdmin(false);
      setProfileRole(null);
      navigate("admin-login");
    };

    window.addEventListener('admin-session-required', handleAdminSessionRequired);
    return () => window.removeEventListener('admin-session-required', handleAdminSessionRequired);
  }, [navigate]);

  const handleSelectProduct = (p: Product) => {
    setSelectedProduct(p);
    navigate("product", p);
  };

  const handleCategorySelect = (cat: Category | null) => {
    setFilterCategory(cat);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (cat) url.searchParams.set("category", cat);
      else url.searchParams.delete("category");
      window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    }
    navigate("catalog");
  };

  const handleAddToCart = (p: Product, size: string, color: string) => {
    const existingItem = cart.find((item) => item.product.id === p.id && item.selectedSize === size && item.selectedColor === color);
    if (p.stock <= 0 || (existingItem && existingItem.qty >= p.stock)) {
      toast.error("No hay disponibilidad suficiente en el catálogo actual.");
      return;
    }

    setCart((prev) => {
      const existing = prev.find((i) => i.product.id === p.id && i.selectedSize === size && i.selectedColor === color);
      if (existing) {
        return prev.map((i) =>
          i.product.id === p.id && i.selectedSize === size && i.selectedColor === color ? { ...i, product: p, qty: i.qty + 1 } : i
        );
      }
      return [...prev, { product: p, qty: 1, selectedSize: size, selectedColor: color }];
    });
    setCartOpen(true);
  };

  const handleUpdateCart = (id: string, size: string, color: string, qty: number) => {
    if (qty <= 0) handleRemoveFromCart(id, size, color);
    else {
      const item = cart.find((entry) => entry.product.id === id && entry.selectedSize === size && entry.selectedColor === color);
      if (!item || qty > item.product.stock) {
        toast.error("La cantidad supera el stock mostrado en el catálogo.");
        return;
      }
      setCart((prev) => prev.map((entry) =>
        entry.product.id === id && entry.selectedSize === size && entry.selectedColor === color
          ? { ...entry, qty }
          : entry
      ));
    }
  };

  const handleRemoveFromCart = (id: string, size: string, color: string) => {
    setCart((prev) => prev.filter((i) => !(i.product.id === id && i.selectedSize === size && i.selectedColor === color)));
  };

  const handleCheckout = () => {
    setCartOpen(false);
    if (!isLoggedIn) { navigate("login"); return; }
    navigate("checkout");
  };
  const handleRemoveUnavailableCartItem = (index: number) => {
    setUnavailableCartItems((previous) => previous.filter((_, entryIndex) => entryIndex !== index));
  };
  const cartRestoreStatus: ProductsStatus = productsStatus !== "ready"
    ? productsStatus
    : cartRestoreComplete ? "ready" : "loading";

  if (profileAccessError) {
    return (
      <div className="min-h-screen bg-[#f4f5f7] px-4 text-slate-900">
        <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-5 text-center">
          <p role="alert" aria-live="polite" className="text-base font-medium">
            No fue posible verificar los permisos de tu cuenta. Inténtalo de nuevo más tarde.
          </p>
          <button
            type="button"
            className="min-h-11 rounded-md bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-700"
            onClick={() => {
              setProfileAccessError(false);
              navigate("login");
            }}
          >
            Volver al inicio de sesión
          </button>
        </main>
        <Toaster />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f4f5f7] text-slate-900">
      {view !== "admin" && (
        <>
          <Navbar
            cart={cart} onNavigate={navigate}
            onCartOpen={() => setCartOpen(true)}
            isLoggedIn={isLoggedIn}
            isAdmin={isAdmin}
            profileRole={profileRole}
            authUser={authUser}
            currentView={view}
            products={products}
            categories={categoryOptions}
            onLoginClick={() => navigate("login")}
            onLogout={handleLogout}
            onCategorySelect={handleCategorySelect}
            onSelectProduct={handleSelectProduct}
          />
          <Toaster />
        </>
      )}
      {view === "home" && (
        <div style={bannerMarginStyle}>
          <HomePage
            onNavigate={navigate} onSelectProduct={handleSelectProduct}
            onAddToCart={handleAddToCart} onCategorySelect={handleCategorySelect}
            content={homeContent}
            products={products}
            categories={categoryOptions}
            selectedCategory={filterCategory}
            featuredProducts={homePreviewProducts}
            newArrivalsProducts={homeNewArrivals}
            saleProducts={homeSaleProducts}
            productsStatus={productsStatus}
            onRetryProducts={refreshProducts}
          />
        </div>
      )}
      {view === "catalog" && (
        <CatalogPage
          products={products}
          categories={categoryOptions}
          filterCategory={filterCategory}
          selectedBrand={catalogBrand}
          setSelectedBrand={setCatalogBrand}
          sortBy={catalogSort}
          setSortBy={setCatalogSort}
          onSelectProduct={handleSelectProduct}
          onAddToCart={handleAddToCart}
          onNavigate={navigate}
          onCategorySelect={handleCategorySelect}
          productsStatus={productsStatus}
          onRetryProducts={refreshProducts}
          headerOffset={headerOffset}
        />
      )}
      {view === "product" && selectedProduct && (
        <ProductDetailPage
          key={selectedProduct.id}
          product={selectedProduct}
          products={products}
          onBack={() => navigate("catalog")}
          onAddToCart={handleAddToCart}
          onNavigate={navigate}
          onSelectProduct={handleSelectProduct}
          headerOffset={headerOffset}
        />
      )}
      {view === "checkout" && (
        <CheckoutPage
          cart={cart}
          onNavigate={navigate}
          addresses={addresses}
          selectedAddressId={selectedAddressId}
          onSelectAddress={setSelectedAddressId}
          onCreateAddress={createAddress}
          onPaymentStarted={() => setCart([])}
        />
      )}
      {view === "login" && <LoginPage isRegister={false} onNavigate={navigate} onLogin={handleAuthSuccess} headerOffset={headerOffset} />}
      {view === "register" && <LoginPage isRegister={true} onNavigate={navigate} onLogin={handleAuthSuccess} headerOffset={headerOffset} />}
      {view === "admin-login" && <LoginPage isRegister={false} onNavigate={navigate} onLogin={handleAuthSuccess} headerOffset={headerOffset} />}
      {view === "password-reset" && <PasswordRecoveryPage onNavigate={navigate} />}
      {view === "account" && (
        <AccountPage
          onNavigate={navigate}
          onLogout={handleLogout}
          authUser={authUser}
          addresses={addresses}
          onCreateAddress={createAddress}
          onUpdateAddress={updateAddress}
          onDeleteAddress={deleteAddress}
        />
      )}
      {view === "admin" && isAdmin && (
        <AdminDashboard
          onNavigate={navigate}
          adminRole={profileRole ?? ""}
          products={adminProducts}
          productsStatus={adminProductsStatus}
          productsError={adminProductsError}
          onRetryProducts={refreshProducts}
          categories={categoryOptions}
          createProduct={createProduct}
          updateProduct={updateProduct}
          setProductActive={setProductActive}
          archiveProduct={archiveProduct}
          adjustStock={adjustStock}
          productRefresh={productRefresh}
          initialSection={initialAdminSection}
          homeContent={homeContent}
          setHomeContent={setHomeContent}
          homePreviewProducts={homePreviewProducts}
          setHomePreviewProducts={setHomePreviewProducts}
          homeSaleProducts={homeSaleProducts}
          setHomeSaleProducts={setHomeSaleProducts}
          homeNewArrivals={homeNewArrivals}
          setHomeNewArrivals={setHomeNewArrivals}
          saveHomeContent={saveHomeContent}
          homeContentSaving={homeContentSaving}
        />
      )}
      {view === "admin" && !authReady && <main role="status" className="min-h-screen pt-32 text-center text-slate-600">Verificando sesión administrativa...</main>}

      {cartOpen && (
        <CartDrawer
          cart={cart} onClose={() => setCartOpen(false)}
          onUpdate={handleUpdateCart} onRemove={handleRemoveFromCart}
          onCheckout={handleCheckout}
          unavailableCartItems={unavailableCartItems}
          onRemoveUnavailable={handleRemoveUnavailableCartItem}
          restoreStatus={cartRestoreStatus}
          onRetryCatalog={refreshProducts}
        />
      )}

      {/* Mobile bottom nav removed for web-style layout */}
    </div>
  );
}
