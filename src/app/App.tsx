import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import type { User } from '@supabase/supabase-js';
import {
  ShoppingCart, Search, X, Star, ChevronRight, Package,
  Users, TrendingUp, AlertTriangle, Check, Eye, EyeOff,
  Bell, LogOut, Plus, Minus, Trash2, MapPin, Shield,
  Truck, ChevronLeft, Heart, ArrowRight, Filter,
  BarChart2, Home, Settings, Tag, Layers, Edit,
  RefreshCw, Award, Grid3X3, ThumbsUp, DollarSign
} from "lucide-react";
import HorizontalProductCarousel from "./components/ProductCarousel";
import { STORE_CONFIG } from "./store-config";

import { subscribeToNewsletter } from "../lib/newsletter";
import { fetchPublicCategories, resolveProductCategoryName, type CategoryOption } from "../lib/category-service";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "./components/LazyRecharts";
// promoRibbon moved to src/assets/cinta-10.png
import type { ProductRecord } from "../lib/supabase-store";
import { createProductViaAdminApi, deleteProductViaAdminApi, updateProductViaAdminApi } from "../lib/admin-product-fallback";
import {
  signInWithEmail,
  signUpWithEmail,
  signOut,
  getCurrentUser,
  onAuthStateChange,
  requestPasswordRecovery,
  updatePassword,
} from "../lib/supabase-auth";
import { getMyProfile, getProfileAccess, ProfileAccessVerificationError, updateMyProfile } from "../lib/profile-service";
import { getAdminPanelMenuLink } from "./admin-panel-menu";

import adminApi, { createSupabaseProductApi, updateSupabaseProductApi, deleteSupabaseProductApi, updateHomeContentApi } from "../lib/admin-api";
import { uploadProductImage, deleteProductImage, getPublicUrl, buildProductImagePath, getStoragePathFromPublicUrl, STORAGE_BUCKET } from "../lib/supabase-store";
import { recordAction, getAudit } from "../lib/audit";
import { productSchema } from '../lib/schemas';
import { normalizeGuestCartEntries } from '../lib/cart-service';
import { validateProductForm } from '../lib/admin-product-form';
import Toaster from './components/LazyToaster';
import { toast } from '../lib/lazyToast';
import type { Address as DomainAddress, GuestCartItem, Product as DomainProduct } from '../types/domain';

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
  if (pathname === "/admin/login") return "admin-login";
  if (pathname === "/admin" || pathname.startsWith("/admin/") || new URLSearchParams(search).get("view") === "admin") return "admin";
  if (pathname === "/login") return "login";
  if (pathname === "/register") return "register";
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

const HOME_NAV_CATEGORIES = [
  { name: "Zapatos", filterCategory: "Running" },
  { name: "Ropa Hombre", filterCategory: null },
  { name: "Ropa Mujer", filterCategory: null },
  { name: "Perfumes", filterCategory: null },
  { name: "Relojes", filterCategory: null },
  { name: "Gafas", filterCategory: null },
] as const;

