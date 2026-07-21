import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import type { User } from '@supabase/supabase-js';
import {
  ShoppingCart, Search, Menu, X, Star, ChevronRight, Package,
  Users, TrendingUp, AlertTriangle, Check, Eye, EyeOff,
  Bell, LogOut, Plus, Minus, Trash2, MapPin, CreditCard, Shield,
  Truck, ChevronLeft, Heart, ArrowRight, Filter,
  BarChart2, Home, Settings, Tag, Layers, Edit,
  RefreshCw, Award, Grid3X3, ThumbsUp, DollarSign
} from "lucide-react";
import PromoCarousel from "./components/PromoCarousel";
import ProductCarousel from "./components/ProductCarousel";
import promoBanner from "/images/promo-discount-10.png";
import mainBannerImage from "../../10%/Promocion 10%.png";
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
import { fetchProductsFromSupabase, type ProductRecord } from "../lib/supabase-store";
import { createProductWithFallback, deleteProductWithFallback, updateProductWithFallback } from "../lib/admin-product-fallback";
import {
  signInWithEmail,
  signUpWithEmail,
  signOut,
  getCurrentUser,
  onAuthStateChange,
  isAdminUser,
} from "../lib/supabase-auth";

import adminApi, { createSupabaseProductApi, updateSupabaseProductApi, deleteSupabaseProductApi, updateHomeContentApi } from "../lib/admin-api";
import { uploadProductImage, getPublicUrl } from "../lib/supabase-store";
import { recordAction, getAudit } from "../lib/audit";
import { productSchema } from '../lib/schemas';
import Toaster from './components/LazyToaster';
import { toast } from '../lib/lazyToast';

// ─── TYPES ───────────────────────────────────────────────────────────────────

type View =
  | "home" | "catalog" | "product" | "checkout"
  | "login" | "register" | "account" | "admin";

type Category =
  | "Zapatos" | "Ropa Hombre" | "Ropa Mujer" | "Perfumes" | "Relojes" | "Gafas";

interface Product {
  id: string; name: string; brand: string; price: number;
  originalPrice?: number; discount?: number; rating: number; reviews: number;
  image: string; category: Category; subcategory: string;
  stock: number; sku: string; description: string;
  colors: { name: string; hex: string }[];
  sizes: string[];
  images?: string[];
  gender?: "Hombre" | "Mujer" | "Unisex";
  isNew?: boolean; isFeatured?: boolean; specs?: string[];
}

interface CartItem {
  product: Product; qty: number; selectedSize: string; selectedColor: string;
}

interface Address {
  id: string;
  label: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  phone: string;
  isDefault?: boolean;
}