const HOME_COLLECTIONS = [
  { name: "Zapatos", subtitle: "Running · Training · Casual", image: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=85", filterCategory: "Running" },
  { name: "Ropa Hombre", subtitle: "Camisetas · Buzos · Pantalones", image: "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=900&q=85", filterCategory: null },
  { name: "Ropa Mujer", subtitle: "Leggings · Tops · Conjuntos", image: "https://images.unsplash.com/photo-1571019613454-1cb2f99a2d8b?auto=format&fit=crop&w=900&q=85", filterCategory: null },
  { name: "Perfumes", subtitle: "Hombre · Mujer · Unisex", image: "https://images.unsplash.com/photo-1541643600914-78b084683601?auto=format&fit=crop&w=900&q=85", filterCategory: null },
  { name: "Relojes", subtitle: "Smartwatch · Deportivo · Casual", image: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=900&q=85", filterCategory: null },
  { name: "Gafas", subtitle: "Running · Ciclismo · Outdoor", image: "https://images.unsplash.com/photo-1577803645773-f96470509666?auto=format&fit=crop&w=900&q=85", filterCategory: null },
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

const mapProductRecordToAppProduct = (record: ProductRecord, categories: readonly CategoryOption[] = []): Product => ({
  id: record.id,
  name: record.name,
  brand: record.brand,
  price: record.price,
  originalPrice: record.original_price ?? undefined,
  discount: record.discount ?? undefined,
  rating: record.rating ?? 0,
  reviews: record.reviews ?? 0,
  image: record.image,
  images: record.images ?? [],
  category: resolveProductCategoryName(record.category_id, record.category, categories),
  categoryId: record.category_id ?? undefined,
  subcategory: record.subcategory ?? "",
  stock: record.stock ?? 0,
  sku: record.sku ?? record.id,
  description: record.description ?? "Producto cargado desde Supabase",
  colors: record.colors ?? [],
  sizes: record.sizes ?? [],
  gender: record.gender as Product["gender"],
  isNew: record.is_new ?? false,
  isFeatured: record.is_featured ?? false,
  specs: record.specs ?? [],
});

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
  gender: (product.gender ?? "Unisex") as string,
  is_new: product.isNew ?? false,
  is_featured: product.isFeatured ?? false,
  specs: product.specs ?? [],
});

// ─── DATA ────────────────────────────────────────────────────────────────────


const SALES_DATA: { day: string; ventas: number; pedidos: number }[] = [];
const CAT_DATA: { name: string; valor: number }[] = [];

interface OrderSummary {
  id: string;
  customer: string;
  date: string;
  status: string;
  total: number;
  items: number;
}

const ORDERS: OrderSummary[] = [];

// ─── UTILS ───────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  "$" + n.toLocaleString("es-CO");

const STATUS_STYLE: Record<string, string> = {
  "Enviado":     "bg-blue-50 text-blue-700 border border-blue-200",
  "Procesando":  "bg-amber-50 text-amber-700 border border-amber-200",
  "Entregado":   "bg-emerald-50 text-emerald-700 border border-emerald-200",
  "Cancelado":   "bg-red-50 text-red-700 border border-red-200",
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
    primary: "bg-[#2457D6] text-white hover:bg-[#1d48b9] active:scale-[0.98] shadow-sm shadow-blue-300/40",
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
            selected === color.name ? "border-[#1d4ed8] scale-110" : "border-transparent hover:scale-105"
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
  if (!sizes.length || sizes[0] === "Talla única") {
    return <span className="text-sm text-slate-500">Talla única</span>;
  }
  return (
    <div className="flex flex-wrap gap-2">
      {sizes.map((size) => (
        <button
          key={size} onClick={() => onSelect(size)}
          className={`min-w-[44px] px-3 py-1.5 rounded-lg text-sm font-semibold border-2 transition-all ${
            selected === size
              ? "border-[#1d4ed8] bg-[#1d4ed8] text-white"
              : "border-slate-200 text-slate-600 hover:border-[#1d4ed8] hover:text-[#1d4ed8]"
          }`}
        >
          {size}
        </button>
      ))}
    </div>
  );
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
  const defaultSize = product.sizes[0] === "Talla única" ? "Talla única" : product.sizes[2] ?? product.sizes[0];
  const defaultColor = product.colors[0]?.name ?? "";
  const savings = product.originalPrice ? product.originalPrice - product.price : 0;

  return (
        <article className="group relative w-full max-w-full h-full bg-white rounded-[20px] sm:rounded-[30px] overflow-hidden border border-slate-200/80 shadow-[0_15px_40px_-28px_rgba(15,23,42,0.35)] hover:-translate-y-1 hover:shadow-[0_20px_60px_-30px_rgba(15,23,42,0.45)] transition-all duration-300 flex flex-col">
      {/* Image */}
      <div className="relative w-full aspect-[4/3] bg-slate-100 overflow-hidden">
        <img src={product.image} alt={product.name} onError={(event) => { event.currentTarget.style.display = "none"; }}
          className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-500"
        />
        {/* Badges */}
        <div className="absolute top-3 left-3 flex flex-col gap-1.5">
          {product.discount && <Badge variant="sale">-{product.discount}%</Badge>}
          {product.isNew && !product.discount && <Badge variant="new">Nuevo</Badge>}
          {product.stock <= 10 && <Badge variant="low">Pocas</Badge>}
        </div>
        {/* Wishlist */}
        <button
          type="button"
          aria-label={wished ? `Quitar ${product.name} de favoritos` : `Agregar ${product.name} a favoritos`}
          aria-pressed={wished}
          onClick={() => setWished((value) => !value)}
          className="absolute top-3 right-3 w-11 h-11 rounded-full bg-white/95 backdrop-blur flex items-center justify-center shadow-md hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1d4ed8] transition-colors"
        >
          <Heart size={15} className={wished ? "fill-red-500 text-red-500" : "text-slate-400"} />
        </button>
      </div>

      {/* Info */}
      <div className="p-4 sm:p-5 space-y-3 sm:space-y-4 flex flex-col flex-1">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-[#1d4ed8] mb-2">{product.brand}</p>
          <h3 className="font-display text-[22px] sm:text-2xl text-slate-900 line-clamp-2 leading-[1.05]">
            <button type="button" onClick={() => onSelect(product)} className="font-display text-left hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1d4ed8]">{product.name}</button>
          </h3>
          <p className="text-sm text-slate-500 mt-1">{product.subcategory}{product.gender ? ` · ${product.gender}` : ""}</p>
        </div>
        {product.reviews > 0 && product.rating > 0 && <StarRating rating={product.rating} reviews={product.reviews} />}

        {product.colors.length > 0 && (
          <div className="flex gap-2">
            {product.colors.slice(0, 4).map((c) => (
              <div key={c.name} className="w-4 h-4 rounded-full border border-slate-200" style={{ backgroundColor: c.hex }} title={c.name} />
            ))}
            {product.colors.length > 4 && <span className="text-xs text-slate-400">+{product.colors.length - 4}</span>}
          </div>
        )}

        <div className="flex items-baseline gap-3">
          <span className="price text-lg text-slate-900">{fmt(product.price)}</span>
          {product.originalPrice && (
            <span className="price text-xs text-slate-400 line-through">{fmt(product.originalPrice)}</span>
          )}
        </div>
        {savings > 0 && <p className="price text-xs text-emerald-600 -mt-1">Ahorras {fmt(savings)}</p>}

        <button
          type="button"
          disabled={product.stock <= 0}
          onClick={() => onAddToCart(product, defaultSize, defaultColor)}
          className="mt-auto w-full min-h-11 py-3 rounded-full text-sm font-bold bg-black text-white hover:bg-slate-900 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600 transition-all duration-200 flex items-center justify-center gap-2 shadow-sm shadow-slate-200"
        >
          {product.stock <= 0 ? "Agotado" : <><ShoppingCart size={14} /> Agregar al carrito</>}
        </button>
      </div>
    </article>
  );
}

// ─── NAVBAR ──────────────────────────────────────────────────────────────────

function TopBenefitsBar() {
  const benefits = [
    "10% de descuento en tu primera compra",
    "Envío gratis a toda Colombia a partir de $300.000",
    "Soporte en línea 24/7",
    "Compra segura y pagos protegidos",
    "Productos seleccionados para tu estilo",
  ];

  const [currentIndex, setCurrentIndex] = useState(0);
  const [previousIndex, setPreviousIndex] = useState<number | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [isPageVisible, setIsPageVisible] = useState(() => document.visibilityState === "visible");

  useEffect(() => {
    const handleVisibilityChange = () => setIsPageVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  useEffect(() => {
    if (isPaused || !isPageVisible) return;

    const timer = window.setTimeout(() => {
      setPreviousIndex(currentIndex);
      setCurrentIndex((index) => (index + 1) % benefits.length);
    }, 4000);

    return () => window.clearTimeout(timer);
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
          font-family: 'Roboto', sans-serif;
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
            transform: translateY(100%);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }

        @keyframes benefit-exit {
          from {
            transform: translateY(0);
            opacity: 1;
          }
          to {
            transform: translateY(-100%);
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
      <div className="fixed top-0 left-0 right-0 z-50">
        <TopBenefitsBar />

        {/* Main Navbar */}
        <nav className="bg-white border-b border-slate-100 shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-2 sm:gap-4">
            {/* Logo */}
            <button onClick={() => onNavigate("home")} className="flex items-center shrink-0">
              <span className="brand-lockup">
                <span className="brand-wordmark">
                  <span className="brand-urban">Urban</span><span className="brand-sport">Sport</span>
                </span>
                <span className="brand-sub">Store</span>
              </span>
            </button>

            {/* Search */}
            {/* Desktop search */}
            <div className="flex-1 max-w-xl hidden sm:flex relative">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={searchVal} onChange={(e) => setSearchVal(e.target.value)}
                placeholder="Buscar zapatillas, ropa, relojes..."
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:border-[#1d4ed8]/50 focus:bg-white transition-all"
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

            {/* Actions */}
            <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
              <button
                type="button"
                aria-label={`Abrir carrito, ${cartCount} artículos`}
                onClick={onCartOpen}
                className="relative w-10 h-10 rounded-xl flex items-center justify-center text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
              >
                <ShoppingCart size={19} />
                {cartCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-4.5 h-4.5 w-5 h-5 rounded-full bg-[#f97316] text-white text-[10px] font-bold flex items-center justify-center">
                    {cartCount}
                  </span>
                )}
              </button>

              <div className="relative">
                <button
                    type="button"
                    onClick={() => setUserOpen(!userOpen)}
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
                  >
                  {isLoggedIn
                    ? <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#1d4ed8] to-[#f97316] flex items-center justify-center text-xs font-bold text-white">V</div>
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
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-10 pr-4 text-sm text-slate-700 placeholder-slate-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#1d4ed8]"
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
        </nav>
      </div>

      {(currentView === "home" || currentView === "catalog") && (
        <div className="w-full bg-transparent pt-[9.75rem] sm:pt-[6.75rem]">
          <div className="category-navigation-scroll overflow-x-auto border-b border-slate-100 bg-white overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <nav aria-label="Categorías de productos" className="mx-auto flex min-h-11 max-w-7xl items-center justify-start gap-1 px-4 sm:min-h-14 sm:px-6 md:justify-center">
              {availableCategories.map((category) => (
                <button key={category.name} type="button" onClick={() => onCategorySelect(category.filterCategory)} className="min-h-10 flex shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-slate-600 transition-colors hover:bg-blue-50 hover:text-[#1d4ed8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1d4ed8] sm:px-4 whitespace-nowrap">
                  {category.name}
                </button>
              ))}
            </nav>
          </div>
        </div>
      )}
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
            <ShoppingCart size={18} className="text-[#1d4ed8]" />
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
                  <p className="text-[11px] font-bold text-[#1d4ed8] uppercase">{item.product.brand}</p>
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
    return <div className="grid grid-cols-1 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5">{children}</div>;
  }

  function ProductStatusNotice({ status, onRetry, onCategorySelect }: { status: ProductsStatus; onRetry: () => void; onCategorySelect?: (category: Category | null) => void; }) {
    if (status === "loading") {
      return (
        <div role="status" aria-busy="true" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 sm:gap-4">
          <span className="sr-only">Cargando productos</span>
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="aspect-[4/5] animate-pulse rounded-2xl bg-slate-200" />
          ))}
        </div>
      );
    }

    if (status === "error") {
      return (
        <div role="alert" className="flex flex-col items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-950 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <p className="text-sm">No pudimos cargar el catálogo. Intenta de nuevo en unos momentos.</p>
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

  function HomePage({ onNavigate, onSelectProduct, onAddToCart, onCategorySelect, content, products, categories, featuredProducts, newArrivalsProducts, saleProducts, productsStatus, onRetryProducts }: {
  onNavigate: (v: View) => void; onSelectProduct: (p: Product) => void;
  onAddToCart: (p: Product, size: string, color: string) => void;
  onCategorySelect: (c: Category | null) => void;
  content: HomePageContent;
  products: Product[];
  categories: CategoryOption[];
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
  const newsletterAvailable = !import.meta.env.DEV || Boolean(import.meta.env.VITE_API_URL?.trim());
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
    <main>
      <section className="relative flex min-h-[430px] items-center justify-center overflow-hidden bg-[#0b1220] sm:min-h-[480px] md:min-h-[520px]">
        <img
          src="https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?w=1600&h=900&fit=crop&auto=format"
          alt="Atleta entrenando al aire libre"
          loading="eager"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover object-center"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0b1220]/95 via-[#0b1220]/80 to-[#0b1220]/45 md:from-[#0b1220]/95 md:via-[#0b1220]/80 md:to-[#0b1220]/50" />

        <div className="relative z-10 mx-auto w-full max-w-7xl px-3 py-6 sm:px-4 sm:py-8 md:px-6 md:py-10">
          <div className="max-w-2xl">
            <span className="mb-4 inline-flex items-center rounded-full border border-white/30 bg-white/10 px-3 py-1.5 text-[10px] font-bold uppercase text-white backdrop-blur-sm sm:text-xs">
              COLECCIÓN 2026
            </span>
            <h1 className="mb-3 max-w-xl font-display text-[2.6rem] leading-[0.98] text-white sm:text-[3.4rem] md:text-[4.1rem] lg:text-[4.6rem]">
              VISTE TU ESTILO. MARCA LA DIFERENCIA.
            </h1>
            <p className="mb-6 max-w-lg text-base leading-relaxed text-slate-200 sm:text-lg md:text-xl">
              Explora calzado, ropa deportiva y accesorios para completar tu estilo.
            </p>
            <div className="flex w-full flex-col gap-3 min-[480px]:w-auto min-[480px]:flex-row">
              <Btn
                type="button"
                variant="primary"
                size="lg"
                onClick={() => onNavigate("catalog")}
                className="w-full justify-center !bg-[#2457D6] !text-white hover:!bg-[#1d48b9] min-[480px]:w-auto"
              >
                Comprar ahora <ArrowRight size={16} />
              </Btn>
              <Btn
                type="button"
                variant="secondary"
                size="lg"
                onClick={() => onNavigate("catalog")}
                className="w-full justify-center !border-white/35 !bg-slate-950/35 !text-white hover:!bg-slate-900/70 min-[480px]:w-auto"
              >
                Ver novedades
              </Btn>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-3 pb-2 pt-8 sm:px-4 sm:pt-10 md:px-6 md:pt-12">
        <div className="mb-6 sm:mb-8">
          <p className="mb-1 font-display text-sm uppercase tracking-[0.08em] text-[#2457D6] sm:text-base">{content.categorySectionLabel}</p>
          <h2 className="font-display text-[1.8rem] uppercase leading-[1.05] text-[#0b1220] sm:text-[2.4rem] md:text-[2.8rem]">{content.categorySectionTitle}</h2>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
          {homeCategories.map((cat) => (
            <button
              key={cat.name}
              type="button"
              aria-label={`${cat.name}: ${cat.subtitle}`}
              onClick={() => onCategorySelect(cat.filterCategory)}
              className="group relative aspect-[1.12] min-h-[150px] overflow-hidden rounded-2xl border border-slate-200 bg-slate-800 text-left shadow-[0_12px_30px_-18px_rgba(15,23,42,0.38)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-18px_rgba(15,23,42,0.4)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1d4ed8] active:scale-[0.99]"
            >
              <img
                src={cat.image}
                alt={cat.name}
                loading="lazy"
                decoding="async"
                onError={(event) => { event.currentTarget.style.display = "none"; }}
                className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0b1220]/85 via-[#0b1220]/25 to-transparent" />
              <div className="relative flex h-full min-h-[150px] flex-col justify-end p-3 sm:min-h-[190px] sm:p-4">
                <p className="font-display text-xl leading-[1.05] text-white sm:text-2xl">{cat.name}</p>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-200 sm:text-xs">{cat.subtitle}</p>
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-3 py-8 sm:px-4 sm:py-12 md:px-6 md:py-16">
        <div className="mb-6 flex items-end justify-between gap-4 sm:mb-8">
          <div>
            <p className="mb-1 font-display text-sm uppercase tracking-[0.08em] text-[#1d4ed8] sm:text-base">{content.featuredSectionLabel}</p>
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
                <button key={category.name} type="button" onClick={() => onCategorySelect(category.name)} className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 font-semibold text-slate-700 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1d4ed8]">
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

      <section className="mx-auto max-w-7xl px-3 sm:px-4 md:px-6" aria-label="Ofertas destacadas o promoción general">
        {hasRealDiscounts ? (
          <>
            <div className="mb-6 flex items-end justify-between gap-4">
              <div>
                <p className="mb-1 font-display text-sm uppercase tracking-[0.08em] text-[#c2410c] sm:text-base">OFERTAS DESTACADAS</p>
                <h2 className="font-display text-[1.8rem] leading-[1.05] text-[#0b1220] sm:text-[2.4rem] md:text-[2.8rem]">Productos con descuento real</h2>
              </div>
            </div>
            <ProductGrid>
              {onSale.slice(0, 4).map((product) => (
                <div key={product.id} className="min-w-0">
                  <ProductCard product={product} onSelect={onSelectProduct} onAddToCart={onAddToCart} />
                </div>
              ))}
            </ProductGrid>
          </>
        ) : (
          <div role="status" className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-700">
            No hay promociones verificables publicadas.
          </div>
        )}
      </section>

      <section className="py-8 sm:py-12 md:py-16">
        <div className="mx-auto max-w-7xl px-3 sm:px-4 md:px-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[{title:"Información del catálogo", copy:STORE_CONFIG.trustCopy.productInfo},{title:"Envíos por confirmar", copy:STORE_CONFIG.trustCopy.shipping},{title:"Cambios por confirmar", copy:"Las condiciones comerciales todavía no están configuradas."}].map((item) => (
              <div key={item.title} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_12px_30px_-18px_rgba(15,23,42,0.3)]">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-[#1d4ed8]">
                  <Shield size={18} />
                </div>
                <h3 className="mb-2 text-lg font-bold text-slate-900">{item.title}</h3>
                <p className="text-sm leading-relaxed text-slate-600">{item.copy}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {newArrivals.length > 0 && (
        <section className="mx-auto max-w-7xl px-3 py-2 sm:px-4 md:px-6">
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
              <div key={p.id + '-' + idx} className="w-[84vw] max-w-[280px] shrink-0 sm:w-[16rem] lg:w-[18rem]">
                <ProductCard product={p} onSelect={onSelectProduct} onAddToCart={onAddToCart} />
              </div>
            ))}
          </ProductCarousel>
          <Btn variant="ghost" onClick={() => onNavigate("catalog")} className="mt-6 w-full sm:hidden">
            Ver catálogo <ChevronRight size={14} />
          </Btn>
        </section>
      )}

      <section className="bg-[#0b1220] py-5 sm:py-6 md:py-7">
        <div className="mx-auto max-w-xl px-3 text-center sm:px-4">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-blue-200 sm:text-xs">Mantente al día</p>
          <h2 className="font-display text-2xl leading-[1.05] text-white sm:text-3xl">Recibe ofertas exclusivas</h2>
          <p className="mt-2 text-xs text-blue-200 sm:text-sm">Suscríbete para recibir novedades y promociones disponibles.</p>
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
              className="flex-1 rounded-xl bg-white px-4 py-3 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 disabled:cursor-not-allowed disabled:bg-slate-200"
            />
            <button
              type="submit"
              disabled={newsletterLoading || !newsletterAvailable || !newsletterConsent}
              className="w-full whitespace-nowrap rounded-xl bg-[#00e676] px-5 py-3 text-sm font-bold text-slate-950 transition-colors hover:bg-[#00c853] disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto"
            >
              {newsletterLoading ? "Enviando…" : "Recibir mi descuento"}
            </button>
          </form>
          <label className="mx-auto mt-3 flex max-w-sm items-start gap-2 text-left text-xs text-blue-100">
            <input
              type="checkbox"
              checked={newsletterConsent}
              onChange={(event) => setNewsletterConsent(event.target.checked)}
              className="mt-0.5 accent-emerald-500"
              aria-label="Acepto la Política de Privacidad"
            />
            <span>
              Al suscribirte aceptas nuestra <a href={privacyPolicyUrl} className="font-bold underline underline-offset-2">Política de Privacidad</a>.
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
                      <button type="button" onClick={() => { onCategorySelect(category.name); onNavigate("catalog"); }} className="min-h-10 w-full text-left text-xs text-slate-400 transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
                        {category.name}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="mb-3 text-xs font-bold uppercase tracking-widest text-white">Ayuda</p>
                <ul className="space-y-2">
                  <li><button type="button" onClick={() => onNavigate("shipping")} className="min-h-10 w-full text-left text-xs text-slate-400 transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">Envíos</button></li>
                  <li><button type="button" onClick={() => onNavigate("returns")} className="min-h-10 w-full text-left text-xs text-slate-400 transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">Cambios y devoluciones</button></li>
                  <li><button type="button" onClick={() => onNavigate("privacy")} className="min-h-10 w-full text-left text-xs text-slate-400 transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">Política de privacidad</button></li>
                  <li><button type="button" onClick={() => onNavigate("terms")} className="min-h-10 w-full text-left text-xs text-slate-400 transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">Términos y condiciones</button></li>
                  <li><button type="button" onClick={() => onNavigate("contact")} className="min-h-10 w-full text-left text-xs text-slate-400 transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">Contacto</button></li>
                </ul>
              </div>
            </div>
          </div>
          <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-800 pt-6 sm:flex-row">
            <p className="text-xs text-slate-500">© {new Date().getFullYear()} UrbanSport Store. Todos los derechos reservados.</p>
          </div>
        </div>
      </footer>
    </main>
  );
}

function LegalPage({ kind, onNavigate }: { kind: View; onNavigate: (v: View) => void }) {
  const maps: Record<Exclude<View, "home" | "catalog" | "product" | "checkout" | "login" | "register" | "account" | "admin-login" | "admin" | "password-reset">, { title: string; paragraph: string } > = {
    privacy: {
      title: "Política de privacidad",
      paragraph: "Este contenido está pendiente de publicar y completar con la política real del negocio antes de activar la versión final.",
    },
    terms: {
      title: "Términos y condiciones",
      paragraph: "Este contenido está pendiente de revisión legal y validación antes de publicarse en producción.",
    },
    shipping: {
      title: "Envíos",
      paragraph: "La cobertura, los costos y los plazos de envío aún no están configurados.",
    },
    returns: {
      title: "Cambios y devoluciones",
      paragraph: "Las condiciones de cambios y devoluciones deben definirse con la política comercial vigente antes de publicarse.",
    },
    contact: {
      title: "Contacto",
      paragraph: "Completa este bloque con los canales reales de atención, correo, teléfono o redes del negocio antes de publicarlo.",
    },
  };

  const item = maps[kind as keyof typeof maps];
  if (!item) return null;

  return (
    <main className="mx-auto max-w-3xl px-4 pb-16 pt-28 sm:px-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)] sm:p-8">
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-[#2457D6]">Configuración pendiente</p>
        <h1 className="font-display text-3xl text-slate-900 sm:text-4xl">{item.title}</h1>
        <p className="mt-4 text-base leading-relaxed text-slate-600">{item.paragraph}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <button type="button" onClick={() => onNavigate("home")} className="min-h-11 rounded-xl bg-[#2457D6] px-5 py-3 text-sm font-bold text-white hover:bg-[#1d48b9]">Volver a la home</button>
          <button type="button" onClick={() => onNavigate("catalog")} className="min-h-11 rounded-xl border border-slate-200 bg-slate-50 px-5 py-3 text-sm font-bold text-slate-700 hover:bg-slate-100">Explorar catálogo</button>
        </div>
      </div>
    </main>
  );
}


// ─── CATALOG PAGE ─────────────────────────────────────────────────────────────

function CatalogPage({ filterCategory, onSelectProduct, onAddToCart, onNavigate, onCategorySelect, products, categories, productsStatus, onRetryProducts }: {
  filterCategory: Category | null; onSelectProduct: (p: Product) => void;
  onAddToCart: (p: Product, size: string, color: string) => void;
  onNavigate: (v: View) => void;
  onCategorySelect: (c: Category | null) => void;
  products: Product[];
  categories: CategoryOption[];
  productsStatus: ProductsStatus;
  onRetryProducts: () => void;
}) {
  const selectedCat = filterCategory;
  const [selectedBrand, setSelectedBrand] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState("relevancia");
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
    <main className="pt-8 sm:pt-10 md:pt-12 pb-6 sm:pb-8 min-h-screen max-w-7xl mx-auto px-3 sm:px-4 md:px-6">
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
                <button onClick={() => onCategorySelect(null)} className={`w-full text-left px-3 py-2 rounded-xl text-sm transition-colors ${!selectedCat ? "bg-[#1d4ed8] text-white font-bold" : "text-slate-600 hover:bg-slate-100"}`}>
                  Todos ({products.length})
                </button>
                {availableCategories.map((category) => {
                  const count = products.filter((product) => product.category === category).length;
                  return (
                    <button key={category} onClick={() => onCategorySelect(category)} className={`w-full text-left px-3 py-2 rounded-xl text-sm transition-colors flex justify-between items-center ${selectedCat === category ? "bg-[#1d4ed8] text-white font-bold" : "text-slate-600 hover:bg-slate-100"}`}>
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
              className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-none focus:border-[#1d4ed8]/50 cursor-pointer shadow-sm">
              <option value="relevancia">Más relevantes</option>
              <option value="novedades">Novedades</option>
              <option value="precio-asc">Precio: menor a mayor</option>
              <option value="precio-desc">Precio: mayor a menor</option>
              <option value="rating">Mejor calificados</option>
            </select>
            <div className="hidden sm:flex border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
              <button onClick={() => setViewMode("grid")}
                className={`p-2 transition-colors ${viewMode === "grid" ? "bg-[#1d4ed8] text-white" : "text-slate-500 hover:bg-slate-50"}`}>
                <Grid3X3 size={15} />
              </button>
              <button onClick={() => setViewMode("list")}
                className={`p-2 transition-colors ${viewMode === "list" ? "bg-[#1d4ed8] text-white" : "text-slate-500 hover:bg-slate-50"}`}>
                <Layers size={15} />
              </button>
            </div>
          </div>

          {mobileFiltersOpen && (
            <div className="mb-5 space-y-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm lg:hidden">
              <div className="grid gap-3">
                <button onClick={() => onCategorySelect(null)} className="px-4 py-3 rounded-2xl bg-[#1d4ed8] text-white text-sm font-semibold">Mostrar todos ({products.length})</button>
                <div>
                  <p className="text-xs font-bold text-slate-800 uppercase tracking-widest mb-2">Marca</p>
                  <div className="grid grid-cols-2 gap-2">
                    {allBrands.map((brand) => (
                      <button key={brand} onClick={() => { setSelectedBrand(brand === selectedBrand ? null : brand); }}
                        className={`rounded-2xl px-3 py-2 text-sm text-left ${selectedBrand === brand ? "bg-[#1d4ed8] text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>
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
                        className={`rounded-2xl px-3 py-2 text-sm text-left ${selectedCat === category ? "bg-[#1d4ed8] text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>
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
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#1d4ed8]/10 text-[#1d4ed8] text-xs border border-[#1d4ed8]/20 hover:bg-[#1d4ed8]/20 transition-colors font-semibold">
                  {selectedCat} <X size={11} />
                </button>
              )}
              {selectedBrand && (
                <button onClick={() => setSelectedBrand(null)}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#1d4ed8]/10 text-[#1d4ed8] text-xs border border-[#1d4ed8]/20 hover:bg-[#1d4ed8]/20 transition-colors font-semibold">
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-3 sm:gap-4 md:gap-5">
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

function ProductDetailPage({ product, products, onBack, onAddToCart, onNavigate }: {
  product: Product; products: Product[]; onBack: () => void;
  onAddToCart: (p: Product, size: string, color: string) => void;
  onNavigate: (v: View) => void;
}) {
  const [selectedSize, setSelectedSize] = useState(product.sizes[0] ?? "");
  const [selectedColor, setSelectedColor] = useState(product.colors[0]?.name ?? "");
  const [qty, setQty] = useState(1);
  const [tab, setTab] = useState<"desc" | "specs" | "reviews">("desc");
  const [added, setAdded] = useState(false);
  const savings = product.originalPrice ? product.originalPrice - product.price : 0;

  const handleAdd = () => {
    if (product.stock <= 0) return;
    for (let i = 0; i < qty; i++) onAddToCart(product, selectedSize, selectedColor);
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  };

  return (
    <main className="pt-8 sm:pt-10 md:pt-12 pb-8 min-h-screen max-w-7xl mx-auto px-4 sm:px-6">
      {/* Breadcrumbs */}
      <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-6">
        <button onClick={() => onNavigate("home")} className="hover:text-slate-600">Inicio</button>
        <ChevronRight size={12} />
        <button onClick={onBack} className="hover:text-slate-600">{product.category}</button>
        <ChevronRight size={12} />
        <span className="text-slate-700 font-semibold truncate max-w-xs">{product.name}</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 mb-16">
        {/* Gallery */}
        <div className="space-y-3">
          {(() => {
            const gallery = product.images?.length ? product.images : [product.image];
            const mainImage = gallery[0] ?? product.image;
            return (
              <>
                <div className="aspect-square bg-slate-50 rounded-2xl overflow-hidden border border-slate-100">
                  <img src={mainImage} alt={product.name} onError={(event) => { event.currentTarget.style.display = "none"; }} className="w-full h-full object-cover" />
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {gallery.slice(0, 4).map((src, index) => (
                    <div key={index} className={`aspect-square rounded-xl overflow-hidden border-2 cursor-pointer transition-colors ${index === 0 ? "border-[#1d4ed8]" : "border-slate-200 hover:border-slate-300"}`}>
                      <img src={src} alt={`Miniatura ${index + 1}`} onError={(event) => { event.currentTarget.style.display = "none"; }} className="w-full h-full object-cover" />
                    </div>
                  ))}
                </div>
              </>
            );
          })()}
        </div>

        {/* Info */}
        <div className="space-y-5">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-extrabold text-[#1d4ed8]">{product.brand}</span>
              <span className="text-slate-300">|</span>
              <span className="text-xs text-slate-400 font-mono">{product.sku}</span>
              {product.gender && <Badge>{product.gender}</Badge>}
            </div>
            <h1 className="font-display text-[32px] sm:text-[40px] text-slate-900 leading-[1.02] mb-3">{product.name}</h1>
            {product.reviews > 0 && product.rating > 0 && <StarRating rating={product.rating} reviews={product.reviews} />}
          </div>

          {/* Price */}
          <div className="p-4 bg-white/95 rounded-[30px] border border-slate-200/80 shadow-[0_20px_45px_-35px_rgba(15,23,42,0.12)]">
            <div className="flex items-baseline gap-3 flex-wrap">
              <span className="price text-3xl text-slate-900">{fmt(product.price)}</span>
              {product.originalPrice && (
                <span className="price text-lg text-slate-400 line-through">{fmt(product.originalPrice)}</span>
              )}
              {product.discount && <Badge variant="sale">-{product.discount}%</Badge>}
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

          {/* Size selector */}
          <div>
            <div className="flex justify-between items-center mb-2.5">
              <p className="text-sm font-bold text-slate-700">
                Talla u opción
              </p>
            </div>
            <SizeSelector sizes={product.sizes} selected={selectedSize} onSelect={setSelectedSize} />
          </div>

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
            <button type="button" disabled={product.stock <= 0} onClick={handleAdd}
              className={`flex-1 py-3.5 rounded-xl text-sm font-extrabold flex items-center justify-center gap-2 transition-all duration-300 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600 ${
                added ? "bg-emerald-500 text-white shadow-lg shadow-emerald-200" : "bg-black text-white hover:bg-slate-900 shadow-lg shadow-slate-800"
              }`}>
              {product.stock <= 0 ? "Agotado" : added ? <><Check size={16} /> Agregado al carrito</> : <><ShoppingCart size={16} /> Agregar al carrito</>}
            </button>
            <button type="button" disabled={product.stock <= 0} onClick={() => { handleAdd(); onNavigate("checkout"); }}
              className="flex-1 py-3.5 rounded-xl text-sm font-extrabold border-2 border-black text-black hover:bg-slate-100 disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-100 disabled:text-slate-500 flex items-center justify-center gap-2 transition-colors">
              Comprar ahora
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200 mb-6 flex gap-1">
        {(["desc", "specs", "reviews"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-5 py-3 text-sm font-bold border-b-2 transition-all ${
              tab === t ? "border-[#1d4ed8] text-[#1d4ed8]" : "border-transparent text-slate-400 hover:text-slate-700"
            }`}>
            {{ desc: "Descripción", specs: "Especificaciones", reviews: "Reseñas" }[t]}
          </button>
        ))}
      </div>

      {tab === "desc" && <p className="max-w-2xl text-slate-600 leading-relaxed">{product.description}</p>}

      {tab === "specs" && product.specs && (
        <div className="max-w-2xl grid grid-cols-1 sm:grid-cols-2 gap-3">
          {product.specs.map((spec, i) => (
            <div key={i} className="flex items-start gap-3 p-4 rounded-[28px] bg-white/95 border border-slate-200/80 shadow-[0_18px_48px_-40px_rgba(15,23,42,0.15)]">
              <Check size={14} className="text-[#1d4ed8] mt-0.5 shrink-0" />
              <span className="text-sm text-slate-600">{spec}</span>
            </div>
          ))}
        </div>
      )}

      {tab === "reviews" && (
        <p className="max-w-2xl rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
          Aún no hay reseñas verificadas para este producto.
        </p>
      )}

      {/* Related */}
      <div className="mt-16">
        <h3 className="font-display text-2xl sm:text-[28px] text-slate-900 leading-[1.05] mb-6">También te puede interesar</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-5">
          {products.filter((p) => p.id !== product.id && p.category === product.category).slice(0, 4).map((p) => (
            <ProductCard key={p.id} product={p} onSelect={onBack as unknown as (p: Product) => void} onAddToCart={onAddToCart} />
          ))}
        </div>
      </div>
    </main>
  );
}

// ─── CHECKOUT ────────────────────────────────────────────────────────────────

function CheckoutPage({ cart, onNavigate, addresses, selectedAddressId, onSelectAddress, onCreateAddress }: { cart: StorefrontCartLine[]; onNavigate: (v: View) => void; addresses: Address[]; selectedAddressId: string; onSelectAddress: (id: string) => void; onCreateAddress: (address: Omit<Address, 'id'>) => void; }) {
  const [step, setStep] = useState(0);
  const [showNewAddress, setShowNewAddress] = useState(false);
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

      <div role="status" className="mb-8 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
        <p className="font-semibold">Checkout temporalmente no disponible.</p>
        <p className="mt-1">El backend y el esquema remoto de pedidos no están habilitados. No se creará un pedido ni se iniciará un pago desde esta pantalla.</p>
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-2 mb-10 overflow-x-auto pb-1">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-2 shrink-0">
            <div className={`flex items-center gap-2 ${i <= step ? "text-[#1d4ed8]" : "text-slate-400"}`}>
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all ${
                i < step ? "bg-[#1d4ed8] border-[#1d4ed8] text-white" :
                i === step ? "border-[#1d4ed8] text-[#1d4ed8] bg-blue-50" :
                "border-slate-200 text-slate-400"
              }`}>
                {i < step ? <Check size={13} /> : i + 1}
              </div>
              <span className="text-sm font-bold hidden sm:block">{s}</span>
            </div>
            {i < STEPS.length - 1 && <div className={`h-0.5 w-8 sm:w-14 rounded ${i < step ? "bg-[#1d4ed8]" : "bg-slate-200"}`} />}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          {step === 0 && (
            <div className="space-y-3 sm:space-y-4">
              <h3 className="text-base sm:text-lg font-extrabold text-slate-900 mb-3 sm:mb-4">Dirección de entrega</h3>
              {addresses.length === 0 && (
                <p className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">Las direcciones actuales se guardan solo en este dispositivo y no se pueden usar para crear pedidos.</p>
              )}
              {addresses.map((a) => (
                <label key={a.id} className={"flex gap-2 sm:gap-3 p-3 sm:p-4 rounded-lg sm:rounded-2xl border-2 cursor-pointer transition-all " + (selectedAddressId === a.id ? "border-[#1d4ed8] bg-blue-50/50" : "border-slate-200 hover:border-slate-300")}>
                  <input type="radio" name="addr" checked={selectedAddressId === a.id} onChange={() => onSelectAddress(a.id)} className="mt-1 accent-[#1d4ed8] shrink-0" />
                  <div>
                    <p className="text-xs sm:text-sm font-bold text-slate-800 flex items-center gap-2 flex-wrap">
                      <MapPin size={13} className="text-[#1d4ed8] shrink-0" /> {a.label}
                      {a.isDefault && <Badge variant="new">Predeterminada</Badge>}
                    </p>
                    <p className="text-xs sm:text-sm text-slate-500 mt-0.5">{a.line1}{a.line2 ? ", " + a.line2 : ""}</p>
                    <p className="text-xs sm:text-sm text-slate-500">{a.city}, {a.state} · {a.postalCode}</p>
                    <p className="text-xs sm:text-sm text-slate-500">{a.country} · {a.phone}</p>
                  </div>
                </label>
              ))}
              <button type="button" onClick={() => setShowNewAddress((prev) => !prev)}
                className="w-full p-3 sm:p-4 rounded-lg sm:rounded-2xl border-2 border-dashed border-slate-200 text-slate-500 hover:border-[#1d4ed8]/50 hover:text-[#1d4ed8] transition-all flex items-center justify-center gap-2 text-xs sm:text-sm font-semibold">
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
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:border-[#1d4ed8]/50"
                      />
                    </div>
                  ))}
                  <label className="flex items-center gap-2 text-sm text-slate-600">
                    <input type="checkbox" checked={addressForm.isDefault} onChange={(e) => setAddressForm((prev) => ({ ...prev, isDefault: e.target.checked }))} className="accent-[#1d4ed8]" />
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
              <h3 className="text-lg font-extrabold text-slate-900 mb-4">Pago en línea no disponible</h3>
              <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
                <p className="font-semibold">La pasarela de pagos todavía no está conectada.</p>
                <p className="mt-1">No ingreses datos de tarjeta: no se registrará ni cobrará ningún pedido desde esta pantalla.</p>
              </div>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3 mt-6 sm:mt-8">
            {step > 0 && <Btn variant="secondary" onClick={() => setStep(step - 1)} className="flex-1 sm:flex-none justify-center"><ChevronLeft size={14} /> Atrás</Btn>}
            <Btn variant="primary" className="flex-1" size="lg" disabled={step === 2 || (step === 0 && (!selectedAddressId || !addresses.some((address) => address.id === selectedAddressId)))} onClick={() => setStep(step + 1)}>
              {step === 2 ? "Pago no disponible" : <>Continuar <ChevronRight size={15} /></>}
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
                    <span className="absolute -top-1.5 -right-1.5 w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-[#1d4ed8] text-white text-[8px] sm:text-[9px] font-bold flex items-center justify-center">{item.qty}</span>
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

function LoginPage({ isRegister, onNavigate, onLogin }: {
  isRegister: boolean; onNavigate: (v: View) => void;
  onLogin: (user: User | null, isAdmin: boolean, adminRole: string | null) => void;
}) {
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [recoveryMessage, setRecoveryMessage] = useState<string | null>(null);
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const recoveryRequestInFlight = useRef(false);
  const [acceptedPolicies, setAcceptedPolicies] = useState(false);
  const termsUrl = import.meta.env.VITE_TERMS_URL?.trim() ?? "";
  const privacyPolicyUrl = import.meta.env.VITE_PRIVACY_POLICY_URL?.trim() ?? "";
  const policiesAvailable = Boolean(termsUrl && privacyPolicyUrl);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading || recoveryRequestInFlight.current) return;
    if (isRegister && (!policiesAvailable || !acceptedPolicies)) {
      setError("El registro requiere publicar y aceptar los Términos y la Política de privacidad.");
      return;
    }
    setLoading(true);
    setError(null);

    try {
      let user = null;
      if (isRegister) {
        const signUpResult = await signUpWithEmail(email, password, { name });
        if (signUpResult.error) throw signUpResult.error;
        if (!signUpResult.data.user) throw new Error("No se pudo crear la cuenta.");

        user = signUpResult.data.user;
        const profileAccess = await getProfileAccess(user);
        if (profileAccess.status === "missing" || profileAccess.status === "inactive") {
          setError("No fue posible verificar los permisos de tu cuenta. Inténtalo de nuevo más tarde.");
          return;
        }
        onLogin(user, profileAccess.isAdmin, profileAccess.role);
        const signUpNeedsConfirmation = 'needsConfirmation' in signUpResult && Boolean(signUpResult.needsConfirmation);
        toast.success(signUpNeedsConfirmation ? "Cuenta creada. Revisa tu correo si tu configuración de Supabase requiere confirmación; ya puedes seguir usando la tienda." : "Registro exitoso. Ya puedes continuar en la tienda.");
        setEmail("");
        setPassword("");
        setName("");
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
      onNavigate("home");
    } catch (err) {
      if (err instanceof ProfileAccessVerificationError) {
        setError(err.message);
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
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100 pt-[60px] px-4">
      {/* Decorative elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-[#1d4ed8]/5 rounded-full blur-3xl" />
        <div className="absolute -bottom-32 left-1/3 w-96 h-96 bg-blue-400/5 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* Logo */}
        <div className="text-center mb-12">
          <div className="flex items-center justify-center gap-2 mb-4">
            <span className="font-extrabold text-slate-900 text-2xl">Urban<span className="text-[#1d4ed8]">Sport</span></span>
          </div>
          <h1 className="font-display text-[40px] sm:text-[48px] text-slate-900 leading-[1.02] mb-2">
            {isRegister ? "Crear cuenta" : "Bienvenido"}
          </h1>
          <p className="text-slate-600">
            {isRegister ? "Únete a UrbanSport Store hoy" : "Continúa tu aventura deportiva"}
          </p>
        </div>

        {/* Main form card */}
        <div className="bg-white/95 backdrop-blur-sm rounded-3xl border border-blue-200 p-8 shadow-xl space-y-6">
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Name field for register */}
            {isRegister && (
              <div>
                <label htmlFor="auth-name" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">Nombre completo</label>
                <input
                  id="auth-name"
                  required
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Tu nombre"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-900 placeholder-slate-500 focus:outline-none focus:border-[#1d4ed8] focus:bg-white transition-all duration-200"
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
                  onChange={(e) => { setEmail(e.target.value); setRecoveryMessage(null); }}
                placeholder="tu@email.com" 
                className="w-full px-4 py-3.5 bg-slate-50 border border-slate-300 rounded-xl text-base text-slate-900 placeholder-slate-500 focus:outline-none focus:border-[#1d4ed8] focus:bg-white transition-all duration-200" 
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
                  autoComplete={isRegister ? "new-password" : "current-password"}
                  value={password} 
                  onChange={(e) => setPassword(e.target.value)} 
                  placeholder="••••••••"
                  className="w-full px-4 py-3.5 bg-slate-50 border border-slate-300 rounded-xl text-base text-slate-900 placeholder-slate-500 focus:outline-none focus:border-[#1d4ed8] focus:bg-white transition-all duration-200" 
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
                <button type="button" disabled={loading} onClick={() => void handlePasswordRecovery()} className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#1d4ed8] hover:text-blue-700 disabled:opacity-60">
                  {recoveryLoading ? <><RefreshCw size={14} className="animate-spin" /> Enviando enlace…</> : "¿Olvidaste tu contraseña?"}
                </button>
              </div>
            )}

            {/* Terms checkbox for register */}
            {isRegister && (
              policiesAvailable ? (
                <label className="flex items-start gap-3 cursor-pointer group">
                  <input type="checkbox" required checked={acceptedPolicies} onChange={(event) => setAcceptedPolicies(event.target.checked)} className="mt-1 w-4 h-4 accent-[#1d4ed8] cursor-pointer" />
                  <span className="text-xs text-slate-700 leading-relaxed">
                    Acepto los <a href={termsUrl} target="_blank" rel="noreferrer" className="text-[#1d4ed8] font-semibold underline">Términos</a> y la <a href={privacyPolicyUrl} target="_blank" rel="noreferrer" className="text-[#1d4ed8] font-semibold underline">Política de privacidad</a>.
                  </span>
                </label>
              ) : (
                <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">El registro estará disponible cuando se configuren los enlaces públicos de Términos y Política de privacidad.</p>
              )
            )}

            {/* Error message */}
            {error && (
              <div role="alert" aria-live="assertive" className="rounded-xl border border-red-200 bg-red-50 p-3.5">
                <p className="text-sm font-medium text-red-800">{error}</p>
              </div>
            )}
            {recoveryMessage && <p role="status" aria-live="polite" className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">{recoveryMessage}</p>}

            {/* Submit button */}
            <button 
              type="submit" 
              disabled={loading || (isRegister && (!policiesAvailable || !acceptedPolicies))}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-[#1d4ed8] to-blue-600 text-white font-extrabold text-base hover:shadow-lg hover:shadow-blue-500/30 disabled:opacity-60 disabled:shadow-none transition-all duration-300 flex items-center justify-center gap-2 transform hover:scale-105"
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
            className="text-[#1d4ed8] font-bold hover:text-blue-600 transition-colors"
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
        <p className="text-sm font-bold text-[#1d4ed8]">UrbanSport Store</p>
        <h1 className="mt-3 text-3xl font-extrabold text-slate-900">{complete ? "Contraseña actualizada" : "Crea una contraseña nueva"}</h1>
        {complete ? (
          <div className="mt-6 space-y-5">
            <p role="status" className="text-sm text-slate-600">Ya puedes iniciar sesión con tu contraseña nueva.</p>
            <button type="button" onClick={() => onNavigate("login")} className="w-full rounded-xl bg-[#1d4ed8] px-4 py-3 font-bold text-white hover:bg-blue-700">Ir al inicio de sesión</button>
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
            <button type="submit" disabled={loading} className="w-full rounded-xl bg-[#1d4ed8] px-4 py-3 font-bold text-white hover:bg-blue-700 disabled:opacity-60">{loading ? "Actualizando…" : "Actualizar contraseña"}</button>
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
          <button key={item.key} type="button" aria-pressed={section === item.key} onClick={() => setSection(item.key)} className={`min-h-11 rounded-lg px-3 text-sm font-semibold ${section === item.key ? "bg-[#1d4ed8] text-white" : "bg-white text-slate-700 border border-slate-200"}`}>
            {item.label}
          </button>
        ))}
      </nav>
      <div className="flex gap-8">
        <aside className="hidden sm:block w-56 shrink-0">
          <div className="bg-white/95 rounded-[30px] border border-slate-200/80 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.18)] overflow-hidden">
            <div className="p-4 border-b border-slate-100 bg-gradient-to-br from-[#1d4ed8] to-[#1e40af]">
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
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm transition-colors ${section === item.key ? "bg-blue-50 text-[#1d4ed8] font-bold" : "text-slate-600 hover:bg-slate-50"}`}>
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
              <p role="status" className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
                El historial de pedidos no está conectado. No se muestran pedidos locales o simulados.
              </p>
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
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:border-[#1d4ed8]/50"
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
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:border-[#1d4ed8]/50"
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
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:border-[#1d4ed8]/50"
                      />
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-slate-600">
                    <input type="checkbox" checked={addressForm.isDefault} onChange={(e) => setAddressForm((prev) => ({ ...prev, isDefault: e.target.checked }))} className="accent-[#1d4ed8]" />
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
                        <MapPin size={14} className="text-[#1d4ed8]" />
                        <span className="text-sm font-bold text-slate-800">{a.label}</span>
                        {a.isDefault && <Badge variant="new">Predeterminada</Badge>}
                      </div>
                      <p className="text-sm text-slate-500">{a.line1}{a.line2 ? `, ${a.line2}` : ''}</p>
                      <p className="text-sm text-slate-500">{a.city}, {a.state} · {a.postalCode}</p>
                      <p className="text-sm text-slate-500">{a.country} · {a.phone}</p>
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => startEdit(a)} className="w-10 h-10 rounded-lg bg-slate-100 text-slate-600 hover:bg-blue-50 hover:text-[#1d4ed8] transition-colors"><Edit size={16} /></button>
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

function AdminDashboard({ onNavigate, products, categories, createProduct, updateProduct, deleteProduct, adjustStock, productRefresh, initialSection, adminRole, homeContent, setHomeContent, homePreviewProducts, setHomePreviewProducts, homeSaleProducts, setHomeSaleProducts, homeNewArrivals, setHomeNewArrivals, saveHomeContent, homeContentSaving, backendAdminAvailable }: {
  onNavigate: (v: View) => void;
  products: Product[];
  categories: CategoryOption[];
  createProduct: (product: Omit<Product, "id">) => void;
  updateProduct: (productId: string, updates: Partial<Product>) => void;
  deleteProduct: (productId: string) => void;
  adjustStock: (productId: string, delta: number) => void;
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
  const [searchTerm, setSearchTerm] = useState("");
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [activeProduct, setActiveProduct] = useState<Product | null>(null);
  const [productForm, setProductForm] = useState<Omit<Product, "id">>({
    name: "", brand: "", price: 0, originalPrice: undefined, discount: undefined,
    rating: 0, reviews: 0, image: "", images: [], category: "", categoryId: undefined, subcategory: "",
    stock: 0, sku: "", description: "", colors: [], sizes: [], gender: "Unisex",
    isNew: false, isFeatured: false, specs: [],
  });

  const selectedCategoryOption = useMemo(() => categories.find((option) => option.id === productForm.categoryId || option.name === productForm.category), [categories, productForm.category, productForm.categoryId]);
  const [galleryUrl, setGalleryUrl] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isUploadingGallery, setIsUploadingGallery] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [mainImagePreview, setMainImagePreview] = useState<string>("");
  const availableCategories = [...new Set([...categories.map((category) => category.name), ...getProductCategories(products)])];

  const metrics = [
    { label: "Productos activos", value: products.length.toString(), icon: <Package size={18} /> },
    { label: "Stock total", value: products.reduce((sum, product) => sum + (product.stock ?? 0), 0).toLocaleString('es-CO'), icon: <TrendingUp size={18} /> },
    { label: "Valor catálogo", value: fmt(products.reduce((sum, product) => sum + (product.price ?? 0) * Math.max(product.stock ?? 0, 0), 0)), icon: <DollarSign size={18} /> },
    { label: "Inventario bajo", value: `${products.filter((product) => (product.stock ?? 0) <= 10).length} productos`, icon: <AlertTriangle size={18} /> },
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
      options: products.filter((p) => p.isFeatured || p.rating >= 4.5).slice(0, 9),
      description: "Selecciona hasta 9 productos que aparecerán en la sección destacada.",
    },
    {
      id: "newArrivals" as const,
      title: "Novedades",
      selected: homeNewArrivals,
      options: products.filter((p) => p.isNew).slice(0, 9),
      description: "Selecciona hasta 9 lanzamientos recientes que quieras mostrar.",
    },
    {
      id: "sale" as const,
      title: "En descuento ahora",
      selected: homeSaleProducts,
      options: products.filter((p) => p.discount).slice(0, 9),
      description: "Selecciona hasta 9 productos en descuento para destacar en la home.",
    },
  ];

  const handleSidebarClick = (section: string) => {
    if (!allowedSections.includes(section)) {
      toast.error("No tienes permisos para acceder a esta sección.");
      return;
    }
    updateAdminSectionUrl(section);
    setAdminSection(section);
  };

  const LOW_STOCK = products.filter((product) => product.stock <= 10).map((product) => ({
    name: product.name, stock: product.stock, sku: product.sku,
  }));

  const filteredProducts = products.filter((product) =>
    product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    product.brand.toLowerCase().includes(searchTerm.toLowerCase()) ||
    product.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
    product.sku.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const [page, setPage] = useState(1);
  const perPage = 12;
  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / perPage));
  const paginatedProducts = filteredProducts.slice((page - 1) * perPage, page * perPage);

  const resetForm = () => {
    setFormMode("create");
    setActiveProduct(null);
    setProductForm({
      name: "", brand: "", price: 0, originalPrice: undefined, discount: undefined,
      rating: 0, reviews: 0, image: "", images: [], category: "", categoryId: undefined, subcategory: "",
      stock: 0, sku: "", description: "", colors: [], sizes: [], gender: "Unisex",
      isNew: false, isFeatured: false, specs: [],
    });
    setGalleryUrl("");
  };

  const [auditEntries, setAuditEntries] = useState<{ id: string; ts: number; action: string; meta?: Record<string, any> }[]>([]);
  const refreshAudit = () => {
    (async () => {
      // prefer server logs when available
      try {
        const srv = await adminApi.fetchAuditLogs(200);
        if (srv?.data) { setAuditEntries(srv.data); return; }
      } catch (e) {
        // fallback to local
      }
      try {
        setAuditEntries(getAudit(200));
      } catch (e) {
        setAuditEntries([]);
      }
    })();
  };

  const handleEditProduct = (product: Product) => {
    setActiveProduct(product);
    setFormMode("edit");
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
      gender: product.gender ?? "Unisex",
      isNew: product.isNew ?? false,
      isFeatured: product.isFeatured ?? false,
      specs: product.specs ?? [],
    });
    setGalleryUrl("");
  };

  const handleFormSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedCategoryId = productForm.categoryId && /^[0-9a-fA-F-]{36}$/.test(productForm.categoryId) ? productForm.categoryId : undefined;

    const payload: Omit<Product, "id"> = {
      ...productForm,
      categoryId: normalizedCategoryId,
      category: productForm.category || selectedCategoryOption?.name || '',
      colors: productForm.colors.map((color) => ({ name: color.name, hex: color.hex })),
      sizes: productForm.sizes,
      rating: Number(productForm.rating) || 0,
      reviews: Number(productForm.reviews) || 0,
      price: Number(productForm.price) || 0,
      stock: Number(productForm.stock) || 0,
      originalPrice: productForm.originalPrice ? Number(productForm.originalPrice) : undefined,
      discount: productForm.discount ? Number(productForm.discount) : undefined,
    };

    const errors = validateProductForm({
      name: productForm.name,
      sku: productForm.sku,
      price: productForm.price,
      stock: productForm.stock,
      categoryId: normalizedCategoryId,
      image: productForm.image,
      images: productForm.images,
    });

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
    const executeUpdate = async () => {
      if (formMode === "edit" && activeProduct) {
        try {
          await updateProduct(activeProduct.id, payload);
          resetForm();
          setAdminSection("products");
        } catch (e) {
          console.error("Error updating product:", e);
          toast.error("Error al actualizar el producto");
        } finally {
          setIsSubmitting(false);
        }
      }
    };

    const executeCreate = async () => {
      try {
        await createProduct(payload);
        resetForm();
        setAdminSection("products");
      } catch (e) {
        console.error("Error creating product:", e);
        toast.error("Error al crear el producto");
      } finally {
        setIsSubmitting(false);
      }
    };

    if (formMode === "edit" && activeProduct) {
      void executeUpdate();
    } else {
      void executeCreate();
    }
  };

  const handleDeleteProduct = (productId: string) => {
    deleteProduct(productId);
    if (activeProduct?.id === productId) resetForm();
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
              <div className="xl:col-span-2 p-8 rounded-[30px] bg-slate-950 text-white shadow-[0_20px_60px_-40px_rgba(15,23,42,0.36)]">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="uppercase text-xs tracking-[0.26em] text-slate-400 font-semibold mb-3">Administrador</p>
                    <h2 className="font-display text-[40px] sm:text-[52px] text-white leading-[1.02]">Control total de la tienda</h2>
                    <p className="mt-3 max-w-2xl text-sm text-slate-300">Administra pedidos, productos, inventarios y reportes desde un panel unificado y seguro.</p>
                  </div>
                  <div className="rounded-full border border-white/10 bg-white/10 px-4 py-3 text-xs uppercase tracking-[0.22em] font-semibold text-slate-100">Acceso rápido</div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-8">
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
                <p className="text-xs uppercase tracking-[0.24em] text-slate-400 font-semibold mb-4">Resumen rápido</p>
                <div className="space-y-3">
                  <div className="rounded-3xl bg-slate-50 p-4">
                    <p className="text-sm text-slate-500">Analítica de usuarios</p>
                    <p className="text-base font-bold text-slate-700">Pendiente de integrar</p>
                  </div>
                  <div className="rounded-3xl bg-slate-50 p-4">
                    <p className="text-sm text-slate-500">Pedidos</p>
                    <p className="text-base font-bold text-slate-700">Sin conexión de datos</p>
                  </div>
                  <div className="rounded-3xl bg-slate-50 p-4">
                    <p className="text-sm text-slate-500">Productos marcados como nuevos</p>
                    <p className="text-2xl font-extrabold text-slate-900">{products.filter((product) => product.isNew).length}</p>
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
                {SALES_DATA.length === 0 ? (
                  <div role="status" className="flex h-[200px] items-center justify-center text-sm text-slate-500">Reporte de ventas pendiente de integración.</div>
                ) : <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={SALES_DATA} margin={{ top: 0, right: 0, left: -10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colVentas" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#1d4ed8" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="#1d4ed8" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="day" tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `$${(v / 1000000).toFixed(1)}M`} />
                    <Tooltip
                      contentStyle={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "12px", color: "#0f172a", fontSize: "12px", boxShadow: "0 4px 20px rgba(0,0,0,0.08)" }}
                      formatter={(v: number) => [`$${v.toLocaleString("es-CO")} COP`, "Ventas"]}
                    />
                    <Area type="monotone" dataKey="ventas" stroke="#1d4ed8" strokeWidth={2} fill="url(#colVentas)" dot={false} activeDot={{ r: 5, fill: "#1d4ed8" }} />
                  </AreaChart>
                </ResponsiveContainer>}
              </div>

              <div className="p-5 bg-white/95 rounded-[30px] border border-slate-200/80 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.16)]">
                <h2 className="text-sm font-extrabold text-slate-800 mb-5">Ventas por categoría</h2>
                {CAT_DATA.length === 0 ? (
                  <div role="status" className="flex h-[200px] items-center justify-center text-sm text-slate-500">Datos de ventas por categoría no disponibles.</div>
                ) : <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={CAT_DATA} margin={{ top: 0, right: 0, left: -28, bottom: 0 }} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                    <XAxis type="number" tick={{ fill: "#94a3b8", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${v}%`} />
                    <YAxis type="category" dataKey="name" tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} width={55} />
                    <Tooltip
                      contentStyle={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "12px", fontSize: "12px", boxShadow: "0 4px 20px rgba(0,0,0,0.08)" }}
                      formatter={(v: number) => [`${v}%`, "Participación"]}
                    />
                    <Bar dataKey="valor" fill="#1d4ed8" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 bg-white/95 rounded-[30px] border border-slate-200/80 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.16)] overflow-hidden">
                <div className="flex items-center justify-between p-5 border-b border-slate-50">
                  <h2 className="text-sm font-extrabold text-slate-800">Pedidos recientes</h2>
                  <button onClick={() => handleSidebarClick('orders')} className="text-xs text-[#1d4ed8] hover:underline flex items-center gap-1">Ver todos <ChevronRight size={11} /></button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-50">
                        {['Pedido', 'Cliente', 'Fecha', 'Estado', 'Total'].map((h) => (
                          <th key={h} className="text-left px-5 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wide">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {ORDERS.map((o) => (
                        <tr key={o.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                          <td className="px-5 py-3 text-xs font-mono font-bold text-[#1d4ed8]">{o.id}</td>
                          <td className="px-5 py-3 text-sm text-slate-700">{o.customer}</td>
                          <td className="px-5 py-3 text-xs text-slate-400">{o.date}</td>
                          <td className="px-5 py-3">
                            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${STATUS_STYLE[o.status]}`}>{o.status}</span>
                          </td>
                          <td className="price px-5 py-3 text-sm text-slate-900">{fmt(o.total)}</td>
                        </tr>
                      ))}
                      {ORDERS.length === 0 && <tr><td colSpan={5} className="px-5 py-8 text-center text-sm text-slate-500">Los pedidos se mostrarán cuando se conecte su fuente de datos.</td></tr>}
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
                  {LOW_STOCK.map((item) => (
                    <div key={item.sku} className="p-3 bg-amber-50 border border-amber-100 rounded-xl">
                      <p className="text-xs font-bold text-slate-700 line-clamp-1 mb-0.5">{item.name}</p>
                      <p className="text-[10px] font-mono text-slate-400 mb-2">{item.sku}</p>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-amber-100 rounded-full h-1.5">
                          <div className="bg-amber-500 h-1.5 rounded-full" style={{ width: `${(item.stock / 15) * 100}%` }} />
                        </div>
                        <span className="text-xs font-extrabold text-amber-700">{item.stock}</span>
                      </div>
                    </div>
                  ))}
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
                    <button type="button" onClick={saveHomeContent} disabled={homeContentSaving}
                      className="rounded-3xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-emerald-400">
                      {homeContentSaving ? 'Guardando...' : 'Guardar contenido'}
                    </button>
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
                              <button type="button" onClick={() => toggleHomeProductSelection(section.id, product)} className="text-xs font-semibold text-[#1d4ed8]">Quitar</button>
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
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            <div className="lg:col-span-2 bg-white/95 rounded-[30px] border border-slate-200/80 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.16)] p-5">
              <div className="flex items-center justify-between gap-4 mb-4">
                <input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Buscar productos por nombre, marca o SKU"
                  className="flex-1 px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 placeholder-slate-400 focus:outline-none" />
                <button onClick={() => { resetForm(); setFormMode('create'); }}
                  className="ml-3 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-black text-white font-semibold hover:bg-slate-900">
                  <Plus size={14} /> Nuevo producto
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-50">
                      {['Imagen', 'Nombre', 'Marca', 'Precio', 'Stock', 'Acciones'].map((h) => (
                        <th key={h} className="text-left px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedProducts.map((p) => (
                      <tr key={p.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                        <td className="px-4 py-3"><img src={p.image} alt={p.name} className="w-12 h-12 object-cover rounded-lg" /></td>
                        <td className="px-4 py-3 text-sm font-semibold text-slate-800">{p.name}</td>
                        <td className="px-4 py-3 text-sm text-slate-600">{p.brand}</td>
                        <td className="price px-4 py-3 text-sm text-slate-900">{fmt(p.price)}</td>
                        <td className="px-4 py-3 text-sm text-slate-700">{p.stock}</td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2">
                            <button onClick={() => handleEditProduct(p)} className="px-3 py-1.5 rounded-lg bg-black text-white font-semibold">Editar</button>
                            <button onClick={() => { if (confirm(`Archivar ${p.name}? Dejará de aparecer en la tienda pública.`)) handleDeleteProduct(p.id); }} className="px-3 py-1.5 rounded-lg bg-red-50 text-red-600 font-semibold">Archivar</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between mt-3">
                <div className="text-sm text-slate-500">Mostrando {(page - 1) * perPage + 1} - {Math.min(page * perPage, filteredProducts.length)} de {filteredProducts.length}</div>
                <div className="flex items-center gap-2">
                  <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="px-3 py-1 rounded-md bg-slate-100">Anterior</button>
                  <div className="text-sm text-slate-600">{page} / {totalPages}</div>
                  <button disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} className="px-3 py-1 rounded-md bg-slate-100">Siguiente</button>
                </div>
              </div>
            </div>

            <div className="bg-white/95 rounded-[30px] border border-slate-200/80 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.16)] p-5">
              <h3 className="text-lg font-extrabold text-slate-900 mb-4">{formMode === 'edit' ? '✏️ Editar producto' : '➕ Crear nuevo producto'}</h3>
              <form onSubmit={handleFormSubmit} className="space-y-4">
                {/* Nombre y Marca */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-slate-600 uppercase block mb-2">Nombre *</label>
                    <input 
                      value={productForm.name} 
                      onChange={(e) => { updateField('name', e.target.value); setFormErrors({...formErrors, name: ''}) }}
                      placeholder="Ej: Nike Air Force 1" 
                      className={`w-full px-4 py-3 rounded-xl border-2 transition-colors ${formErrors.name ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-white hover:border-slate-300 focus:border-slate-500'} focus:outline-none`} 
                    />
                    {formErrors.name && <p className="text-xs text-red-600 mt-1">{formErrors.name}</p>}
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-600 uppercase block mb-2">Marca</label>
                    <input 
                      value={productForm.brand} 
                      onChange={(e) => updateField('brand', e.target.value)}
                      placeholder="Ej: Nike" 
                      className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 bg-white hover:border-slate-300 focus:border-slate-500 focus:outline-none transition-colors" 
                    />
                  </div>
                </div>

                {/* Precio y Stock */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-slate-600 uppercase block mb-2">Precio *</label>
                    <div className="relative">
                      <span className="absolute left-4 top-3 text-slate-600 font-semibold">$</span>
                      <input 
                        type="number" 
                        value={productForm.price as any} 
                        onChange={(e) => { updateField('price', Number(e.target.value)); setFormErrors({...formErrors, price: ''}) }}
                        placeholder="0" 
                        className={`w-full pl-8 pr-4 py-3 rounded-xl border-2 transition-colors ${formErrors.price ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-white hover:border-slate-300 focus:border-slate-500'} focus:outline-none`}
                      />
                    </div>
                    {formErrors.price && <p className="text-xs text-red-600 mt-1">{formErrors.price}</p>}
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-600 uppercase block mb-2">Stock *</label>
                    <input 
                      type="number" 
                      value={productForm.stock as any} 
                      onChange={(e) => { updateField('stock', Number(e.target.value)); setFormErrors({...formErrors, stock: ''}) }}
                      placeholder="0" 
                      className={`w-full px-4 py-3 rounded-xl border-2 transition-colors ${formErrors.stock ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-white hover:border-slate-300 focus:border-slate-500'} focus:outline-none`}
                    />
                    {formErrors.stock && <p className="text-xs text-red-600 mt-1">{formErrors.stock}</p>}
                  </div>
                </div>

                {/* SKU y Categoría */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-slate-600 uppercase block mb-2">SKU *</label>
                    <input 
                      value={productForm.sku} 
                      onChange={(e) => { updateField('sku', e.target.value); setFormErrors({...formErrors, sku: ''}) }}
                      placeholder="Ej: NKE-AF1-001" 
                      className={`w-full px-4 py-3 rounded-xl border-2 transition-colors ${formErrors.sku ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-white hover:border-slate-300 focus:border-slate-500'} focus:outline-none`}
                    />
                    {formErrors.sku && <p className="text-xs text-red-600 mt-1">{formErrors.sku}</p>}
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-600 uppercase block mb-2">Categoría *</label>
                    <select 
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
                      {categories.map((option) => (
                        <option key={option.id} value={option.id}>{option.name}</option>
                      ))}
                    </select>
                    {categories.length === 0 && (
                      <p className="mt-2 text-xs text-amber-700">Primero crea una categoría antes de agregar productos.</p>
                    )}
                  </div>
                </div>

                {/* Imágenes - Mejorado */}
                <div className="bg-slate-50 rounded-xl p-4 space-y-4">
                  <div>
                    <label className="text-xs font-bold text-slate-600 uppercase block mb-3 flex items-center gap-2">
                      <span>🖼️ Imagen principal</span>
                      {isUploadingImage && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full animate-pulse">Cargando...</span>}
                    </label>
                    
                    {/* Preview de imagen principal */}
                    {(productForm.image || mainImagePreview) && (
                      <div className="mb-3 rounded-xl overflow-hidden border-2 border-slate-200 bg-white">
                        <img 
                          src={mainImagePreview || productForm.image} 
                          alt="Preview" 
                          className="w-full h-40 object-cover"
                        />
                      </div>
                    )}

                    {/* Input file */}
                    <label className="w-full px-4 py-3 rounded-xl border-2 border-dashed border-slate-300 bg-white hover:bg-slate-50 cursor-pointer transition-colors flex flex-col items-center justify-center gap-2">
                      <span className="text-2xl">📁</span>
                      <span className="text-sm font-semibold text-slate-600">Selecciona una imagen</span>
                      <input 
                        type="file" 
                        accept="image/*" 
                        onChange={handleImageFileChange} 
                        disabled={isUploadingImage}
                        className="hidden" 
                      />
                    </label>

                    {/* O URL */}
                    <div className="mt-2 text-xs text-slate-500 text-center">O</div>
                    <input 
                      value={productForm.image} 
                      onChange={(e) => { updateField('image', e.target.value); setMainImagePreview(e.target.value); }}
                      placeholder="Pega una URL pública (ej: https://example.com/image.jpg)" 
                      className={`w-full px-4 py-3 mt-2 rounded-xl border-2 transition-colors ${formErrors.image ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-white hover:border-slate-300 focus:border-slate-500'} focus:outline-none`}
                    />
                    {formErrors.image && <p className="text-xs text-red-600 mt-1">{formErrors.image}</p>}
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-600 uppercase block mb-3 flex items-center gap-2">
                      <span>📸 Galería de imágenes</span>
                      {isUploadingGallery && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full animate-pulse">Cargando...</span>}
                    </label>
                    {/* Input file múltiple */}
                    <label className="w-full px-4 py-3 rounded-xl border-2 border-dashed border-slate-300 bg-white hover:bg-slate-50 cursor-pointer transition-colors flex flex-col items-center justify-center gap-2">
                      <span className="text-2xl">📸</span>
                      <span className="text-sm font-semibold text-slate-600">Selecciona múltiples imágenes</span>
                      <input 
                        type="file" 
                        accept="image/*" 
                        multiple 
                        onChange={handleGalleryFilesChange} 
                        disabled={isUploadingGallery}
                        className="hidden" 
                      />
                    </label>
                    {/* O URL */}
                    <div className="mt-3 flex gap-2">
                      <input 
                        value={galleryUrl} 
                        onChange={(e) => setGalleryUrl(e.target.value)} 
                        placeholder="O pega una URL pública" 
                        className="flex-1 px-4 py-3 rounded-xl border-2 border-slate-200 bg-white hover:border-slate-300 focus:border-slate-500 focus:outline-none transition-colors"
                        onKeyPress={(e) => e.key === 'Enter' && addGalleryImageUrl()}
                      />
                      <button 
                        type="button" 
                        onClick={addGalleryImageUrl} 
                        className="px-4 py-3 rounded-xl bg-slate-900 text-white font-semibold hover:bg-slate-800 transition-colors"
                      >
                        Agregar
                      </button>
                    </div>
                    {(productForm.images?.length ?? 0) > 0 && (
                      <div className="mt-3">
                        <p className="text-xs font-semibold text-slate-600 mb-2">{productForm.images?.length ?? 0} imagen(es) en galería</p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                        {(productForm.images ?? []).map((img, index) => (
                            <div key={index} className="relative rounded-xl overflow-hidden border-2 border-slate-200 bg-white hover:border-slate-400 transition-colors group">
                            <img src={img} alt={`Galería ${index + 1}`} className="w-full h-24 object-cover" />
                              <button 
                                type="button" 
                                onClick={() => removeGalleryImage(index)} 
                                className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                              >
                                <span className="text-white text-2xl font-bold">✕</span>
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Botones de acción mejorados */}
                <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
                  <button 
                    type="submit" 
                    disabled={isSubmitting}
                    className={`flex-1 px-6 py-3 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 ${isSubmitting ? 'bg-slate-300 text-slate-600 cursor-not-allowed' : 'bg-black text-white hover:bg-slate-900 active:scale-95'}`}
                  >
                    {isSubmitting ? (
                      <>
                        <span className="animate-spin">⏳</span>
                        {formMode === 'edit' ? 'Guardando cambios...' : 'Creando producto...'}
                      </>
                    ) : (
                      <>
                        {formMode === 'edit' ? '💾 Guardar cambios' : '✅ Crear producto'}
                      </>
                    )}
                  </button>
                  <button 
                    type="button" 
                    onClick={() => resetForm()} 
                    className="flex-1 px-6 py-3 rounded-xl bg-slate-100 text-slate-700 font-semibold hover:bg-slate-200 transition-colors active:scale-95"
                  >
                    ✕ Cancelar
                  </button>
                </div>
              </form>
            </div>
          </div>
        );

      case "orders":
        return (
          <div className="grid grid-cols-1 gap-6 mb-6">
            <div className="bg-white/95 rounded-[30px] border border-slate-200/80 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.16)] overflow-hidden">
              <div className="flex items-center justify-between p-5 border-b border-slate-50">
                <h2 className="text-lg font-extrabold text-slate-900">Pedidos</h2>
                <span className="text-xs text-slate-500">Fuente de pedidos no conectada</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-50">
                      {['Pedido', 'Cliente', 'Fecha', 'Estado', 'Total'].map((h) => (
                        <th key={h} className="text-left px-5 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ORDERS.map((o) => (
                      <tr key={o.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                        <td className="px-5 py-3 text-xs font-mono font-bold text-[#1d4ed8]">{o.id}</td>
                        <td className="px-5 py-3 text-sm text-slate-700">{o.customer}</td>
                        <td className="px-5 py-3 text-xs text-slate-400">{o.date}</td>
                        <td className="px-5 py-3">
                          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${STATUS_STYLE[o.status]}`}>{o.status}</span>
                        </td>
                        <td className="price px-5 py-3 text-sm text-slate-900">{fmt(o.total)}</td>
                      </tr>
                    ))}
                    {ORDERS.length === 0 && <tr><td colSpan={5} className="px-5 py-8 text-center text-sm text-slate-500">No hay una fuente de pedidos disponible. No se muestran datos locales o simulados.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="bg-white/95 rounded-[30px] border border-slate-200/80 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.16)] p-5">
              <h3 className="text-lg font-extrabold text-slate-900 mb-3">Resumen de pedidos</h3>
              <p role="status" className="text-sm text-slate-600">La fuente de pedidos aún no está conectada. No se pueden actualizar estados ni guías desde este panel.</p>
            </div>
          </div>
        );

      case "inventory":
        return (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            <div className="lg:col-span-2 bg-white/95 rounded-[30px] border border-slate-200/80 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.16)] p-5">
              <h2 className="text-lg font-extrabold text-slate-900 mb-4">Inventario</h2>
              <p className="text-sm text-slate-600 mb-6">Gestiona los niveles de stock y revisa los productos con inventario bajo.</p>
              {LOW_STOCK.length > 0 ? (
                <div className="space-y-3">
                  {LOW_STOCK.map((item) => (
                    <div key={item.sku} className="rounded-3xl bg-amber-50 p-4 border border-amber-100">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p className="text-sm font-semibold text-slate-800">{item.name}</p>
                          <p className="text-xs text-slate-500">SKU: {item.sku}</p>
                        </div>
                        <span className="text-sm font-bold text-amber-700">{item.stock} en stock</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500">No hay productos con inventario bajo en este momento.</p>
              )}
            </div>
            <div className="bg-white/95 rounded-[30px] border border-slate-200/80 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.16)] p-5">
              <h3 className="text-lg font-extrabold text-slate-900 mb-3">Acciones de inventario</h3>
              <button onClick={() => handleSidebarClick('products')} className="w-full py-3 rounded-xl bg-black text-white font-semibold hover:bg-slate-900">Editar productos</button>
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
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="text-lg font-bold text-slate-900">Reportes</h2>
            <p role="status" className="mt-2 text-sm text-slate-600">
              No hay una fuente de pedidos ni pagos conectada. Las ventas, reembolsos y exportaciones estarán disponibles cuando exista esa integración.
            </p>
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
              <button onClick={refreshAudit} className="px-4 py-2 rounded-xl bg-black text-white font-semibold hover:bg-slate-900">Actualizar</button>
            </div>
            {auditEntries.length > 0 ? (
              <div className="space-y-3">
                {auditEntries.map((entry) => (
                  <div key={entry.id} className="rounded-3xl bg-slate-50 p-4">
                    <p className="text-sm font-semibold text-slate-800">{entry.action}</p>
                    <p className="text-xs text-slate-500">{new Date(entry.ts).toLocaleString('es-CO')}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">No hay actividad registrada aún.</p>
            )}
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
  };

  const validateImageFile = (file: File) => {
    const supportedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    const maxSizeBytes = 5 * 1024 * 1024;

    if (!supportedTypes.includes(file.type)) {
      return 'Formato no válido. Usa JPG, JPEG, PNG o WebP.';
    }

    if (file.size > maxSizeBytes) {
      return 'El archivo excede el límite de 5 MB.';
    }

    return null;
  };

  const cleanupStorageImage = async (url: string) => {
    const path = getStoragePathFromPublicUrl(url);
    if (!path) return;

    try {
      await deleteProductImage(path);
    } catch (err) {
      console.warn('No se pudo eliminar la imagen antigua en storage:', url, err);
    }
  };

  const handleImageFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validationError = validateImageFile(file);
    if (validationError) {
      setFormErrors((prev) => ({ ...prev, image: validationError }));
      toast.error(validationError);
      return;
    }

    setFormErrors((prev) => ({ ...prev, image: '' }));
    const previousImage = productForm.image;

    const reader = new FileReader();
    reader.onload = (event) => {
      setMainImagePreview(event.target?.result as string);
    };
    reader.readAsDataURL(file);

    setIsUploadingImage(true);
    try {
      const filePath = buildProductImagePath(file, 'products');
      const data = await uploadProductImage(file, filePath);
      const path = (data as any)?.path ?? (data as any)?.Key ?? filePath;
      const publicUrl = getPublicUrl(STORAGE_BUCKET, path);
      updateField('image', publicUrl as any);
      toast.success('Imagen cargada exitosamente');

      if (previousImage && previousImage !== publicUrl) {
        await cleanupStorageImage(previousImage);
      }
    } catch (err) {
      console.warn('Image upload failed', err);
      toast.error(err instanceof Error ? err.message : 'La carga de imágenes no está disponible.');
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleGalleryFilesChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;

    const uploadedUrls: string[] = [];
    const totalFiles = files.length;
    let uploadedCount = 0;

    setIsUploadingGallery(true);

    for (const file of Array.from(files)) {
      const validationError = validateImageFile(file);
      if (validationError) {
        toast.error(`Imagen ${file.name}: ${validationError}`);
        continue;
      }

      const filePath = buildProductImagePath(file, 'products');
      try {
        const data = await uploadProductImage(file, filePath);
        const path = (data as any)?.path ?? (data as any)?.Key ?? filePath;
        uploadedUrls.push(getPublicUrl(STORAGE_BUCKET, path) as string);
        uploadedCount++;
        if (uploadedCount % Math.ceil(totalFiles / 3) === 0 || uploadedCount === totalFiles) {
          toast.success(`Cargadas ${uploadedCount}/${totalFiles} imágenes`);
        }
      } catch (err) {
        console.warn(`Gallery image upload failed for ${file.name}`, err);
        toast.error(err instanceof Error ? err.message : 'La carga de imágenes no está disponible.');
      }
    }

    if (uploadedUrls.length > 0) {
      updateField('images', [...(productForm.images ?? []), ...uploadedUrls] as any);
      toast.success(`${uploadedUrls.length} imágenes cargadas a la galería`);
    }

    setIsUploadingGallery(false);
  };

  const addGalleryImageUrl = () => {
    const url = galleryUrl.trim();
    if (!url) return;
    updateField('images', [...(productForm.images ?? []), url] as any);
    setGalleryUrl("");
  };

  const removeGalleryImage = (index: number) => {
    updateField('images', (productForm.images ?? []).filter((_, i) => i !== index) as any);
  };

  return (
    <div className="flex pt-[88px] min-h-screen bg-slate-50">
      {/* Admin Sidebar — colored blue */}
      <aside className="w-56 shrink-0 bg-[#1e3a8a] fixed top-[88px] bottom-0 left-0 flex flex-col hidden md:flex z-40">
        <div className="p-4 border-b border-white/10">
          <p className="text-[10px] font-bold text-blue-200 uppercase tracking-widest">Panel de administración</p>
        </div>
        <nav className="p-2 flex-1 overflow-y-auto space-y-0.5">
          {visibleSidebarLinks.map((l) => (
            <button type="button" key={l.id} onClick={() => handleSidebarClick(l.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors ${adminSection === l.id ? "bg-white/15 text-white" : "text-blue-200 hover:text-white hover:bg-white/10"}`}>
              {l.icon} {l.label}
            </button>
          ))}
        </nav>
        <div className="p-4 border-t border-white/10">
          <button onClick={() => onNavigate("home")}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-blue-200 hover:text-white hover:bg-white/10 transition-colors">
            Ir a la tienda
          </button>
        </div>
      </aside>

      <main className="flex-1 min-w-0 md:ml-56 px-6 sm:px-8 lg:px-10 py-8 overflow-x-hidden">
        <div className="md:hidden mb-6">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <select value={adminSection} onChange={(e) => handleSidebarClick(e.target.value)} className="flex-1 rounded-3xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
                {visibleSidebarLinks.map((link) => (
                  <option key={link.id} value={link.id}>{link.label}</option>
                ))}
              </select>
              <button type="button" onClick={() => onNavigate("home")} className="whitespace-nowrap rounded-3xl bg-black px-4 py-3 text-sm font-semibold text-white hover:bg-slate-900">Tienda</button>
            </div>
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {visibleSidebarLinks.map((link) => (
                <button type="button" key={link.id} onClick={() => handleSidebarClick(link.id)} className={`rounded-full px-4 py-2 text-sm font-semibold ${adminSection === link.id ? 'bg-black text-white' : 'bg-slate-100 text-slate-700'}`}>
                  {link.label}
                </button>
              ))}
            </div>
          </div>
        </div>
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
  const [categoryOptions, setCategoryOptions] = useState<CategoryOption[]>([]);
  const [productRefresh, setProductRefresh] = useState(0);
  const [headerOffset, setHeaderOffset] = useState<number>(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const calcHeader = () => {
      const hdr = document.querySelector('div.fixed.top-0.left-0.right-0.z-50');
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

    const normalizeApiRoot = (url?: string) => {
      const trimmed = url?.trim().replace(/\/$/, '');
      if (!trimmed) return '/api';
      if (trimmed.endsWith('/api')) return trimmed;
      if (trimmed.endsWith('/api/v1')) return trimmed.replace(/\/v1$/, '');
      return `${trimmed}/api`;
    };

    const normalizeHomeContentResponse = (data: Record<string, unknown>): Partial<HomePageContent> => ({
      ...data,
      heroTitle: typeof data.hero_title === 'string' ? data.hero_title : typeof data.heroTitle === 'string' ? data.heroTitle : undefined,
      heroSubtitle: typeof data.hero_subtitle === 'string' ? data.hero_subtitle : typeof data.heroSubtitle === 'string' ? data.heroSubtitle : undefined,
      heroImage: typeof data.hero_image === 'string' ? data.hero_image : typeof data.heroImage === 'string' ? data.heroImage : undefined,
      featuredCategoryIds: typeof data.featured_category_ids === 'string' ? data.featured_category_ids : typeof data.featuredCategoryIds === 'string' ? data.featuredCategoryIds : undefined,
      featuredProductIds: typeof data.featured_product_ids === 'string' ? data.featured_product_ids : typeof data.featuredProductIds === 'string' ? data.featuredProductIds : undefined,
      discountedProductIds: typeof data.discounted_product_ids === 'string' ? data.discounted_product_ids : typeof data.discountedProductIds === 'string' ? data.discountedProductIds : undefined,
      promoBanner: typeof data.promo_banner === 'string' ? data.promo_banner : typeof data.promoBanner === 'string' ? data.promoBanner : undefined,
      newsletterEnabled: typeof data.newsletter_enabled === 'boolean' ? data.newsletter_enabled : typeof data.newsletterEnabled === 'boolean' ? data.newsletterEnabled : undefined,
    });

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
  const [filterCategory, setFilterCategory] = useState<Category | null>(null);
  const [cart, setCart] = useState<StorefrontCartLine[]>([]);
  const [unavailableCartItems, setUnavailableCartItems] = useState<GuestCartItem[]>([]);
  const [cartRestoreComplete, setCartRestoreComplete] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);

  useEffect(() => {
    if (productsStatus !== "ready" || cartRestoreComplete) return;

    const currentProducts = new Map(products.map((product) => [product.id, product]));
    const restoredItems: StorefrontCartLine[] = [];
    const unresolvedItems: GuestCartItem[] = [];

    for (const entry of loadStoredCartEntries()) {
      const product = currentProducts.get(entry.productId);
      const sizeUnavailable = entry.selectedSize && entry.selectedSize !== "Talla única" && !product?.sizes.includes(entry.selectedSize);
      const colorUnavailable = entry.selectedColor && !product?.colors.some((color) => color.name === entry.selectedColor);

      if (!product || sizeUnavailable || colorUnavailable) {
        unresolvedItems.push(entry);
        continue;
      }

      restoredItems.push({
        product,
        qty: entry.quantity,
        selectedSize: entry.selectedSize ?? "Talla única",
        selectedColor: entry.selectedColor ?? "",
      });
    }

    setCart(restoredItems);
    setUnavailableCartItems(unresolvedItems);
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
      setView(getInitialView());
      setInitialAdminSection(getInitialAdminSection());
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

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
      navigate("admin-login");
      return;
    }
    if (isAdmin && view === "admin-login") {
      navigate("admin");
      return;
    }
    if (!isAdmin && view === "account") {
      // allow account for normal users only
      return;
    }
  }, [view, isAdmin, authReady]);

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
    try {
      const record = mapAppProductToProductRecord({ ...product, id: crypto.randomUUID() });
      const adminPayload: Record<string, unknown> = {
        slug: record.slug ?? undefined,
        name: record.name,
        price: record.price,
        description: record.description,
        sku: record.sku,
        stock: record.stock,
        category_id: record.category_id && /^[0-9a-fA-F-]{36}$/.test(record.category_id) ? record.category_id : undefined,
        compare_at_price: record.original_price ?? undefined,
        is_active: true,
      };

      if (!adminPayload.category_id) {
        throw new Error('Selecciona una categoría válida.');
      }

      const created = await createProductViaAdminApi(adminPayload);
      const createdAppProduct = mapProductRecordToAppProduct(created);
      refreshProducts();
      toast.success("Producto creado y guardado correctamente.");
      try { recordAction('create_product', { id: createdAppProduct.id, name: createdAppProduct.name }); } catch (e) { }
      return;
    } catch (err) {
      console.error("Backend create product failed:", err);
      toast.error("Error creando producto. Intenta nuevamente.");
    }
  };

  const updateProduct = async (productId: string, updates: Partial<Product>) => {
    try {
      const productToUpdate = products.find((product) => product.id === productId);
      if (!productToUpdate) {
        throw new Error('Producto no encontrado');
      }
      const record = mapAppProductToProductRecord({ ...productToUpdate, ...updates, id: productId });
      const { id: _ignoredId, ...recordUpdates } = record;
      const adminUpdates: Record<string, unknown> = {
        ...recordUpdates,
        category_id: recordUpdates.category_id ?? recordUpdates.category ?? undefined,
        compare_at_price: record.original_price ?? undefined,
      };

      if (!adminUpdates.category_id && (updates.category ?? productToUpdate.category)) {
        adminUpdates.category = updates.category ?? productToUpdate.category;
      }

      const updated = await updateProductViaAdminApi(productId, adminUpdates);
      const updatedAppProduct = mapProductRecordToAppProduct(updated);
      refreshProducts();
      toast.success("Producto actualizado correctamente.");
      try { recordAction('update_product', { id: updatedAppProduct.id, name: updatedAppProduct.name }); } catch (e) { }
      return;
    } catch (err) {
      console.error("Backend update failed:", err);
      toast.error("Error actualizando producto. Intenta nuevamente.");
    }
  };

  const deleteProduct = async (productId: string) => {
    try {
      await deleteProductViaAdminApi(productId);
      refreshProducts();
      toast.success("Producto eliminado correctamente.");
      try { recordAction('delete_product', { id: productId }); } catch (e) { }
      return;
    } catch (err) {
      console.error("Backend delete failed:", err);
      toast.error("Error eliminando producto. Intenta nuevamente.");
    }
  };

  const adjustStock = async (productId: string, delta: number) => {
    try {
      await adminApi.createInventoryMovement(productId, delta, 'adjustment');
      refreshProducts();
      try { recordAction('inventory_movement', { id: productId, delta }); } catch (e) { }
      return;
    } catch (err) {
      console.error('Backend inventory movement failed:', err);
      toast.error('Error ajustando inventario. Intenta nuevamente.');
    }
  };

  const navigate = (v: View) => {
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
          privacy: "/politica-de-privacidad",
          terms: "/terminos-y-condiciones",
          shipping: "/envios",
          returns: "/cambios-y-devoluciones",
          contact: "/contacto",
        };
        url.pathname = routePaths[v];
        url.searchParams.delete("view");
        if (v !== "admin") url.searchParams.delete("adminSection");
        window.history.pushState({}, "", `${url.pathname}${url.search}${url.hash}`);
      }

      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('navigate failed', err, v);
    }
  };

  const handleSelectProduct = (p: Product) => {
    setSelectedProduct(p);
    navigate("product");
  };

  const handleCategorySelect = (cat: Category | null) => {
    setFilterCategory(cat);
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
        <HomePage
          onNavigate={navigate} onSelectProduct={handleSelectProduct}
          onAddToCart={handleAddToCart} onCategorySelect={handleCategorySelect}
          content={homeContent}
          products={products}
          categories={categoryOptions}
          featuredProducts={homePreviewProducts}
          newArrivalsProducts={homeNewArrivals}
          saleProducts={homeSaleProducts}
          productsStatus={productsStatus}
          onRetryProducts={refreshProducts}
        />
      )}
      {view === "catalog" && (
        <CatalogPage
          products={products}
          categories={categoryOptions}
          filterCategory={filterCategory}
          onSelectProduct={handleSelectProduct}
          onAddToCart={handleAddToCart}
          onNavigate={navigate}
          onCategorySelect={handleCategorySelect}
          productsStatus={productsStatus}
          onRetryProducts={refreshProducts}
        />
      )}
      {view === "product" && selectedProduct && (
        <ProductDetailPage
          product={selectedProduct}
          products={products}
          onBack={() => navigate("catalog")}
          onAddToCart={handleAddToCart}
          onNavigate={navigate}
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
        />
      )}
      {view === "login" && <LoginPage isRegister={false} onNavigate={navigate} onLogin={handleAuthSuccess} />}
      {view === "register" && <LoginPage isRegister={true} onNavigate={navigate} onLogin={handleAuthSuccess} />}
      {view === "admin-login" && <LoginPage isRegister={false} onNavigate={navigate} onLogin={handleAuthSuccess} />}
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
          products={products}
          categories={categoryOptions}
          createProduct={createProduct}
          updateProduct={updateProduct}
          deleteProduct={deleteProduct}
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