interface HomePageContent {
  heroTitle: string;
  heroSubtitle: string;
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

const DEFAULT_ADDRESSES: Address[] = [
  {
    id: "addr-1",
    label: "Casa",
    line1: "Cra 15 #82-56",
    line2: "Apto 402",
    city: "Bogotá",
    state: "Cundinamarca",
    postalCode: "110221",
    country: "Colombia",
    phone: "+57 311 234 5678",
    isDefault: true,
  },
  {
    id: "addr-2",
    label: "Oficina",
    line1: "Av. El Dorado #68B-31",
    city: "Bogotá",
    state: "Cundinamarca",
    postalCode: "111071",
    country: "Colombia",
    phone: "+57 312 876 5432",
  },
];

const loadStoredAddresses = (): Address[] => {
  if (typeof window === "undefined") return DEFAULT_ADDRESSES;

  try {
    const stored = window.localStorage.getItem(LOCAL_ADDRESS_STORAGE);
    if (!stored) return DEFAULT_ADDRESSES;

    const parsed = JSON.parse(stored) as Address[];
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_ADDRESSES;

    return parsed.map((address) => ({
      ...address,
      isDefault: address.isDefault ?? false,
    }));
  } catch (error) {
    console.warn("Error cargando direcciones desde localStorage.", error);
    return DEFAULT_ADDRESSES;
  }
};

const mapProductRecordToAppProduct = (record: ProductRecord): Product => ({
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
  category: record.category as Category,
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
  images: product.images ?? [],
  category: (product.category ?? "Zapatos") as string,
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


const NAV_CATEGORIES: { name: Category }[] = [
  { name: "Zapatos" },
  { name: "Ropa Hombre" },
  { name: "Ropa Mujer" },
  { name: "Perfumes" },
  { name: "Relojes" },
  { name: "Gafas" },
];

const CATEGORY_SUBCATEGORIES: Record<Category, string[]> = {
  Zapatos: ["Running", "Casual", "Gym y training", "Training", "Trail"],
  "Ropa Hombre": ["Buzos y hoodies", "Pantalones", "Camisetas", "Shorts"],
  "Ropa Mujer": ["Leggings", "Tops", "Sudaderas", "Shorts"],
  Perfumes: ["Hombre", "Mujer", "Unisex"],
  Relojes: ["Smartwatch Running", "Deportivo", "Casual"],
  Gafas: ["Running", "Ciclismo", "Outdoor", "Casual"],
};

const HOME_CATEGORIES = [
  { name: "Zapatos", sub: "Running · Training · Casual", image: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=500&h=380&fit=crop&auto=format" },
  { name: "Ropa Hombre", sub: "Camisetas · Buzos · Pantalones", image: "https://images.unsplash.com/photo-1556821840-3a63f15732ce?w=500&h=380&fit=crop&auto=format" },
  { name: "Ropa Mujer", sub: "Leggings · Tops · Conjuntos", image: "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=500&h=380&fit=crop&auto=format" },
  { name: "Perfumes", sub: "Hombre · Mujer · Unisex", image: "https://images.unsplash.com/photo-1541643600914-78b084683702?w=500&h=380&fit=crop&auto=format" },
  { name: "Relojes", sub: "Smartwatch · Deportivo · Casual", image: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=500&h=380&fit=crop&auto=format" },
  { name: "Gafas", sub: "Running · Ciclismo · Outdoor", image: "https://images.unsplash.com/photo-1577803645773-f96470509666?w=500&h=380&fit=crop&auto=format" },
];

const SALES_DATA = [
  { day: "Lun", ventas: 3820000, pedidos: 32 },
  { day: "Mar", ventas: 4450000, pedidos: 41 },
  { day: "Mié", ventas: 3100000, pedidos: 27 },
  { day: "Jue", ventas: 5680000, pedidos: 52 },
  { day: "Vie", ventas: 7230000, pedidos: 68 },
  { day: "Sáb", ventas: 9500000, pedidos: 87 },
  { day: "Dom", ventas: 6410000, pedidos: 59 },
];

const CAT_DATA = [
  { name: "Zapatos", valor: 42 },
  { name: "Ropa H.", valor: 20 },
  { name: "Ropa M.", valor: 18 },
  { name: "Relojes", valor: 11 },
  { name: "Perfumes", valor: 9 },
];

const ORDERS = [
  { id: "#US-3194", customer: "Valentina Torres", date: "14 Jul 2026", status: "Enviado", total: 899900, items: 1 },
  { id: "#US-3193", customer: "Diego Martínez", date: "14 Jul 2026", status: "Procesando", total: 449900, items: 1 },
  { id: "#US-3192", customer: "Camila Rodríguez", date: "13 Jul 2026", status: "Entregado", total: 779800, items: 2 },
  { id: "#US-3191", customer: "Santiago Gómez", date: "13 Jul 2026", status: "Entregado", total: 219900, items: 1 },
  { id: "#US-3190", customer: "Mariana López", date: "12 Jul 2026", status: "Cancelado", total: 399900, items: 1 },
];

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
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold tracking-wide ${cls}`}>
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
    primary:   "bg-black text-white hover:bg-slate-900 active:scale-[0.98] shadow-sm shadow-slate-800",
    secondary: "bg-slate-100 text-slate-700 hover:bg-slate-200",
    outline:   "border-2 border-black text-black hover:bg-slate-100",
    ghost:     "text-slate-500 hover:text-slate-800 hover:bg-slate-100",
    danger:    "bg-red-50 text-red-600 border border-red-200 hover:bg-red-100",
  };
  return (
    <button
      type={type} onClick={onClick} disabled={disabled}
      className={`${base} ${sizes[size]} ${variants[variant]} ${disabled ? "opacity-40 cursor-not-allowed" : ""} ${className}`}
    >
      {children}
    </button>
  );
}

function ColorSelector({ colors, selected, onSelect }: {
  colors: { name: string; hex: string }[]; selected: string; onSelect: (c: string) => void;
}) {
  if (!colors.length) return null;
  return (
    <div className="flex items-center gap-2">
      {colors.map((c) => (
        <button
          key={c.name} onClick={() => onSelect(c.name)} title={c.name}
          className={`w-7 h-7 rounded-full border-2 transition-transform ${
            selected === c.name ? "border-[#1d4ed8] scale-110" : "border-transparent hover:scale-105"
          }`}
          style={{ backgroundColor: c.hex, boxShadow: "0 0 0 1px rgba(0,0,0,0.12)" }}
        />
      ))}
      {selected && <span className="text-xs text-slate-500 ml-1">{selected}</span>}
    </div>
  );
}

function SizeSelector({ sizes, selected, onSelect }: {
  sizes: string[]; selected: string; onSelect: (s: string) => void;
}) {
  if (!sizes.length || sizes[0] === "Talla única") {
    return <span className="text-sm text-slate-500">Talla única</span>;
  }
  return (
    <div className="flex flex-wrap gap-2">
      {sizes.map((s) => (
        <button
          key={s} onClick={() => onSelect(s)}
          className={`min-w-[44px] px-3 py-1.5 rounded-lg text-sm font-semibold border-2 transition-all ${
            selected === s
              ? "border-[#1d4ed8] bg-[#1d4ed8] text-white"
              : "border-slate-200 text-slate-600 hover:border-[#1d4ed8] hover:text-[#1d4ed8]"
          }`}
        >
          {s}
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
  const autoScrollInterval = useRef<NodeJS.Timeout | null>(null);

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
      className="overflow-hidden pb-4 -mx-4 px-4 sm:px-0 cursor-grab active:cursor-grabbing"
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
    <div
      onClick={() => onSelect(product)}
      className="group relative w-full max-w-full h-full bg-white rounded-[20px] sm:rounded-[30px] overflow-hidden cursor-pointer border border-slate-200/80 shadow-[0_15px_40px_-28px_rgba(15,23,42,0.35)] hover:-translate-y-1 hover:shadow-[0_20px_60px_-30px_rgba(15,23,42,0.45)] transition-all duration-300 flex flex-col"
    >
      {/* Image */}
      <div className="relative h-44 sm:h-56 bg-slate-100 overflow-hidden">
        <img src={product.image} alt={product.name}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
        />
        {/* Badges */}
        <div className="absolute top-3 left-3 flex flex-col gap-1.5">
          {product.discount && <Badge variant="sale">-{product.discount}%</Badge>}
          {product.isNew && !product.discount && <Badge variant="new">Nuevo</Badge>}
          {product.stock <= 10 && <Badge variant="low">Pocas</Badge>}
        </div>
        {/* Wishlist */}
        <button
          onClick={(e) => { e.stopPropagation(); setWished(!wished); }}
          className="absolute top-3 right-3 w-10 h-10 rounded-full bg-white/95 backdrop-blur flex items-center justify-center shadow-md hover:bg-white transition-colors"
        >
          <Heart size={15} className={wished ? "fill-red-500 text-red-500" : "text-slate-400"} />
        </button>
      </div>

      {/* Info */}
      <div className="p-4 sm:p-5 space-y-3 sm:space-y-4 flex flex-col flex-1">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-[#1d4ed8] mb-2">{product.brand}</p>
          <h3 className="text-sm sm:text-base font-extrabold text-slate-900 line-clamp-2 leading-snug">{product.name}</h3>
          <p className="text-sm text-slate-500 mt-1">{product.subcategory}{product.gender ? ` · ${product.gender}` : ""}</p>
        </div>
        <StarRating rating={product.rating} reviews={product.reviews} />

        {product.colors.length > 0 && (
          <div className="flex gap-2">
            {product.colors.slice(0, 4).map((c) => (
              <div key={c.name} className="w-4 h-4 rounded-full border border-slate-200" style={{ backgroundColor: c.hex }} title={c.name} />
            ))}
            {product.colors.length > 4 && <span className="text-xs text-slate-400">+{product.colors.length - 4}</span>}
          </div>
        )}

        <div className="flex items-baseline gap-3">
          <span className="text-lg font-extrabold text-slate-900">{fmt(product.price)}</span>
          {product.originalPrice && (
            <span className="text-xs text-slate-400 line-through">{fmt(product.originalPrice)}</span>
          )}
        </div>
        {savings > 0 && <p className="text-xs text-emerald-600 font-semibold -mt-1">Ahorras {fmt(savings)}</p>}

        <button
          onClick={(e) => { e.stopPropagation(); onAddToCart(product, defaultSize, defaultColor); }}
          className="mt-auto w-full py-2.5 sm:py-3 rounded-full text-xs sm:text-sm font-bold bg-black text-white hover:bg-slate-900 transition-all duration-200 flex items-center justify-center gap-2 shadow-sm shadow-slate-200"
        >
          <ShoppingCart size={14} /> Agregar al carrito
        </button>
      </div>
    </div>
  );
}

// ─── NAVBAR ──────────────────────────────────────────────────────────────────

function Navbar({ cart, onNavigate, onCartOpen, isLoggedIn, isAdmin, authUser, currentView, onLoginClick, onLogout, onCategorySelect, onSelectProduct, products }: {
  cart: CartItem[]; onNavigate: (v: View) => void;
  onCartOpen: () => void; isLoggedIn: boolean; isAdmin: boolean;
  authUser: User | null; currentView: View; onLoginClick: () => void; onLogout: () => void;
  onCategorySelect: (c: Category | null) => void;
  onSelectProduct?: (p: Product) => void;
  products: Product[];
}) {
  const [userOpen, setUserOpen] = useState(false);
  const [searchVal, setSearchVal] = useState("");
  const [suggestions, setSuggestions] = useState<Product[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestTimer = useRef<number | null>(null);
  const cartCount = cart.reduce((s, i) => s + i.qty, 0);
  const showCustomerOrders = !isAdmin && !isAdminUser(authUser);
  const [promoEntered, setPromoEntered] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setPromoEntered(true));
    return () => cancelAnimationFrame(frame);
  }, []);

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
        {/* Announce Bar (carousel) */}
        <PromoCarousel
          variant="marquee"
          intervalMs={7800}
          messages={[
            "Envíos gratis a toda Colombia por compras superiores a $299.999",
            "Aceptamos todos los medios de pago: Tarjeta de crédito, débito y PSE. ¡Compra 100% segura!",
            "Soporte y atención al cliente las 24 horas",
          ]}
        />

        {/* Main Navbar */}
        <nav className="bg-white border-b border-slate-100 shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-4">
            {/* Logo */}
            <button onClick={() => onNavigate("home")} className="flex items-center gap-2 shrink-0">
              <span className="text-xl sm:text-[2.1rem] font-extrabold text-slate-900 tracking-tight leading-none">
                Urban<span className="text-[#1d4ed8]">Sport</span>
                <span className="block text-[12px] sm:text-[13px] font-semibold text-slate-400 tracking-widest uppercase">Store</span>
              </span>
            </button>

            {/* Search */}
            {/* Desktop search */}
            <div className="flex-1 max-w-xl hidden sm:flex relative">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={searchVal} onChange={(e) => setSearchVal(e.target.value)}
                placeholder="Buscar zapatillas, ropa, relojes…"
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:border-[#1d4ed8]/50 focus:bg-white transition-all"
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 180)}
              />

              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute left-0 right-0 mt-2 bg-white border border-slate-100 rounded-xl shadow-lg z-50 max-h-60 overflow-auto">
                  {suggestions.map((s) => (
                    <button key={s.id} onMouseDown={(e) => { e.preventDefault(); onSelectProduct(s); setSearchVal(''); setSuggestions([]); }}
                      className="w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors">
                      <div className="text-sm font-semibold">{s.name}</div>
                      <div className="text-xs text-slate-400">{s.brand} · {s.subcategory}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Mobile search (visible on xs) */}
            <div className="flex-1 sm:hidden">
              <div className="relative">
                <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={searchVal} onChange={(e) => setSearchVal(e.target.value)}
                  placeholder="Buscar zapatillas, ropa, relojes…"
                  className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 placeholder-slate-400 focus:outline-none"
                  onFocus={() => setShowSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 180)}
                />

                {showSuggestions && suggestions.length > 0 && (
                  <div className="absolute left-0 right-0 mt-2 bg-white border border-slate-100 rounded-xl shadow-lg z-50 max-h-60 overflow-auto">
                    {suggestions.map((s) => (
                      <button key={s.id} onMouseDown={(e) => { e.preventDefault(); onSelectProduct(s); setSearchVal(''); setSuggestions([]); }}
                        className="w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors">
                        <div className="text-sm font-semibold">{s.name}</div>
                        <div className="text-xs text-slate-400">{s.brand} · {s.subcategory}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 ml-auto">
              <button
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
                        {isAdmin && (
                          <button type="button" onClick={() => { onNavigate("admin"); setUserOpen(false); }}
                            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-50 transition-colors">
                            <BarChart2 size={14} /> Panel admin
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
        </nav>
      </div>

      {(currentView === "home" || currentView === "catalog") && (
        <div className="w-full bg-transparent" style={{ marginTop: typeof headerOffset === 'number' && headerOffset > 0 ? `${headerOffset}px` : undefined }}>
          <div className="w-full py-0">
            <button
              type="button"
              onClick={() => onNavigate('catalog')}
              aria-label="Ver promociones y productos con descuento"
              className={[
                'block w-full overflow-hidden bg-transparent rounded-none',
                'transition-transform duration-700 ease-out',
                'motion-reduce:transform-none motion-reduce:transition-none',
                promoEntered ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2',
              ].join(' ')}
            >
              <div className="relative w-full bg-gradient-to-b from-gray-50 to-gray-100 flex items-start justify-center px-0 py-0">
                <img
                  src={promoBanner}
                  alt="Promoción Urban Sport Store"
                  loading="lazy"
                  className="w-full max-w-full h-auto object-contain object-top"
                />
              </div>
            </button>
          </div>

          <div className="overflow-x-auto mt-6">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 hidden md:flex items-center justify-center gap-1 h-9">
              {NAV_CATEGORIES.map((cat) => (
                <button key={cat.name}
                  onClick={() => onCategorySelect(cat.name)}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-semibold text-slate-600 hover:text-[#1d4ed8] hover:bg-blue-50 transition-colors whitespace-nowrap">
                  {cat.name}
                </button>
              ))}
            </div>
          </div>

          <div className="md:hidden overflow-x-auto mt-6">
            <div className="max-w-7xl mx-auto px-3 flex items-center gap-1 h-9"> 
              {NAV_CATEGORIES.map((cat) => (
                <button key={cat.name}
                  onClick={() => onCategorySelect(cat.name)}
                  className="flex items-center gap-1.5 px-4 h-9 rounded-lg text-sm font-semibold text-slate-600 hover:text-[#1d4ed8] hover:bg-blue-50 transition-colors whitespace-nowrap">
                  {cat.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── CART DRAWER ──────────────────────────────────────────────────────────────

function CartDrawer({ cart, onClose, onUpdate, onRemove, onCheckout }: {
  cart: CartItem[]; onClose: () => void;
  onUpdate: (id: string, size: string, qty: number) => void;
  onRemove: (id: string, size: string) => void;
  onCheckout: () => void;
}) {
  const subtotal = cart.reduce((s, i) => s + i.product.price * i.qty, 0);
  const shipping = subtotal >= 250000 ? 0 : 15900;
  const total = subtotal + shipping;

  return (
    <>
      <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white z-50 flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <ShoppingCart size={18} className="text-[#1d4ed8]" />
            <h2 className="text-base font-bold text-slate-900">Mi carrito</h2>
            <span className="text-sm text-slate-400">({cart.reduce((s, i) => s + i.qty, 0)} artículos)</span>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
              <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center">
                <ShoppingCart size={28} className="text-slate-400" />
              </div>
              <p className="text-slate-500 text-sm">Tu carrito está vacío</p>
              <Btn variant="outline" onClick={onClose}>Explorar productos</Btn>
            </div>
          ) : (
            cart.map((item) => (
              <div key={`${item.product.id}-${item.selectedSize}`}
                className="flex gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                <img src={item.product.image} alt={item.product.name}
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
                  <p className="text-sm font-extrabold text-slate-900 mt-1">{fmt(item.product.price)}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden bg-white">
                      <button onClick={() => onUpdate(item.product.id, item.selectedSize, item.qty - 1)}
                        className="w-7 h-7 flex items-center justify-center text-slate-500 hover:bg-slate-100 transition-colors">
                        <Minus size={12} />
                      </button>
                      <span className="w-7 text-center text-sm font-bold text-slate-800">{item.qty}</span>
                      <button onClick={() => onUpdate(item.product.id, item.selectedSize, item.qty + 1)}
                        className="w-7 h-7 flex items-center justify-center text-slate-500 hover:bg-slate-100 transition-colors">
                        <Plus size={12} />
                      </button>
                    </div>
                    <button onClick={() => onRemove(item.product.id, item.selectedSize)}
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {cart.length > 0 && (
          <div className="px-5 py-4 border-t border-slate-100 space-y-3">
            {subtotal < 250000 && (
              <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-xl text-xs text-blue-700 font-medium">
                <Truck size={14} /> Agrega {fmt(250000 - subtotal)} más para envío gratis
              </div>
            )}
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between text-slate-500">
                <span>Subtotal</span><span className="font-semibold text-slate-800">{fmt(subtotal)}</span>
              </div>
              <div className="flex justify-between text-slate-500">
                <span>Envío</span>
                <span className={shipping === 0 ? "text-emerald-600 font-bold" : "font-semibold text-slate-800"}>
                  {shipping === 0 ? "Gratis" : fmt(shipping)}
                </span>
              </div>
              <div className="flex justify-between font-extrabold text-slate-900 text-base border-t border-slate-100 pt-1.5">
                <span>Total</span><span>{fmt(total)} COP</span>
              </div>
            </div>
            <Btn variant="primary" className="w-full" size="lg" onClick={onCheckout}>
              Ir al pago <ArrowRight size={16} />
            </Btn>
            <div className="flex items-center justify-center gap-4 text-xs text-slate-400">
              <span className="flex items-center gap-1"><Shield size={11} /> Pago seguro</span>
              <span className="flex items-center gap-1"><RefreshCw size={11} /> 30 días devolución</span>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ─── HOME PAGE ────────────────────────────────────────────────────────────────

function HomePage({ onNavigate, onSelectProduct, onAddToCart, onCategorySelect, content, featuredProducts, newArrivalsProducts, saleProducts }: {
  onNavigate: (v: View) => void; onSelectProduct: (p: Product) => void;
  onAddToCart: (p: Product, size: string, color: string) => void;
  onCategorySelect: (c: Category) => void;
  content: HomePageContent;
  featuredProducts: Product[];
  newArrivalsProducts: Product[];
  saleProducts: Product[];
}) {
  const featured = featuredProducts;
  const newArrivals = newArrivalsProducts;
  const onSale = saleProducts;
  // Ensure carousel has enough items to scroll — duplicate if list is short
  const arrivalsForCarousel = (() => {
    const base = newArrivals.slice(0, 9);
    if (base.length === 0) return base;
    let arr = [...base];
    while (arr.length < 6) arr = arr.concat(base);
    return arr.slice(0, 9);
  })();

  return (
    <main className="pt-[100px] md:pt-[100px]">
      {/* Main promotional banner */}
      <section className="relative w-full overflow-hidden bg-gradient-to-br from-slate-900 to-slate-950">
        <div className="relative w-full aspect-video md:aspect-auto md:min-h-[480px] flex items-center justify-center overflow-hidden">
          <img
            src={mainBannerImage}
            alt="Oferta especial Urban Sport Store"
            className="absolute inset-0 w-full h-full object-cover object-center"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-slate-900/40 via-slate-900/20 to-transparent" />
          <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 md:px-8 py-6 sm:py-10 w-full flex items-center">
            <div className="max-w-xl">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-orange-500/20 border border-orange-400/40 text-orange-300 text-xs sm:text-sm font-bold tracking-widest uppercase mb-3 sm:mb-4 whitespace-nowrap">
                <Award size={14} /> Oferta especial
              </div>
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-white leading-tight tracking-tight mb-3 sm:mb-4">Descuentos exclusivos</h2>
              <p className="text-sm sm:text-base md:text-lg text-slate-200 leading-relaxed mb-6 max-w-md">
                Aprovecha nuestras promociones especiales en ropa, calzado y accesorios deportivos premium.
              </p>
              <Btn variant="primary" size="lg" onClick={() => onNavigate("catalog")} className="w-full sm:w-auto justify-center">
                Explorar oferta <ArrowRight size={16} />
              </Btn>
            </div>
          </div>
        </div>
      </section>

      {/* Hero */}
      <section className="relative min-h-[48vh] md:min-h-[44vh] flex items-center justify-center overflow-hidden bg-slate-900">
        <img
          src="https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?w=1600&h=900&fit=crop&auto=format"
          alt="Atleta en acción" className="absolute inset-0 w-full h-full object-contain object-center md:object-center"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-slate-900/98 via-slate-900/70 to-slate-900/30 md:from-slate-900/95 md:via-slate-900/60 md:to-slate-900/20" />

        <div className="relative z-10 max-w-7xl mx-auto px-3 sm:px-4 md:px-6 py-6 sm:py-8 md:py-10 w-full">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#f97316]/20 border border-[#f97316]/30 text-[#f97316] text-[10px] sm:text-xs font-bold tracking-widest uppercase mb-3 sm:mb-4 whitespace-nowrap">
              <Award size={12} /> Colección 2026
            </div>
            <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-6xl font-extrabold text-white leading-tight tracking-tight mb-3 sm:mb-4">{content.heroTitle}</h1>
            <p className="text-sm sm:text-base md:text-lg text-slate-300 leading-relaxed mb-6 max-w-md">
              {content.heroSubtitle}
            </p>
            <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
              <Btn variant="primary" size="lg" onClick={() => onNavigate("catalog")} className="w-full sm:w-auto justify-center">
                Comprar ahora <ArrowRight size={16} />
              </Btn>
              <button onClick={() => onNavigate("catalog")}
                className="px-6 py-3.5 text-sm sm:text-base font-bold text-white border-2 border-white/30 rounded-xl hover:bg-white/10 transition-all">
                Ver novedades
              </button>
            </div>
          </div>
        </div>

      </section>

      {/* Categories grid */}
      <section className="pt-8 sm:pt-10 md:pt-12 pb-2 sm:pb-3 md:pb-4 max-w-7xl mx-auto px-3 sm:px-4 md:px-6">
        <div className="flex items-end justify-between mb-6 sm:mb-8">
          <div>
            <p className="text-[10px] sm:text-xs font-bold text-[#1d4ed8] tracking-widest uppercase mb-1 sm:mb-1.5">{content.categorySectionLabel}</p>
            <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900">{content.categorySectionTitle}</h2>
          </div>
        </div>
        <ProductCarousel>
          {HOME_CATEGORIES.map((cat) => (
            <div key={cat.name} className="w-[84vw] max-w-[280px] sm:w-[16rem] lg:w-[20rem] shrink-0 snap-start">
              <button
                onClick={() => onCategorySelect(cat.name as Category)}
                className="group relative rounded-2xl sm:rounded-3xl overflow-hidden aspect-[4/3] w-full bg-slate-200 hover:shadow-lg transition-all duration-300">
                <img src={cat.image} alt={cat.name} className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 via-slate-900/20 to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-2 sm:p-3">
                  <p className="text-[11px] sm:text-xs font-extrabold text-white leading-tight">{cat.name}</p>
                  <p className="text-[8px] sm:text-[9px] text-slate-300">{cat.sub}</p>
                </div>
              </button>
            </div>
          ))}
        </ProductCarousel>
      </section>

      {/* Featured */}
      <section className="py-8 sm:py-12 md:py-16 max-w-7xl mx-auto px-3 sm:px-4 md:px-6">
        <div className="flex items-end justify-between mb-6 sm:mb-8 gap-4">
          <div>
            <p className="text-[10px] sm:text-xs font-bold text-[#1d4ed8] tracking-widest uppercase mb-1 sm:mb-1.5">{content.featuredSectionLabel}</p>
            <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900">{content.featuredSectionTitle}</h2>
          </div>
          <Btn variant="ghost" onClick={() => onNavigate("catalog")} className="hidden sm:flex">Ver todos <ChevronRight size={14} /></Btn>
        </div>
        <ProductCarousel>
            {featured.slice(0, 9).map((p) => (
            <div key={p.id} className="w-[84vw] max-w-[280px] sm:w-[16rem] lg:w-[18rem] shrink-0">
              <ProductCard product={p} onSelect={onSelectProduct} onAddToCart={onAddToCart} />
            </div>
          ))}
        </ProductCarousel>
        <Btn variant="ghost" onClick={() => onNavigate("catalog")} className="sm:hidden w-full mt-6">Ver todos <ChevronRight size={14} /></Btn>
      </section>

      {/* Promo banners */}
      <section className="py-8 sm:py-12 md:py-16 max-w-7xl mx-auto px-3 sm:px-4 md:px-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-5">
          {/* Hombre */}
          <div className="relative rounded-2xl sm:rounded-[32px] overflow-hidden h-40 sm:h-56 md:h-64 bg-slate-900 shadow-[0_20px_60px_-35px_rgba(15,23,42,0.45)]">
            <picture className="absolute inset-0 block w-full h-full">
              <source srcSet="https://images.unsplash.com/photo-1520975917076-54a4d7d6f73e?w=1200&h=800&fit=crop&auto=format 1200w, https://images.unsplash.com/photo-1520975917076-54a4d7d6f73e?w=900&h=600&fit=crop&auto=format 900w, https://images.unsplash.com/photo-1520975917076-54a4d7d6f73e?w=640&h=426&fit=crop&auto=format 640w" sizes="(max-width: 640px) 640px, (max-width: 1024px) 900px, 1200px" />
              <img src="https://images.unsplash.com/photo-1520975917076-54a4d7d6f73e?w=1200&h=800&fit=crop&auto=format"
                alt="Hombre entrenando" loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
            </picture>
            <div className="absolute inset-0 bg-gradient-to-r from-black/30 to-slate-900/10" />
            <div className="absolute inset-0 p-4 sm:p-6 md:p-8 flex flex-col justify-end">
              <p className="text-[10px] sm:text-xs font-semibold text-[#fbbf24] uppercase tracking-[0.2em] sm:tracking-[0.3em] mb-1 sm:mb-1.5">Temporada 2026</p>
              <h3 className="text-xl sm:text-2xl md:text-3xl font-extrabold text-white mb-2 sm:mb-3">Ropa Hombre</h3>
              <button onClick={() => onCategorySelect("Ropa Hombre")}
                className="inline-flex items-center gap-2 text-xs sm:text-sm font-bold text-slate-900 bg-white px-3 sm:px-5 py-2 sm:py-3 rounded-full hover:bg-slate-100 transition-all w-fit">
                Explorar <ArrowRight size={13} />
              </button>
            </div>
          </div>
          {/* Mujer */}
          <div className="relative rounded-2xl sm:rounded-[32px] overflow-hidden h-40 sm:h-56 md:h-64 bg-slate-100 shadow-[0_20px_60px_-35px_rgba(15,23,42,0.12)]">
            <picture className="absolute inset-0 block w-full h-full">
              <source srcSet="https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=1200&h=800&fit=crop&auto=format 1200w, https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=900&h=600&fit=crop&auto=format 900w, https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=640&h=426&fit=crop&auto=format 640w" sizes="(max-width: 640px) 640px, (max-width: 1024px) 900px, 1200px" />
              <img src="https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=1200&h=800&fit=crop&auto=format"
                alt="Ropa Mujer" loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
            </picture>
            <div className="absolute inset-0 bg-gradient-to-r from-white/80 to-transparent" />
            <div className="absolute inset-0 p-4 sm:p-6 md:p-8 flex flex-col justify-end">
              <p className="text-[10px] sm:text-xs font-semibold text-[#1d4ed8] uppercase tracking-[0.2em] sm:tracking-[0.3em] mb-1 sm:mb-1.5">Colección nueva</p>
              <h3 className="text-xl sm:text-2xl md:text-3xl font-extrabold text-slate-900 mb-2 sm:mb-3">Ropa Mujer</h3>
              <button onClick={() => onCategorySelect("Ropa Mujer")}
                className="inline-flex items-center gap-2 text-xs sm:text-sm font-bold text-white bg-black px-3 sm:px-5 py-2 sm:py-3 rounded-full hover:bg-slate-900 transition-all w-fit">
                Explorar <ArrowRight size={13} />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Recently arrived */}
      {newArrivals.length > 0 && (
        <section className="py-8 sm:py-12 md:py-16 max-w-7xl mx-auto px-3 sm:px-4 md:px-6">
          <div className="flex items-end justify-between mb-6 sm:mb-8 gap-4">
            <div>
              <p className="text-[10px] sm:text-xs font-bold text-blue-600 tracking-widest uppercase mb-1 sm:mb-1.5">Recién llegados</p>
              <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900">Novedades</h2>
            </div>
            <Btn variant="ghost" onClick={() => onNavigate("catalog")} className="hidden sm:flex">Ver todos <ChevronRight size={14} /></Btn>
          </div>
          <ProductCarousel>
              {newArrivals.slice(0, 9).map((p, idx) => (
              <div key={p.id + "-recent-" + idx} className="w-[84vw] max-w-[280px] sm:w-[16rem] lg:w-[18rem] shrink-0">
                <ProductCard product={p} onSelect={onSelectProduct} onAddToCart={onAddToCart} />
              </div>
            ))}
          </ProductCarousel>
          <Btn variant="ghost" onClick={() => onNavigate("catalog")} className="sm:hidden w-full mt-6">Ver todos <ChevronRight size={14} /></Btn>
        </section>
      )}

      {/* New arrivals */}
      {newArrivals.length > 0 && (
        <section className="py-8 sm:py-12 md:py-16 max-w-7xl mx-auto px-3 sm:px-4 md:px-6">
          <div className="flex items-end justify-between mb-6 sm:mb-8 gap-4">
            <div>
              <p className="text-[10px] sm:text-xs font-bold text-emerald-600 tracking-widest uppercase mb-1 sm:mb-1.5">{content.newArrivalsLabel}</p>
              <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900">{content.newArrivalsSectionTitle}</h2>
            </div>
            <Btn variant="ghost" onClick={() => onNavigate("catalog")} className="hidden sm:flex">Ver todos <ChevronRight size={14} /></Btn>
          </div>
          <ProductCarousel>
              {arrivalsForCarousel.map((p, idx) => (
              <div key={p.id + "-" + idx} className="w-[84vw] max-w-[280px] sm:w-[16rem] lg:w-[18rem] shrink-0">
                <ProductCard product={p} onSelect={onSelectProduct} onAddToCart={onAddToCart} />
              </div>
            ))}
          </ProductCarousel>
          <Btn variant="ghost" onClick={() => onNavigate("catalog")} className="sm:hidden w-full mt-6">Ver todos <ChevronRight size={14} /></Btn>
        </section>
      )}

      {/* Sale */}
      <section className="py-8 sm:py-12 md:py-16 bg-orange-50 border-y border-orange-100">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6">
          <div className="flex items-end justify-between mb-6 sm:mb-8 gap-4">
            <div>
              <p className="text-[10px] sm:text-xs font-bold text-[#f97316] tracking-widest uppercase mb-1 sm:mb-1.5">{content.saleSectionLabel}</p>
              <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900">{content.saleSectionTitle}</h2>
            </div>
            <Btn variant="ghost" onClick={() => onNavigate("catalog")} className="hidden sm:flex">Ver todos <ChevronRight size={14} /></Btn>
          </div>
          <ProductCarousel>
              {onSale.slice(0, 9).map((p) => (
              <div key={p.id} className="w-[84vw] max-w-[280px] sm:w-[16rem] lg:w-[18rem] shrink-0">
                <ProductCard product={p} onSelect={onSelectProduct} onAddToCart={onAddToCart} />
              </div>
            ))}
          </ProductCarousel>
          <Btn variant="ghost" onClick={() => onNavigate("catalog")} className="sm:hidden w-full mt-6">Ver todos <ChevronRight size={14} /></Btn>
        </div>
      </section>

      {/* Newsletter */}
      <section className="py-5 sm:py-6 md:py-7 bg-[#1d4ed8]">
        <div className="max-w-xl mx-auto px-3 sm:px-4 text-center">
          <p className="text-[10px] sm:text-xs font-bold text-blue-200 uppercase tracking-widest mb-1 sm:mb-1.5">Mantente al día</p>
          <h2 className="text-lg sm:text-xl font-extrabold text-white mb-1 sm:mb-1.5">Recibe ofertas exclusivas</h2>
          <p className="text-blue-200 text-xs sm:text-sm mb-3 sm:mb-4">Suscríbete y obtén 10% de descuento en tu primera compra.</p>
          <div className="flex flex-col sm:flex-row gap-2 max-w-sm mx-auto">
            <input type="email" placeholder="tu@email.com"
              className="flex-1 px-4 py-3 rounded-xl text-sm text-slate-800 bg-white placeholder-slate-400 focus:outline-none" />
            <button onClick={() => toast.success('¡Gracias! Te notificaremos cuando haya ofertas disponibles.')}
              className="px-5 py-3 rounded-xl bg-black/70 text-white text-sm font-bold hover:bg-black/90 transition-colors whitespace-nowrap w-full sm:w-auto">
              Suscribirme
            </button>
          </div>
        </div>
      </section>

      {/* Special offers - On sale now */}
      {onSale.length > 0 && (
        <section className="py-8 sm:py-12 md:py-16 bg-orange-50 border-y border-orange-100">
          <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6">
            <div className="flex items-end justify-between mb-6 sm:mb-8 gap-4">
              <div>
                <p className="text-[10px] sm:text-xs font-bold text-[#f97316] tracking-widest uppercase mb-1 sm:mb-1.5">Oferta especial</p>
                <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900">En descuento ahora</h2>
              </div>
              <Btn variant="ghost" onClick={() => onNavigate("catalog")} className="hidden sm:flex">Ver todos <ChevronRight size={14} /></Btn>
            </div>
            <ProductCarousel>
                {onSale.slice(0, 9).map((p) => (
                <div key={p.id + "-sale"} className="w-[84vw] max-w-[280px] sm:w-[16rem] lg:w-[18rem] shrink-0">
                  <ProductCard product={p} onSelect={onSelectProduct} onAddToCart={onAddToCart} />
                </div>
              ))}
            </ProductCarousel>
            <Btn variant="ghost" onClick={() => onNavigate("catalog")} className="sm:hidden w-full mt-6">Ver todos <ChevronRight size={14} /></Btn>
          </div>
        </section>
      )}

      {/* Premium accessories section */}
      {featured.length > 3 && (
        <section className="py-8 sm:py-12 md:py-16 bg-gradient-to-br from-slate-50 to-slate-100">
          <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6">
            <div className="flex items-end justify-between mb-6 sm:mb-8 gap-4">
              <div>
                <p className="text-[10px] sm:text-xs font-bold text-purple-600 tracking-widest uppercase mb-1 sm:mb-1.5">Colección premium</p>
                <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900">Accesorios y relojes</h2>
              </div>
              <Btn variant="ghost" onClick={() => onNavigate("catalog")} className="hidden sm:flex">Ver todos <ChevronRight size={14} /></Btn>
            </div>
            <ProductCarousel>
              {featured.slice(0, 8).map((p) => (
                <div key={p.id + "-accessories"} className="w-[84vw] max-w-[280px] sm:w-[16rem] lg:w-[18rem] shrink-0">
                  <ProductCard product={p} onSelect={onSelectProduct} onAddToCart={onAddToCart} />
                </div>
              ))}
            </ProductCarousel>
            <Btn variant="ghost" onClick={() => onNavigate("catalog")} className="sm:hidden w-full mt-6">Ver todos <ChevronRight size={14} /></Btn>
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="bg-slate-900 text-slate-300 pt-10 sm:pt-14 pb-6 sm:pb-8">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-8 mb-8 sm:mb-10">
            <div className="col-span-2 sm:col-span-1">
              <div className="flex items-center gap-2 mb-3 sm:mb-4">
                <span className="font-extrabold text-white text-xs sm:text-sm">Urban<span className="text-[#f97316]">Sport</span></span>
              </div>
              <p className="text-[11px] sm:text-xs leading-relaxed text-slate-400">Moda deportiva y accesorios premium. Tu mejor versión empieza aquí.</p>
            </div>
            {[
              { title: "Productos", links: ["Zapatos deportivos", "Ropa Hombre", "Ropa Mujer", "Perfumes", "Relojes", "Gafas"] },
              { title: "Empresa", links: ["Sobre nosotros", "Blog", "Trabaja con nosotros", "Afiliados"] },
              { title: "Soporte", links: ["Centro de ayuda", "Devoluciones", "Rastreo de pedidos", "Contacto"] },
            ].map((col) => (
              <div key={col.title}>
                <p className="text-xs font-bold text-white uppercase tracking-widest mb-3">{col.title}</p>
                <ul className="space-y-2">
                  {col.links.map((l) => {
                    const categoryMap: Record<string, Category | null> = {
                      "Zapatos deportivos": "Zapatos",
                      "Ropa Hombre": "Ropa Hombre",
                      "Ropa Mujer": "Ropa Mujer",
                      "Perfumes": "Perfumes",
                      "Relojes": "Relojes",
                      "Gafas": "Gafas",
                    };
                    const category = categoryMap[l] ?? null;
                    return (
                      <li key={l}>
                        {category ? (
                          <button onClick={() => { onCategorySelect(category); onNavigate("catalog"); }}
                            className="text-left w-full text-xs text-slate-400 hover:text-white transition-colors">
                            {l}
                          </button>
                        ) : (
                          <button onClick={() => toast('Próximamente: ' + l)}
                            className="text-left w-full text-xs text-slate-400 hover:text-white transition-colors">
                            {l}
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
          <div className="border-t border-slate-800 pt-6 flex flex-col sm:flex-row justify-between items-center gap-3">
            <p className="text-xs text-slate-500">© 2026 UrbanSport Store. Todos los derechos reservados.</p>
            <div className="flex items-center gap-4 text-xs text-slate-500">
              <button onClick={() => toast('Privacidad próximamente disponible.')}
                className="hover:text-slate-300 transition-colors text-left">Privacidad</button>
              <button onClick={() => toast('Términos próximamente disponible.')}
                className="hover:text-slate-300 transition-colors text-left">Términos</button>
              <button onClick={() => toast('Cookies próximamente disponible.')}
                className="hover:text-slate-300 transition-colors text-left">Cookies</button>
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}

// ─── CATALOG PAGE ─────────────────────────────────────────────────────────────

function CatalogPage({ filterCategory, onSelectProduct, onAddToCart, onNavigate, onCategorySelect, products }: {
  filterCategory: Category | null; onSelectProduct: (p: Product) => void;
  onAddToCart: (p: Product, size: string, color: string) => void;
  onNavigate: (v: View) => void;
  onCategorySelect: (c: Category | null) => void;
  products: Product[];
}) {
  const selectedCat = filterCategory;
  const [selectedBrand, setSelectedBrand] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState("relevancia");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const allBrands = [...new Set(products.map((p) => p.brand))];
  const filtered = useMemo(() => {
    let list = products;
    if (selectedCat) list = list.filter((p) => p.category === selectedCat);
    if (selectedBrand) list = list.filter((p) => p.brand === selectedBrand);
    if (sortBy === "precio-asc") list = [...list].sort((a, b) => a.price - b.price);
    if (sortBy === "precio-desc") list = [...list].sort((a, b) => b.price - a.price);
    if (sortBy === "rating") list = [...list].sort((a, b) => b.rating - a.rating);
    if (sortBy === "novedades") list = [...list].sort((a) => a.isNew ? -1 : 1);
    return list;
  }, [selectedCat, selectedBrand, sortBy]);

  return (
    <main className="pt-[312px] min-h-screen max-w-7xl mx-auto px-3 sm:px-4 md:px-6 py-6 sm:py-8">
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
                <button onClick={() => onCategorySelect(null)}
                  className={`w-full text-left px-3 py-2 rounded-xl text-sm transition-colors ${!selectedCat ? "bg-[#1d4ed8] text-white font-bold" : "text-slate-600 hover:bg-slate-100"}`}>
                  Todos ({products.length})
                </button>
                {NAV_CATEGORIES.map((cat) => {
                  const count = products.filter((p) => p.category === cat.name).length;
                  return (
                    <button key={cat.name}
                      onClick={() => onCategorySelect(cat.name as Category)}
                      className={`w-full text-left px-3 py-2 rounded-xl text-sm transition-colors flex justify-between items-center ${selectedCat === cat.name ? "bg-[#1d4ed8] text-white font-bold" : "text-slate-600 hover:bg-slate-100"}`}>
                      <span className="flex items-center gap-1.5">{cat.name}</span>
                      <span className="text-xs opacity-60">{count}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="text-xs font-bold text-slate-800 uppercase tracking-widest mb-3">Marca</p>
              <div className="space-y-0.5">
                {allBrands.map((brand) => (
                  <button key={brand} onClick={() => setSelectedBrand(brand === selectedBrand ? null : brand)}
                    className={`w-full text-left px-3 py-2 rounded-xl text-sm transition-colors ${selectedBrand === brand ? "bg-blue-50 text-[#1d4ed8] font-semibold" : "text-slate-600 hover:bg-slate-100"}`}>
                    {brand}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs font-bold text-slate-800 uppercase tracking-widest mb-3">Género</p>
              <div className="space-y-0.5">
                {["Hombre", "Mujer", "Unisex"].map((g) => (
                  <label key={g} className="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-slate-100 cursor-pointer\">
                    <input type="checkbox" className="accent-[#1d4ed8]" />
                    <span className="text-sm text-slate-600">{g}</span>
                  </label>
                ))}
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
              <span className="text-sm font-normal text-slate-400 ml-2">({filtered.length} resultados)</span>
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
                    {NAV_CATEGORIES.map((cat) => (
                      <button key={cat.name} onClick={() => onCategorySelect(cat.name as Category)}
                        className={`rounded-2xl px-3 py-2 text-sm text-left ${selectedCat === cat.name ? "bg-[#1d4ed8] text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>
                        {cat.name}
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

          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 sm:py-24 gap-4">
              <div className="w-14 sm:w-16 h-14 sm:h-16 rounded-2xl bg-slate-100 flex items-center justify-center">
                <Package size={24} className="text-slate-400" />
              </div>
              <p className="text-sm text-slate-500">Sin resultados para estos filtros.</p>
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

function ProductDetailPage({ product, onBack, onAddToCart, onNavigate }: {
  product: Product; onBack: () => void;
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
    for (let i = 0; i < qty; i++) onAddToCart(product, selectedSize, selectedColor);
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  };

  return (
    <main className="pt-[312px] min-h-screen max-w-7xl mx-auto px-4 sm:px-6 py-8">
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
                  <img src={mainImage} alt={product.name} className="w-full h-full object-cover" />
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {gallery.slice(0, 4).map((src, index) => (
                    <div key={index} className={`aspect-square rounded-xl overflow-hidden border-2 cursor-pointer transition-colors ${index === 0 ? "border-[#1d4ed8]" : "border-slate-200 hover:border-slate-300"}`}>
                      <img src={src} alt={`Miniatura ${index + 1}`} className="w-full h-full object-cover" />
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
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 leading-tight mb-3">{product.name}</h1>
            <StarRating rating={product.rating} reviews={product.reviews} />
          </div>

          {/* Price */}
          <div className="p-4 bg-white/95 rounded-[30px] border border-slate-200/80 shadow-[0_20px_45px_-35px_rgba(15,23,42,0.12)]">
            <div className="flex items-baseline gap-3 flex-wrap">
              <span className="text-3xl font-extrabold text-slate-900">{fmt(product.price)}</span>
              {product.originalPrice && (
                <span className="text-lg text-slate-400 line-through">{fmt(product.originalPrice)}</span>
              )}
              {product.discount && <Badge variant="sale">-{product.discount}%</Badge>}
            </div>
            {savings > 0 && (
              <p className="text-sm text-emerald-600 font-bold mt-1">Ahorras {fmt(savings)} COP</p>
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
                {product.category === "Zapatos" ? "Talla (EU)" :
                 product.category === "Perfumes" ? "Presentación" : "Talla"}
              </p>
              {product.category !== "Perfumes" && product.sizes[0] !== "Talla única" && (
                <button onClick={() => onNavigate("catalog")}
                  className="text-xs text-[#1d4ed8] hover:underline">Guía de tallas</button>
              )}
            </div>
            <SizeSelector sizes={product.sizes} selected={selectedSize} onSelect={setSelectedSize} />
          </div>

          {/* Qty */}
          <div className="flex items-center gap-4">
            <p className="text-sm font-bold text-slate-700">Cantidad:</p>
            <div className="flex items-center border border-slate-200 rounded-xl overflow-hidden bg-white">
              <button onClick={() => setQty(Math.max(1, qty - 1))}
                className="w-10 h-10 flex items-center justify-center text-slate-500 hover:bg-slate-100 transition-colors">
                <Minus size={14} />
              </button>
              <span className="w-10 text-center text-sm font-extrabold text-slate-800">{qty}</span>
              <button onClick={() => setQty(Math.min(product.stock, qty + 1))}
                className="w-10 h-10 flex items-center justify-center text-slate-500 hover:bg-slate-100 transition-colors">
                <Plus size={14} />
              </button>
            </div>
          </div>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row gap-3">
            <button onClick={handleAdd}
              className={`flex-1 py-3.5 rounded-xl text-sm font-extrabold flex items-center justify-center gap-2 transition-all duration-300 ${
                added ? "bg-emerald-500 text-white shadow-lg shadow-emerald-200" : "bg-black text-white hover:bg-slate-900 shadow-lg shadow-slate-800"
              }`}>
              {added ? <><Check size={16} /> Agregado al carrito</> : <><ShoppingCart size={16} /> Agregar al carrito</>}
            </button>
            <button onClick={() => { handleAdd(); onNavigate("checkout"); }}
              className="flex-1 py-3.5 rounded-xl text-sm font-extrabold border-2 border-black text-black hover:bg-slate-100 flex items-center justify-center gap-2 transition-colors">
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
        <div className="max-w-2xl space-y-4">
          {[
            { name: "Diego P.", rating: 5, date: "10 Jul 2026", text: "Excelente producto, calidad de primera. La talla es exacta y el material es muy cómodo. Lo recomiendo al 100%." },
            { name: "Camila R.", rating: 4, date: "5 Jul 2026", text: "Muy buena calidad. El empaque llegó perfecto y en el tiempo prometido. Solo le doy 4 estrellas porque el color era un poco diferente al de la foto." },
            { name: "Santiago M.", rating: 5, date: "28 Jun 2026", text: "Ya es mi segunda compra en UrbanSport y siempre quedé satisfecho. El servicio al cliente también es excelente." },
          ].map((r) => (
            <div key={r.name} className="p-4 bg-white/95 rounded-[30px] border border-slate-200/80 shadow-[0_18px_48px_-40px_rgba(15,23,42,0.16)]">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="text-sm font-bold text-slate-800">{r.name}</p>
                  <StarRating rating={r.rating} />
                </div>
                <span className="text-xs text-slate-400">{r.date}</span>
              </div>
              <p className="text-sm text-slate-600">{r.text}</p>
            </div>
          ))}
        </div>
      )}

      {/* Related */}
      <div className="mt-16">
        <h3 className="text-xl font-extrabold text-slate-900 mb-6">También te puede interesar</h3>
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

function CheckoutPage({ cart, onNavigate, addresses, selectedAddressId, onSelectAddress, onCreateAddress }: { cart: CartItem[]; onNavigate: (v: View) => void; addresses: Address[]; selectedAddressId: string; onSelectAddress: (id: string) => void; onCreateAddress: (address: Omit<Address, 'id'>) => void; }) {
  const [step, setStep] = useState(0);
  const [selectedShip, setSelectedShip] = useState(0);
  const [showPass, setShowPass] = useState(false);
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
  const SHIP = [
    { name: "Estándar", desc: "5-7 días hábiles", price: 0, tag: "Gratis" },
    { name: "Express", desc: "2-3 días hábiles", price: 15900, tag: "$15.900" },
    { name: "Mismo día", desc: "Hoy si ordenas antes de las 2 PM", price: 35900, tag: "$35.900" },
  ];
  const total = subtotal + SHIP[selectedShip].price;
  const STEPS = ["Dirección", "Envío", "Pago", "Confirmación"];

  if (step === 3) return (
    <main className="pt-[312px] min-h-screen flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="w-20 h-20 rounded-full bg-emerald-100 border-2 border-emerald-200 flex items-center justify-center mx-auto">
          <Check size={36} className="text-emerald-600" />
        </div>
        <div>
          <h2 className="text-2xl font-extrabold text-slate-900 mb-2">¡Pedido confirmado!</h2>
          <p className="text-slate-500">Tu pedido <span className="text-[#1d4ed8] font-bold">#US-3195</span> fue recibido correctamente.</p>
        </div>
        <div className="p-5 bg-white/95 rounded-[30px] border border-slate-200/80 shadow-[0_22px_60px_-42px_rgba(15,23,42,0.18)] text-left space-y-2">
          <div className="flex justify-between text-sm"><span className="text-slate-500">Total pagado</span><span className="font-bold text-slate-900">{fmt(total)} COP</span></div>
          <div className="flex justify-between text-sm"><span className="text-slate-500">Envío</span><span className="font-semibold text-slate-700">{SHIP[selectedShip].name}</span></div>
          <div className="flex justify-between text-sm"><span className="text-slate-500">Entrega estimada</span><span className="font-semibold text-slate-700">{SHIP[selectedShip].desc}</span></div>
        </div>
        <div className="flex flex-col gap-3">
          <Btn variant="primary" onClick={() => onNavigate("account")} className="w-full" size="lg">Ver mis pedidos</Btn>
          <Btn variant="secondary" onClick={() => onNavigate("home")} className="w-full" size="lg">Seguir comprando</Btn>
        </div>
      </div>
    </main>
  );

  return (
    <main className="pt-[320px] min-h-screen max-w-5xl mx-auto px-4 sm:px-6 py-10">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <button onClick={() => onNavigate("home")} className="flex items-center gap-2 text-slate-500 hover:text-slate-800 transition-colors text-sm">
          <ChevronLeft size={15} /> Volver
        </button>
        <div className="flex items-center gap-2 ml-2">
          <span className="font-bold text-slate-800">Checkout</span>
          <Shield size={14} className="text-emerald-500 ml-1" />
        </div>
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
              {addresses.map((a) => (
                <label key={a.id} className={`flex gap-2 sm:gap-3 p-3 sm:p-4 rounded-lg sm:rounded-2xl border-2 cursor-pointer transition-all ${selectedAddressId === a.id ? "border-[#1d4ed8] bg-blue-50/50" : "border-slate-200 hover:border-slate-300"}`}>
                  <input type="radio" name="addr" checked={selectedAddressId === a.id} onChange={() => onSelectAddress(a.id)} className="mt-1 accent-[#1d4ed8] shrink-0" />
                  <div>
                    <p className="text-xs sm:text-sm font-bold text-slate-800 flex items-center gap-2 flex-wrap">
                      <MapPin size={13} className="text-[#1d4ed8] shrink-0" /> {a.label}
                      {a.isDefault && <Badge variant="new">Predeterminada</Badge>}
                    </p>
                    <p className="text-xs sm:text-sm text-slate-500 mt-0.5">{a.line1}{a.line2 ? `, ${a.line2}` : ""}</p>
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
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">{field.label}</label>
                      <input
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
              <h3 className="text-base sm:text-lg font-extrabold text-slate-900 mb-3 sm:mb-4">Método de envío</h3>
              {SHIP.map((opt, i) => (
                <label key={opt.name} className={`flex gap-2 sm:gap-3 p-3 sm:p-4 rounded-lg sm:rounded-2xl border-2 cursor-pointer transition-all ${selectedShip === i ? "border-[#1d4ed8] bg-blue-50/50" : "border-slate-200 hover:border-slate-300"}`}>
                  <input type="radio" name="ship" checked={selectedShip === i} onChange={() => setSelectedShip(i)} className="mt-1 accent-[#1d4ed8] shrink-0" />
                  <Truck size={16} className={`mt-0.5 shrink-0 ${selectedShip === i ? "text-[#1d4ed8]" : "text-slate-400"}`} />
                  <div className="flex-1">
                    <p className="text-xs sm:text-sm font-bold text-slate-800">{opt.name}</p>
                    <p className="text-[11px] sm:text-xs text-slate-500">{opt.desc}</p>
                  </div>
                  <span className={`text-xs sm:text-sm font-extrabold ${opt.price === 0 ? "text-emerald-600" : "text-slate-800"}`}>{opt.tag}</span>
                </label>
              ))}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <h3 className="text-lg font-extrabold text-slate-900 mb-4">Datos de pago</h3>
              <div className="p-5 bg-white/95 rounded-[30px] border border-slate-200/80 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.18)] space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Titular</label>
                  <input defaultValue="Valentina Torres" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:border-[#1d4ed8]/50" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Número de tarjeta</label>
                  <div className="relative">
                    <input defaultValue="4242 4242 4242 4242" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:border-[#1d4ed8]/50" />
                    <CreditCard size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Vencimiento</label>
                    <input defaultValue="12 / 28" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:border-[#1d4ed8]/50" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">CVV</label>
                    <div className="relative">
                      <input type={showPass ? "text" : "password"} defaultValue="123" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:border-[#1d4ed8]/50" />
                      <button onClick={() => setShowPass(!showPass)} type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                        {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <Shield size={13} className="text-emerald-500" />
                Pago 100% seguro con encriptación SSL de 256 bits.
              </div>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3 mt-6 sm:mt-8">
            {step > 0 && <Btn variant="secondary" onClick={() => setStep(step - 1)} className="flex-1 sm:flex-none justify-center"><ChevronLeft size={14} /> Atrás</Btn>}
            <Btn variant="primary" className="flex-1" size="lg" onClick={() => setStep(step + 1)}>
              {step === 2 ? <><Shield size={15} /> Pagar {fmt(total)} COP</> : <>Continuar <ChevronRight size={15} /></>}
            </Btn>
          </div>
        </div>

        {/* Summary */}
        <div className="lg:col-span-1">
          <div className="bg-white/95 rounded-lg sm:rounded-[30px] border border-slate-200/80 shadow-[0_22px_60px_-42px_rgba(15,23,42,0.18)] p-4 sm:p-5 sticky top-[152px] space-y-4">
            <h3 className="text-xs sm:text-sm font-extrabold text-slate-800">Resumen del pedido</h3>
            <div className="space-y-2 sm:space-y-3 max-h-40 sm:max-h-52 overflow-y-auto">
              {cart.map((item) => (
                <div key={`${item.product.id}-${item.selectedSize}`} className="flex gap-2 sm:gap-3">
                  <div className="relative shrink-0">
                    <img src={item.product.image} alt="" className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg object-cover bg-slate-100" />
                    <span className="absolute -top-1.5 -right-1.5 w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-[#1d4ed8] text-white text-[8px] sm:text-[9px] font-bold flex items-center justify-center">{item.qty}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] sm:text-xs font-semibold text-slate-700 line-clamp-2 leading-tight">{item.product.name}</p>
                    {item.selectedSize !== "Talla única" && <p className="text-[9px] sm:text-[10px] text-slate-400 mt-0.5">T: {item.selectedSize}</p>}
                    <p className="text-[11px] sm:text-xs font-extrabold text-slate-900 mt-0.5">{fmt(item.product.price * item.qty)}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input placeholder="Código de cupón" className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:border-[#1d4ed8]/50" />
              <Btn variant="outline" size="sm">Aplicar</Btn>
            </div>
            <div className="space-y-1 sm:space-y-1.5 text-xs sm:text-sm border-t border-slate-100 pt-3">
              <div className="flex justify-between text-slate-500"><span>Subtotal</span><span className="font-semibold text-slate-800">{fmt(subtotal)}</span></div>
              <div className="flex justify-between text-slate-500">
                <span>Envío</span>
                <span className={SHIP[selectedShip].price === 0 ? "text-emerald-600 font-bold" : "font-semibold text-slate-800"}>
                  {SHIP[selectedShip].price === 0 ? "Gratis" : fmt(SHIP[selectedShip].price)}
                </span>
              </div>
              <div className="flex justify-between font-extrabold text-slate-900 text-sm sm:text-base border-t border-slate-100 pt-1.5">
                <span>Total</span><span>{fmt(total)} COP</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

// ─── LOGIN PAGE ───────────────────────────────────────────────────────────────

function LoginPage({ isRegister, onNavigate, onLogin }: {
  isRegister: boolean; onNavigate: (v: View) => void;
  onLogin: (user: User | null, isAdmin: boolean) => void;
}) {
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const isLocalAuthFallback = !import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      let user = null;
      let adminStatus = false;
      if (isRegister) {
        const signUpResult = await signUpWithEmail(email, password, { name });
        if (signUpResult.error) throw signUpResult.error;
        if (!signUpResult.data.user) throw new Error("No se pudo crear la cuenta.");

        user = signUpResult.data.user;
        adminStatus = isAdminUser(user);
        onLogin(user, adminStatus);
        toast.success(signUpResult.needsConfirmation ? "Cuenta creada. Revisa tu correo si tu configuración de Supabase requiere confirmación; ya puedes seguir usando la tienda." : "Registro exitoso. Ya puedes continuar en la tienda.");
        setEmail("");
        setPassword("");
        setName("");
        onNavigate(adminStatus ? "admin" : "home");
        return;
      }

      const signInResult = await signInWithEmail(email, password);
      if (signInResult.error) throw signInResult.error;
      if (!signInResult.data.user) throw new Error("No se pudo iniciar sesión.");
      user = signInResult.data.user;

      adminStatus = isAdminUser(user);
      onLogin(user, adminStatus);
      onNavigate(adminStatus ? "admin" : "home");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ocurrió un error inesperado.");
    } finally {
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
          <h1 className="text-4xl font-extrabold text-slate-900 mb-2">
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
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">Nombre completo</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Tu nombre"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-900 placeholder-slate-500 focus:outline-none focus:border-[#1d4ed8] focus:bg-white transition-all duration-200"
                />
              </div>
            )}

            {/* Email */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">Correo electrónico</label>
              <input 
                type="email" 
                value={email} 
                onChange={(e) => setEmail(e.target.value)} 
                placeholder="tu@email.com" 
                className="w-full px-4 py-3.5 bg-slate-50 border border-slate-300 rounded-xl text-base text-slate-900 placeholder-slate-500 focus:outline-none focus:border-[#1d4ed8] focus:bg-white transition-all duration-200" 
              />
            </div>

            {/* Password */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Contraseña</label>
                {!isRegister && (
                  <button 
                    type="button" 
                    onClick={() => toast('Función de recuperación de contraseña próximamente disponible.')}
                    className="text-xs text-[#1d4ed8] hover:text-blue-400 font-semibold transition-colors"
                  >
                    ¿Olvidaste?
                  </button>
                )}
              </div>
              <div className="relative">
                <input 
                  type={showPass ? "text" : "password"} 
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

            {/* Terms checkbox for register */}
            {isRegister && (
              <label className="flex items-start gap-3 cursor-pointer group">
                <input 
                  type="checkbox" 
                  className="mt-1 w-4 h-4 accent-[#1d4ed8] cursor-pointer" 
                />
                <span className="text-xs text-slate-700 leading-relaxed">
                  Acepto los <button type="button" onClick={() => toast('Términos próximamente disponible.')} className="text-[#1d4ed8] hover:text-blue-600 font-semibold transition-colors">Términos</button> y la <button type="button" onClick={() => toast('Política de privacidad próximamente disponible.')} className="text-[#1d4ed8] hover:text-blue-600 font-semibold transition-colors">Política de privacidad</button>.
                </span>
              </label>
            )}

            {/* Error message */}
            {error && (
              <div className="p-3.5 bg-red-500/20 border border-red-500/30 rounded-xl">
                <p className="text-sm text-red-300 font-medium">{error}</p>
              </div>
            )}

            {/* Submit button */}
            <button 
              type="submit" 
              disabled={loading}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-[#1d4ed8] to-blue-600 text-white font-extrabold text-base hover:shadow-lg hover:shadow-blue-500/30 disabled:opacity-60 disabled:shadow-none transition-all duration-300 flex items-center justify-center gap-2 transform hover:scale-105"
            >
              {loading ? (
                <><RefreshCw size={18} className="animate-spin" /> Procesando…</>
              ) : (
                isRegister ? "Crear mi cuenta" : "Iniciar sesión"
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="relative flex items-center gap-3">
            <div className="flex-1 h-px bg-slate-300" />
            <span className="text-xs text-slate-600 font-medium">o continúa con</span>
            <div className="flex-1 h-px bg-slate-300" />
          </div>

          {/* Google button */}
          <button 
            onClick={() => toast('Función de inicio con Google próximamente disponible.')}
            className="w-full py-3.5 rounded-xl border border-slate-300 bg-white text-sm text-slate-900 font-semibold hover:bg-slate-50 hover:border-blue-400 transition-all duration-200 flex items-center justify-center gap-3 transform hover:scale-105"
          >
            <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20H24v8h11.3C33.6 33.4 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.7 1.1 7.8 2.9l5.7-5.7C34 6.5 29.2 4 24 4 13 4 4 13 4 24s9 20 20 20c11 0 20-9 20-20 0-1.3-.1-2.7-.4-4z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.5 15.1 18.9 12 24 12c3 0 5.7 1.1 7.8 2.9l5.7-5.7C34 6.5 29.2 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.3 26.7 36 24 36c-5.2 0-9.6-3.4-11.2-8H6.5C9.9 37.7 16.5 44 24 44z"/><path fill="#1976D2" d="M43.6 20H24v8h11.3c-.8 2.2-2.2 4.1-4 5.5l6.2 5.2C40.6 35.4 44 30.1 44 24c0-1.3-.1-2.7-.4-4z"/></svg>
            Google
          </button>
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

// ─── ACCOUNT PAGE ─────────────────────────────────────────────────────────────

function AccountPage({ onNavigate, onLogout, addresses, onCreateAddress, onUpdateAddress, onDeleteAddress }: { onNavigate: (v: View) => void; onLogout: () => void; addresses: Address[]; onCreateAddress: (address: Omit<Address, 'id'>) => void; onUpdateAddress: (addressId: string, updates: Partial<Address>) => void; onDeleteAddress: (addressId: string) => void; }) {
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
    <main className="pt-[320px] min-h-screen max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex gap-8">
        <aside className="hidden sm:block w-56 shrink-0">
          <div className="bg-white/95 rounded-[30px] border border-slate-200/80 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.18)] overflow-hidden">
            <div className="p-4 border-b border-slate-100 bg-gradient-to-br from-[#1d4ed8] to-[#1e40af]">
              <div className="w-12 h-12 rounded-full bg-white/20 border-2 border-white/30 flex items-center justify-center text-xl font-extrabold text-white mb-2">V</div>
              <p className="text-sm font-extrabold text-white">Valentina Torres</p>
              <p className="text-xs text-blue-200">valentina@email.com</p>
            </div>
            <div className="p-2 space-y-0.5">
              {([
                { key: "orders", label: "Mis pedidos", icon: <Package size={15} /> },
                { key: "profile", label: "Mi perfil", icon: <Users size={15} /> },
                { key: "addresses", label: "Direcciones", icon: <MapPin size={15} /> },
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
              <h2 className="text-xl font-extrabold text-slate-900 mb-6">Mis pedidos</h2>
              {ORDERS.map((order) => (
                <div key={order.id} className="p-5 bg-white/95 rounded-[30px] border border-slate-200/80 shadow-[0_18px_48px_-40px_rgba(15,23,42,0.16)] hover:-translate-y-0.5 transition-all duration-200">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-3 mb-1.5">
                        <span className="text-sm font-extrabold text-slate-800 font-mono">{order.id}</span>
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${STATUS_STYLE[order.status]}`}>{order.status}</span>
                      </div>
                      <p className="text-xs text-slate-400">{order.date} · {order.items} {order.items === 1 ? "artículo" : "artículos"}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-base font-extrabold text-slate-900">{fmt(order.total)} COP</p>
                      <button onClick={() => toast('Detalle de pedido próximamente disponible.')}
                        className="text-xs text-[#1d4ed8] hover:underline flex items-center gap-1 ml-auto mt-1">
                        Ver detalle <ChevronRight size={11} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {section === "profile" && (
            <div>
              <h2 className="text-xl font-extrabold text-slate-900 mb-6">Mi perfil</h2>
              <div className="space-y-5 max-w-lg">
                <div className="grid grid-cols-2 gap-4">
                  {[["Nombre", "Valentina"], ["Apellido", "Torres"]].map(([lbl, val]) => (
                    <div key={lbl}>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">{lbl}</label>
                      <input defaultValue={val} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:border-[#1d4ed8]/50" />
                    </div>
                  ))}
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Correo electrónico</label>
                  <input defaultValue="valentina@email.com" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:border-[#1d4ed8]/50" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Celular</label>
                  <input defaultValue="+57 311 234 5678" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:border-[#1d4ed8]/50" />
                </div>
                <Btn variant="primary">Guardar cambios</Btn>
              </div>
            </div>
          )}

          {section === "activity" && (
            <div>
              <h2 className="text-xl font-extrabold text-slate-900 mb-6">Actividad reciente</h2>
              <div className="space-y-3">
                {auditEntries.length === 0 && <p className="text-sm text-slate-500">Sin actividad registrada.</p>}
                {auditEntries.map((a) => (
                  <div key={a.id} className="p-3 bg-white/95 rounded-xl border border-slate-100 flex items-start justify-between">
                    <div>
                      <div className="text-sm font-bold text-slate-800">{a.action}</div>
                      <div className="text-xs text-slate-500">{new Date(a.ts).toLocaleString()}</div>
                      {a.meta && <pre className="text-xs mt-2 text-slate-600 whitespace-pre-wrap">{JSON.stringify(a.meta)}</pre>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {section === "addresses" && (
            <div>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                <div>
                  <h2 className="text-xl font-extrabold text-slate-900">Mis direcciones</h2>
                  <p className="text-sm text-slate-500">Administra tus direcciones de entrega guardadas.</p>
                </div>
                <button type="button" onClick={() => {
                  resetAddressForm();
                  setShowNewAddressForm((prev) => !prev);
                }}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 transition-colors">
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
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">{field.label}</label>
                        <input
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
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">País</label>
                      <input
                        value={addressForm.country}
                        onChange={(e) => setAddressForm((prev) => ({ ...prev, country: e.target.value }))}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:border-[#1d4ed8]/50"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Teléfono</label>
                      <input
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
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

// ─── ADMIN DASHBOARD ──────────────────────────────────────────────────────────

function AdminDashboard({ onNavigate, products, createProduct, updateProduct, deleteProduct, adjustStock, productRefresh, initialSection, homeContent, setHomeContent, homePreviewProducts, setHomePreviewProducts, homeSaleProducts, setHomeSaleProducts, homeNewArrivals, setHomeNewArrivals, saveHomeContent, homeContentSaving, backendAdminAvailable }: {
  onNavigate: (v: View) => void;
  products: Product[];
  createProduct: (product: Omit<Product, "id">) => void;
  updateProduct: (productId: string, updates: Partial<Product>) => void;
  deleteProduct: (productId: string) => void;
  adjustStock: (productId: string, delta: number) => void;
  productRefresh: number;
  initialSection?: string;
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
  backendAdminAvailable?: boolean | null;
}) {
  const [adminSection, setAdminSection] = useState(initialSection ?? "dashboard");
  const [searchTerm, setSearchTerm] = useState("");
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [activeProduct, setActiveProduct] = useState<Product | null>(null);
  const [productForm, setProductForm] = useState<Omit<Product, "id">>({
    name: "", brand: "", price: 0, originalPrice: undefined, discount: undefined,
    rating: 0, reviews: 0, image: "", images: [], category: "Zapatos", subcategory: "Running",
    stock: 0, sku: "", description: "", colors: [], sizes: [], gender: "Unisex",
    isNew: false, isFeatured: false, specs: [],
  });
  const [galleryUrl, setGalleryUrl] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isUploadingGallery, setIsUploadingGallery] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [mainImagePreview, setMainImagePreview] = useState<string>("");

  const metrics = [
    { label: "Productos activos", value: products.length.toString(), change: "+0%", up: true, icon: <Package size={18} /> },
    { label: "Stock total", value: products.reduce((sum, product) => sum + (product.stock ?? 0), 0).toLocaleString('es-CO'), change: "+0%", up: true, icon: <TrendingUp size={18} /> },
    { label: "Valor catálogo", value: fmt(products.reduce((sum, product) => sum + (product.price ?? 0) * Math.max(product.stock ?? 0, 0), 0)), change: "+0%", up: true, icon: <DollarSign size={18} /> },
    { label: "Inventario bajo", value: `${products.filter((product) => (product.stock ?? 0) <= 10).length} productos`, change: "Revisar", up: false, icon: <AlertTriangle size={18} /> },
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
    heroTitle: "Tu ritmo, Tu estilo, Tu mejor versión",
    heroSubtitle: "Zapatillas, ropa deportiva, perfumes y accesorios premium. Todo lo que necesitas para rendir al máximo y lucir increíble.",
    featuredSectionTitle: "Productos destacados",
    newArrivalsSectionTitle: "Novedades",
    saleSectionTitle: "En descuento ahora",
    categorySectionLabel: "Explorar",
    categorySectionTitle: "Todas las categorías",
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
        const bucket = import.meta.env.VITE_SUPABASE_STORAGE_BUCKET ?? 'products';
        const publicUrl = getPublicUrl(bucket, path);
        updateHomeContentField(field, publicUrl as string);
        toast.success('Imagen subida y asignada.');
      }
    } catch (err) {
      console.warn('Section image upload failed', err);
      toast.error('Error subiendo imagen.');
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
    updateAdminSectionUrl(section);
    setAdminSection(section);
  };

  const exportReportsCsv = () => {
    try {
      const rows: string[] = [];
      // Header
      rows.push(['Pedido', 'Cliente', 'Fecha', 'Estado', 'Total', 'Items'].join(','));
      // Orders
      ORDERS.forEach((o) => {
        const line = [
          JSON.stringify(o.id),
          JSON.stringify(o.customer),
          JSON.stringify(o.date),
          JSON.stringify(o.status),
          JSON.stringify(o.total),
          JSON.stringify(o.items),
        ].join(',');
        rows.push(line);
      });

      const csv = rows.join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `reportes_${new Date().toISOString().slice(0,10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error generando CSV:', err);
      toast.error('No se pudo generar el CSV. Intenta nuevamente.');
    }
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
      rating: 0, reviews: 0, image: "", images: [], category: "Zapatos", subcategory: "Running",
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
    const payload: Omit<Product, "id"> = {
      ...productForm,
      colors: productForm.colors.map((color) => ({ name: color.name, hex: color.hex })),
      sizes: productForm.sizes,
      rating: Number(productForm.rating) || 0,
      reviews: Number(productForm.reviews) || 0,
      price: Number(productForm.price) || 0,
      stock: Number(productForm.stock) || 0,
      originalPrice: productForm.originalPrice ? Number(productForm.originalPrice) : undefined,
      discount: productForm.discount ? Number(productForm.discount) : undefined,
    };

    // Validaciones básicas
    const errors: Record<string, string> = {};
    if (!productForm.name.trim()) errors.name = "El nombre es requerido";
    if (!productForm.sku.trim()) errors.sku = "El SKU es requerido";
    if (productForm.price <= 0) errors.price = "El precio debe ser mayor a 0";
    if (productForm.stock < 0) errors.stock = "El stock no puede ser negativo";
    if (!productForm.image && productForm.images.length === 0) errors.image = "Al menos una imagen es requerida";

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      toast.error("Por favor, completa todos los campos requeridos");
      return;
    }

    // Zod validation
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

  type AdminCoupon = { id: string; code: string; discount: string; expires: string };

  const [coupons, setCoupons] = useState<AdminCoupon[]>([
    { id: "c1", code: "DESC10", discount: "10%", expires: "31/08/2026" },
    { id: "c2", code: "ENVIOGRATIS", discount: "Envío gratis", expires: "30/09/2026" },
    { id: "c3", code: "BLACKFRIDAY", discount: "25%", expires: "30/11/2026" },
  ]);
  const [couponForm, setCouponForm] = useState({ code: "", discount: "", expires: "" });
  const [couponMode, setCouponMode] = useState<"create" | "edit">("create");
  const [activeCouponId, setActiveCouponId] = useState<string | null>(null);

  const resetCouponForm = () => {
    setCouponMode("create");
    setActiveCouponId(null);
    setCouponForm({ code: "", discount: "", expires: "" });
  };

  const handleCouponChange = (field: keyof typeof couponForm, value: string) => {
    setCouponForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleCouponSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const code = couponForm.code.trim().toUpperCase();
    if (!code || !couponForm.discount.trim() || !couponForm.expires.trim()) {
      toast.error("Completa todos los campos del cupón.");
      return;
    }

    if (couponMode === "edit" && activeCouponId) {
      setCoupons((prev) =>
        prev.map((coupon) =>
          coupon.id === activeCouponId
            ? { ...coupon, code, discount: couponForm.discount.trim(), expires: couponForm.expires.trim() }
            : coupon
        )
      );
      toast.success("Cupón actualizado.");
    } else {
      setCoupons((prev) => [
        { id: `c-${Date.now()}`, code, discount: couponForm.discount.trim(), expires: couponForm.expires.trim() },
        ...prev,
      ]);
      toast.success("Cupón creado.");
    }

    resetCouponForm();
  };

  const handleEditCoupon = (coupon: AdminCoupon) => {
    setCouponMode("edit");
    setActiveCouponId(coupon.id);
    setCouponForm({ code: coupon.code, discount: coupon.discount, expires: coupon.expires });
  };

  const handleDeleteCoupon = (couponId: string) => {
    if (!confirm("¿Eliminar este cupón? Esta acción no se puede deshacer.")) return;
    setCoupons((prev) => prev.filter((coupon) => coupon.id !== couponId));
    toast.success("Cupón eliminado.");
  };

  const renderAdminSection = () => {
    switch (adminSection) {
      case "dashboard":
        return (
          <>
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 mb-8">
              <div className="xl:col-span-2 p-8 rounded-[30px] bg-slate-950 text-white shadow-[0_20px_60px_-40px_rgba(15,23,42,0.36)]">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="uppercase text-xs tracking-[0.26em] text-slate-400 font-semibold mb-3">Administrador</p>
                    <h2 className="text-3xl sm:text-4xl font-extrabold">Control total de la tienda</h2>
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
                    <p className="text-sm text-slate-500">Usuarios activos hoy</p>
                    <p className="text-2xl font-extrabold text-slate-900">1.250</p>
                  </div>
                  <div className="rounded-3xl bg-slate-50 p-4">
                    <p className="text-sm text-slate-500">Pedidos pendientes</p>
                    <p className="text-2xl font-extrabold text-slate-900">28</p>
                  </div>
                  <div className="rounded-3xl bg-slate-50 p-4">
                    <p className="text-sm text-slate-500">Nuevo ingreso de productos</p>
                    <p className="text-2xl font-extrabold text-slate-900">12</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5 mb-8">
              {metrics.map((m) => (
                <div key={m.label} className="p-5 bg-white/95 rounded-[30px] border border-slate-200/80 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.16)]">
                  <div className="flex items-center justify-between mb-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${m.up ? "bg-slate-100 text-slate-900" : "bg-amber-50 text-amber-600"}`}>
                      {m.icon}
                    </div>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${m.up ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-600"}`}>{m.change}</span>
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
                  <span className="text-xs text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded-full">↑ 21.3% vs semana anterior</span>
                </div>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={SALES_DATA} margin={{ top: 0, right: 0, left: -10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colVentas" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#1d4ed8" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="#1d4ed8" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="day" tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${(v / 1000000).toFixed(1)}M`} />
                    <Tooltip
                      contentStyle={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "12px", color: "#0f172a", fontSize: "12px", boxShadow: "0 4px 20px rgba(0,0,0,0.08)" }}
                      formatter={(v: number) => [`$${v.toLocaleString("es-CO")} COP`, "Ventas"]}
                    />
                    <Area type="monotone" dataKey="ventas" stroke="#1d4ed8" strokeWidth={2} fill="url(#colVentas)" dot={false} activeDot={{ r: 5, fill: "#1d4ed8" }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              <div className="p-5 bg-white/95 rounded-[30px] border border-slate-200/80 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.16)]">
                <h2 className="text-sm font-extrabold text-slate-800 mb-5">Ventas por categoría</h2>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={CAT_DATA} margin={{ top: 0, right: 0, left: -28, bottom: 0 }} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                    <XAxis type="number" tick={{ fill: "#94a3b8", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
                    <YAxis type="category" dataKey="name" tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} width={55} />
                    <Tooltip
                      contentStyle={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "12px", fontSize: "12px", boxShadow: "0 4px 20px rgba(0,0,0,0.08)" }}
                      formatter={(v: number) => [`${v}%`, "Participación"]}
                    />
                    <Bar dataKey="valor" fill="#1d4ed8" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
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
                          <td className="px-5 py-3 text-sm font-extrabold text-slate-900">{fmt(o.total)}</td>
                        </tr>
                      ))}
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
                    <h2 className="text-2xl font-extrabold text-slate-900">Editar secciones de la home</h2>
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
                        <td className="px-4 py-3 text-sm font-extrabold text-slate-900">{fmt(p.price)}</td>
                        <td className="px-4 py-3 text-sm text-slate-700">{p.stock}</td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2">
                            <button onClick={() => handleEditProduct(p)} className="px-3 py-1.5 rounded-lg bg-black text-white font-semibold">Editar</button>
                            <button onClick={() => { if (confirm(`Eliminar ${p.name}? Esta acción no es reversible.`)) handleDeleteProduct(p.id); }} className="px-3 py-1.5 rounded-lg bg-red-50 text-red-600 font-semibold">Eliminar</button>
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
                    <label className="text-xs font-bold text-slate-600 uppercase block mb-2">Categoría</label>
                    <select 
                      value={productForm.category} 
                      onChange={(e) => {
                        const category = e.target.value as Category;
                        updateField('category', category);
                        const [defaultSubcategory] = CATEGORY_SUBCATEGORIES[category] || [''];
                        if (!CATEGORY_SUBCATEGORIES[category].includes(productForm.subcategory)) {
                          updateField('subcategory', defaultSubcategory);
                        }
                      }} 
                      className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 bg-white hover:border-slate-300 focus:border-slate-500 focus:outline-none transition-colors text-slate-700"
                    >
                      {Object.keys(CATEGORY_SUBCATEGORIES).map((cat) => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
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
                    {productForm.images?.length > 0 && (
                      <div className="mt-3">
                        <p className="text-xs font-semibold text-slate-600 mb-2">{productForm.images.length} imagen(es) en galería</p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                        {productForm.images.map((img, index) => (
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
                <span className="text-xs text-slate-500">{ORDERS.length} pedidos registrados</span>
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
                        <td className="px-5 py-3 text-sm font-extrabold text-slate-900">{fmt(o.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="bg-white/95 rounded-[30px] border border-slate-200/80 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.16)] p-5">
              <h3 className="text-lg font-extrabold text-slate-900 mb-3">Resumen de pedidos</h3>
              <p className="text-sm text-slate-600">Consulta el estado de los pedidos recientes, actualiza los estados y gestiona envíos desde aquí.</p>
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
          <div className="space-y-6 mb-6">
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
              <div className="xl:col-span-2 bg-white/95 rounded-[30px] border border-slate-200/80 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.16)] p-5">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
                  <div>
                    <h2 className="text-lg font-extrabold text-slate-900">Cupones</h2>
                    <p className="text-sm text-slate-600">Crea y administra descuentos para tus clientes.</p>
                  </div>
                  <button onClick={resetCouponForm} className="px-4 py-2 rounded-xl bg-black text-white font-semibold hover:bg-slate-900">{couponMode === 'edit' ? 'Nuevo cupón' : 'Limpiar formulario'}</button>
                </div>

                <form onSubmit={handleCouponSubmit} className="grid gap-4 sm:grid-cols-3">
                  <div className="sm:col-span-1">
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Código</label>
                    <input value={couponForm.code} onChange={(e) => handleCouponChange('code', e.target.value)} placeholder="DESC10" className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900" />
                  </div>
                  <div className="sm:col-span-1">
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Descuento</label>
                    <input value={couponForm.discount} onChange={(e) => handleCouponChange('discount', e.target.value)} placeholder="10% / Envío gratis" className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900" />
                  </div>
                  <div className="sm:col-span-1">
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Expira</label>
                    <input value={couponForm.expires} onChange={(e) => handleCouponChange('expires', e.target.value)} placeholder="31/08/2026" className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900" />
                  </div>

                  <div className="sm:col-span-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <p className="text-sm text-slate-500">{couponMode === 'edit' ? 'Edita el cupón y guarda los cambios.' : 'Crea un nuevo código de descuento.'}</p>
                    <button type="submit" className="inline-flex items-center justify-center rounded-2xl bg-black px-5 py-3 text-sm font-semibold text-white hover:bg-slate-900">{couponMode === 'edit' ? 'Actualizar cupón' : 'Crear cupón'}</button>
                  </div>
                </form>
              </div>
              <div className="bg-white/95 rounded-[30px] border border-slate-200/80 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.16)] p-5">
                <h3 className="text-lg font-extrabold text-slate-900 mb-4">Resumen de cupones</h3>
                <p className="text-sm text-slate-600">Gestiona descuentos activos y consulta su fecha de caducidad.</p>
                <div className="mt-6 space-y-3">
                  <div className="rounded-3xl bg-slate-50 p-4">
                    <p className="text-sm text-slate-500">Total de cupones</p>
                    <p className="text-2xl font-extrabold text-slate-900">{coupons.length}</p>
                  </div>
                  <div className="rounded-3xl bg-slate-50 p-4">
                    <p className="text-sm text-slate-500">Cupón próximo a expirar</p>
                    <p className="text-base font-bold text-slate-900">{coupons[0]?.expires ?? 'N/A'}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white/95 rounded-[30px] border border-slate-200/80 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.16)] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px]">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50">
                      {['Código', 'Descuento', 'Expira', 'Acción'].map((h) => (
                        <th key={h} className="text-left px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {coupons.map((coupon) => (
                      <tr key={coupon.id} className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                        <td className="px-4 py-3 text-sm font-semibold text-slate-800">{coupon.code}</td>
                        <td className="px-4 py-3 text-sm text-slate-600">{coupon.discount}</td>
                        <td className="px-4 py-3 text-sm text-slate-600">{coupon.expires}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-2">
                            <button type="button" onClick={() => handleEditCoupon(coupon)} className="px-3 py-1.5 rounded-xl bg-slate-100 text-slate-700 text-xs font-semibold">Editar</button>
                            <button type="button" onClick={() => handleDeleteCoupon(coupon.id)} className="px-3 py-1.5 rounded-xl bg-red-50 text-red-600 text-xs font-semibold">Eliminar</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );

      case "reports":
        return (
          <div className="space-y-6 mb-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
              {metrics.map((m) => (
                <div key={m.label} className="p-5 bg-white/95 rounded-[30px] border border-slate-200/80 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.16)]">
                  <div className="flex items-center justify-between mb-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${m.up ? "bg-slate-100 text-slate-900" : "bg-amber-50 text-amber-600"}`}>
                      {m.icon}
                    </div>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${m.up ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-600"}`}>{m.change}</span>
                  </div>
                  <p className="text-2xl font-extrabold text-slate-900">{m.value}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{m.label}</p>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 p-5 bg-white/95 rounded-[30px] border border-slate-200/80 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.16)]">
                <h3 className="text-lg font-extrabold text-slate-900 mb-4">Reporte de ventas</h3>
                <p className="text-sm text-slate-600">Visualiza tendencias de ventas y compara el rendimiento por categoría.</p>
              </div>
              <div className="p-5 bg-white/95 rounded-[30px] border border-slate-200/80 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.16)]">
                <h3 className="text-lg font-extrabold text-slate-900 mb-4">Exportar reportes</h3>
                <button onClick={() => exportReportsCsv()} className="w-full py-3 rounded-xl bg-black text-white font-semibold hover:bg-slate-900">Descargar CSV</button>
              </div>
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
              <div className="rounded-3xl bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-800">Seguridad</p>
                <p className="text-sm text-slate-500">Cambia contraseñas y configura validación de dos pasos.</p>
              </div>
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

  const handleImageFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Show preview immediately
    const reader = new FileReader();
    reader.onload = (event) => {
      setMainImagePreview(event.target?.result as string);
    };
    reader.readAsDataURL(file);

    setIsUploadingImage(true);
    try {
      const data = await uploadProductImage(file);
      const path = (data as any)?.path ?? (data as any)?.Key ?? null;
      if (path) {
        const bucket = import.meta.env.VITE_SUPABASE_STORAGE_BUCKET ?? 'products';
        const publicUrl = getPublicUrl(bucket, path);
        updateField('image', publicUrl as any);
        toast.success('Imagen cargada exitosamente');
      }
    } catch (err) {
      console.warn('Image upload failed', err);
      toast.error('Error al cargar la imagen. Intenta nuevamente o usa una URL.');
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleGalleryFilesChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    const bucket = import.meta.env.VITE_SUPABASE_STORAGE_BUCKET ?? 'products';
    const uploadedUrls: string[] = [];

    setIsUploadingGallery(true);
    const totalFiles = files.length;
    let uploadedCount = 0;

    for (const file of Array.from(files)) {
      try {
        const data = await uploadProductImage(file, `products/${Date.now()}-${file.name}`);
        const path = (data as any)?.path ?? (data as any)?.Key ?? null;
        if (path) {
          uploadedUrls.push(getPublicUrl(bucket, path) as string);
        }
        uploadedCount++;
        // Show progress
        if (uploadedCount % Math.ceil(totalFiles / 3) === 0) {
          toast.success(`Cargadas ${uploadedCount}/${totalFiles} imágenes`);
        }
      } catch (err) {
        console.warn('Gallery image upload failed', err);
      }
    }

    if (uploadedUrls.length > 0) {
      updateField('images', [...(productForm.images ?? []), ...uploadedUrls] as any);
      toast.success(`${uploadedUrls.length} imágenes cargadas a la galería`);
    } else {
      toast.error('No se pudieron cargar las imágenes. Intenta nuevamente.');
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
          {SIDEBAR_LINKS.map((l) => (
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
                {SIDEBAR_LINKS.map((link) => (
                  <option key={link.id} value={link.id}>{link.label}</option>
                ))}
              </select>
              <button type="button" onClick={() => onNavigate("home")} className="whitespace-nowrap rounded-3xl bg-black px-4 py-3 text-sm font-semibold text-white hover:bg-slate-900">Tienda</button>
            </div>
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {SIDEBAR_LINKS.map((link) => (
                <button type="button" key={link.id} onClick={() => handleSidebarClick(link.id)} className={`rounded-full px-4 py-2 text-sm font-semibold ${adminSection === link.id ? 'bg-black text-white' : 'bg-slate-100 text-slate-700'}`}>
                  {link.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        {backendAdminAvailable === false ? (
          <div className="mb-6 p-4 rounded-lg bg-yellow-50 border border-yellow-100 text-yellow-800">
            <strong>Backend admin no disponible.</strong> Algunas funciones administrativas pueden no estar disponibles. (Error 404 en /api/v1/admin/*)
          </div>
        ) : null}

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
  const [view, setView] = useState<View>("home");
  const [backendHomeAvailable, setBackendHomeAvailable] = useState<boolean | null>(null);
  const [backendAdminAvailable, setBackendAdminAvailable] = useState<boolean | null>(null);
  const [initialAdminSection, setInitialAdminSection] = useState<string | undefined>(undefined);
  const [products, setProducts] = useState<Product[]>([]);
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

    const loadHomeContent = async () => {
      const normalizeApiRoot = (url?: string) => {
        const trimmed = url?.trim().replace(/\/$/, '');
        if (!trimmed) return '/api/v1';
        if (trimmed.endsWith('/api/v1')) return trimmed;
        if (trimmed.endsWith('/api')) return `${trimmed}/v1`;
        return `${trimmed}/api/v1`;
      };
      const apiUrl = normalizeApiRoot(import.meta.env.VITE_API_URL);
      try {
        const res = await fetch(`${apiUrl}/home-content`);
        if (!res.ok) {
          if (res.status === 404 && apiUrl !== '/api/v1') {
            const fallbackRes = await fetch(`/api/v1/home-content`);
            if (fallbackRes.ok) {
              setBackendHomeAvailable(true);
              const fallbackJson = await fallbackRes.json();
              if (fallbackJson?.data) {
                setHomeContent((prev) => ({ ...prev, ...fallbackJson.data }));
              }
              return;
            }
          }
          setBackendHomeAvailable(false);
          return;
        }
        setBackendHomeAvailable(true);
        const json = await res.json();
        if (json?.data) {
          setHomeContent((prev) => ({ ...prev, ...json.data }));
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
      const isSupabaseConfigured = Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);
      const isApiConfigured = Boolean(import.meta.env.VITE_API_URL);

      const tryLoadingFromAdminApi = async () => {
        try {
          const response = await adminApi.fetchSupabaseProducts();
          setBackendAdminAvailable(true);
          if (!isActive) return false;
          if (Array.isArray(response) && response.length > 0) {
            setProducts(response.map(mapProductRecordToAppProduct));
            return true;
          }
        } catch (error) {
          console.warn('No se pudo cargar productos desde el backend admin.', error);
          setBackendAdminAvailable(false);
        }
        return false;
      };

      const tryLoadingFromSupabase = async () => {
        try {
          const data = await fetchProductsFromSupabase(24);
          if (!isActive) return false;
          if (data.length > 0) {
            setProducts(data.map(mapProductRecordToAppProduct));
            return true;
          }
        } catch (error) {
          console.warn('No se pudo cargar productos desde Supabase.', error);
        }
        return false;
      };

      if (isApiConfigured) {
        const loaded = await tryLoadingFromAdminApi();
        if (loaded) return;
      }

      if (isSupabaseConfigured) {
        const loaded = await tryLoadingFromSupabase();
        if (loaded) return;
      }

      console.warn('No se cargaron productos desde Supabase ni el backend admin. El catálogo quedará vacío hasta que haya datos en la base de datos.');
    };

    void loadProducts();
    return () => {
      isActive = false;
    };
  }, [productRefresh]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [filterCategory, setFilterCategory] = useState<Category | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [addresses, setAddresses] = useState<Address[]>(loadStoredAddresses);
  const [selectedAddressId, setSelectedAddressId] = useState<string>(() => {
    const stored = loadStoredAddresses();
    return stored[0]?.id ?? DEFAULT_ADDRESSES[0].id;
  });
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  // Dev helper: force admin session when visiting URL with ?forceAdmin=1
  // Only active when VITE_ENABLE_FORCE_ADMIN === '1'
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      if (import.meta.env.VITE_ENABLE_FORCE_ADMIN !== '1') return;
      const params = new URLSearchParams(window.location.search);
      if (params.get('forceAdmin') === '1') {
        const adminEmail = import.meta.env.VITE_ADMIN_EMAIL ?? 'admin@urbansportstore.dev';
        const localUser = { id: 'local-admin', email: adminEmail, user_metadata: { full_name: 'Administrador local', role: 'ADMIN', isAdmin: true } } as unknown as User;
        setAuthUser(localUser);
        setIsAdmin(true);
        setView('admin');
        setInitialAdminSection('homepage');
      }
    } catch (e) {
      // no-op
    }
  }, []);
  const [homeContent, setHomeContent] = useState<HomePageContent>({
    heroTitle: "Tu ritmo, Tu estilo, Tu mejor versión",
    heroSubtitle: "Zapatillas, ropa deportiva, perfumes y accesorios premium. Todo lo que necesitas para rendir al máximo y lucir increíble.",
    featuredSectionTitle: "Productos destacados",
    newArrivalsSectionTitle: "Novedades",
    saleSectionTitle: "En descuento ahora",
    categorySectionLabel: "Explorar",
    categorySectionTitle: "Todas las categorías",
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
      await updateHomeContentApi(homeContent);
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
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const paramView = params.get("view");
    const paramSection = params.get("adminSection");

    if (paramView === "admin" && isAdmin) {
      setView("admin");
      if (paramSection) {
        setInitialAdminSection(paramSection);
      }
      return;
    }

    if (paramView === "admin" && !isAdmin) {
      const url = new URL(window.location.href);
      url.searchParams.delete("view");
      url.searchParams.delete("adminSection");
      window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    }

    setView("home");
    setInitialAdminSection(undefined);
  }, [isAdmin]);

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
        setSelectedAddressId(next[0]?.id ?? DEFAULT_ADDRESSES[0].id);
      }
      return next.length ? next : DEFAULT_ADDRESSES;
    });
  };

  useEffect(() => {
    let subscription: { unsubscribe: () => void } | null = null;

    const syncSession = async () => {
      try {
        const user = await getCurrentUser();
        setAuthUser(user);
        setIsLoggedIn(Boolean(user));
        setIsAdmin(isAdminUser(user));
      } catch (error) {
        console.warn("No se pudo cargar la sesión de usuario.", error);
      }
    };

    void syncSession();
    subscription = onAuthStateChange((_event, session) => {
      const user = session?.user ?? null;
      setAuthUser(user);
      setIsLoggedIn(Boolean(user));
      setIsAdmin(isAdminUser(user));
    });

    return () => subscription?.unsubscribe();
  }, []);

  useEffect(() => {
    if (!isAdmin && view === "admin") {
      navigate("login");
      return;
    }
    if (!isAdmin && view === "account") {
      // allow account for normal users only
      return;
    }
  }, [view, isAdmin]);

  const handleAuthSuccess = (user: User | null, adminStatus: boolean) => {
    setAuthUser(user);
    setIsLoggedIn(Boolean(user) || adminStatus);
    setIsAdmin(adminStatus);
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
    navigate("home");
  };

  const refreshProducts = () => setProductRefresh((value) => value + 1);

  const createProduct = async (product: Omit<Product, "id">) => {
    try {
      const record = mapAppProductToProductRecord({ ...product, id: crypto.randomUUID() });
      const created = await createProductWithFallback(record);
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
      const record = mapAppProductToProductRecord({ ...products.find((product) => product.id === productId), ...updates, id: productId });
      const { id: _ignoredId, ...recordUpdates } = record;
      const updated = await updateProductWithFallback(productId, recordUpdates);
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
      await deleteProductWithFallback(productId);
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
      // Diagnostic
      // eslint-disable-next-line no-console
      console.log('navigate ->', v);
      setView(v);

      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        if (v === "admin") {
          url.searchParams.set("view", "admin");
        } else {
          url.searchParams.delete("view");
          url.searchParams.delete("adminSection");
        }
        window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
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
    setCart((prev) => {
      const key = `${p.id}-${size}`;
      const existing = prev.find((i) => `${i.product.id}-${i.selectedSize}` === key);
      if (existing) {
        return prev.map((i) =>
          `${i.product.id}-${i.selectedSize}` === key ? { ...i, qty: i.qty + 1 } : i
        );
      }
      return [...prev, { product: p, qty: 1, selectedSize: size, selectedColor: color }];
    });
    setCartOpen(true);
  };

  const handleUpdateCart = (id: string, size: string, qty: number) => {
    if (qty <= 0) handleRemoveFromCart(id, size);
    else setCart((prev) =>
      prev.map((i) => i.product.id === id && i.selectedSize === size ? { ...i, qty } : i)
    );
  };

  const handleRemoveFromCart = (id: string, size: string) => {
    setCart((prev) => prev.filter((i) => !(i.product.id === id && i.selectedSize === size)));
  };

  const handleCheckout = () => {
    setCartOpen(false);
    if (!isLoggedIn) { navigate("login"); return; }
    navigate("checkout");
  };

  return (
    <div className="min-h-screen bg-[#f4f5f7] text-slate-900" style={{ fontFamily: "'Manrope', system-ui, sans-serif" }}>
      {view !== "admin" && (
        <>
          <Navbar
            cart={cart} onNavigate={navigate}
            onCartOpen={() => setCartOpen(true)}
            isLoggedIn={isLoggedIn}
            isAdmin={isAdmin}
            authUser={authUser}
            currentView={view}
            products={products}
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
          featuredProducts={homePreviewProducts}
          newArrivalsProducts={homeNewArrivals}
          saleProducts={homeSaleProducts}
        />
      )}
      {view === "catalog" && (
        <CatalogPage
          products={products}
          filterCategory={filterCategory}
          onSelectProduct={handleSelectProduct}
          onAddToCart={handleAddToCart}
          onNavigate={navigate}
          onCategorySelect={handleCategorySelect}
        />
      )}
      {view === "product" && selectedProduct && (
        <ProductDetailPage
          product={selectedProduct}
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
      {view === "account" && (
        <AccountPage
          onNavigate={navigate}
          onLogout={handleLogout}
          addresses={addresses}
          onCreateAddress={createAddress}
          onUpdateAddress={updateAddress}
          onDeleteAddress={deleteAddress}
        />
      )}
      {view === "admin" && isAdmin && (
        <AdminDashboard
          onNavigate={navigate}
          products={products}
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
          backendAdminAvailable={backendAdminAvailable}
        />
      )}
      {view === "admin" && !isAdmin && <LoginPage isRegister={false} onNavigate={navigate} onLogin={handleAuthSuccess} />}

      {cartOpen && (
        <CartDrawer
          cart={cart} onClose={() => setCartOpen(false)}
          onUpdate={handleUpdateCart} onRemove={handleRemoveFromCart}
          onCheckout={handleCheckout}
        />
      )}

      {/* Mobile bottom nav removed for web-style layout */}
    </div>
  );
}

