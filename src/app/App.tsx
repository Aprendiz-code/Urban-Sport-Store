import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import type { User } from '@supabase/supabase-js';
import {
  ShoppingCart, Search, Menu, X, Star, ChevronRight, Package,
  Users, TrendingUp, AlertTriangle, Check, Eye, EyeOff,
  Bell, LogOut, Plus, Minus, Trash2, MapPin, CreditCard, Shield,
  Truck, ChevronLeft, Heart, ArrowRight, Filter,
  BarChart2, Home, Settings, Tag, Layers, Edit,
  RefreshCw, Award, Grid3X3
} from "lucide-react";
import PromoCarousel from "./components/PromoCarousel";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from "recharts";
import { fetchProductsFromSupabase, type ProductRecord } from "../lib/supabase-store";
import {
  signInWithEmail,
  signUpWithEmail,
  signOut,
  getCurrentUser,
  onAuthStateChange,
  isAdminUser,
} from "../lib/supabase-auth";

import adminApi from "../lib/admin-api";
import { uploadProductImage, getPublicUrl } from "../lib/supabase-store";
import { recordAction, getAudit } from "../lib/audit";
import { productSchema } from '../lib/schemas';
import { Toaster } from './components/ui/sonner';
import { toast } from 'sonner';

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

// ─── DATA ────────────────────────────────────────────────────────────────────

let PRODUCTS: Product[] = [
  {
    id: "1", name: "Nike Air Zoom Pegasus 40", brand: "Nike", price: 449900,
    originalPrice: 529900, discount: 15, rating: 4.8, reviews: 1842,
    image: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=700&h=700&fit=crop&auto=format",
    category: "Zapatos", subcategory: "Running", gender: "Hombre",
    stock: 18, sku: "NK-AZP40-H",
    description: "El Nike Air Zoom Pegasus 40 ofrece más comodidad que nunca. La tecnología Air Zoom te impulsa con cada zancada para que puedas rodar más lejos.",
    colors: [{ name: "Negro", hex: "#1a1a1a" }, { name: "Blanco", hex: "#f5f5f5" }, { name: "Azul", hex: "#1d4ed8" }],
    sizes: ["40", "41", "42", "43", "44", "45"],
    specs: ["Peso: 283 g", "Drop: 10 mm", "Entresuela React Foam", "Suela de goma translúcida", "Unidad Air Zoom en antepié", "Mesh transpirable"],
    isFeatured: true, isNew: true,
  },
  {
    id: "2", name: "Adidas Ultraboost 23", brand: "Adidas", price: 529900,
    rating: 4.9, reviews: 2103,
    image: "https://images.unsplash.com/photo-1606107557195-0e29a4b5b4aa?w=700&h=700&fit=crop&auto=format",
    category: "Zapatos", subcategory: "Running", gender: "Mujer",
    stock: 14, sku: "AD-UB23-M",
    description: "Las Adidas Ultraboost 23 llevan la tecnología Boost a un nuevo nivel. Diseñadas para mayor retorno de energía y comodidad duradera.",
    colors: [{ name: "Blanco", hex: "#f5f5f5" }, { name: "Negro", hex: "#1a1a1a" }, { name: "Rosa", hex: "#f472b6" }],
    sizes: ["36", "37", "38", "39", "40", "41"],
    specs: ["Tecnología Boost", "Upper Primeknit+", "Torsion System", "Entresuela LEP 2.0+", "Peso: 264 g"],
    isFeatured: true,
  },
  {
    id: "3", name: "Nike Tech Fleece Full-Zip Hoodie", brand: "Nike", price: 289900,
    originalPrice: 329900, discount: 12, rating: 4.7, reviews: 634,
    image: "https://images.unsplash.com/photo-1556821840-3a63f15732ce?w=700&h=700&fit=crop&auto=format",
    category: "Ropa Hombre", subcategory: "Buzos y hoodies",
    stock: 30, sku: "NK-TFHZ-H",
    description: "La hoodie Tech Fleece de Nike combina calidez y peso ligero. Su tejido exclusivo atrapa el calor sin añadir volumen innecesario.",
    colors: [{ name: "Negro", hex: "#1a1a1a" }, { name: "Gris", hex: "#6b7280" }, { name: "Azul marino", hex: "#1e3a8a" }],
    sizes: ["XS", "S", "M", "L", "XL", "XXL"],
    specs: ["Material: 66% algodón, 34% poliéster", "Tejido Tech Fleece de 3 capas", "Bolsillos laterales con cremallera", "Capucha ajustable", "Peso: 490 g"],
    isFeatured: true,
  },
  {
    id: "4", name: "Adidas Tiro 23 League Track Pants", brand: "Adidas", price: 159900,
    rating: 4.5, reviews: 421,
    image: "https://images.unsplash.com/photo-1506629082955-511b1aa562c8?w=700&h=700&fit=crop&auto=format",
    category: "Ropa Hombre", subcategory: "Pantalones",
    stock: 42, sku: "AD-T23LP-H",
    description: "Los pantalones Tiro 23 son el favorito de los jugadores de fútbol. Corte slim y tela AEROREADY para mantenerte seco durante el entrenamiento.",
    colors: [{ name: "Negro", hex: "#1a1a1a" }, { name: "Azul marino", hex: "#1e3a8a" }],
    sizes: ["XS", "S", "M", "L", "XL", "XXL"],
    specs: ["Tela AEROREADY", "Bolsillos laterales", "Tobillo con cremallera", "Ajuste slim fit", "Cinturilla elástica"],
    isNew: true,
  },
  {
    id: "5", name: "Nike Pro 365 Leggings 7/8", brand: "Nike", price: 149900,
    originalPrice: 189900, discount: 21, rating: 4.8, reviews: 987,
    image: "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=700&h=700&fit=crop&auto=format",
    category: "Ropa Mujer", subcategory: "Leggings", gender: "Mujer",
    stock: 55, sku: "NK-P365L-M",
    description: "Los leggings Nike Pro 365 están diseñados para el movimiento. La tela Dri-FIT mantiene la humedad alejada para que puedas dar el máximo.",
    colors: [{ name: "Negro", hex: "#1a1a1a" }, { name: "Morado", hex: "#7c3aed" }, { name: "Verde lima", hex: "#84cc16" }],
    sizes: ["XS", "S", "M", "L", "XL"],
    specs: ["Tela Dri-FIT", "Cinturilla ancha de alta sujeción", "Bolsillo posterior", "Largo 7/8", "Tejido con 13% elastano"],
    isFeatured: true,
  },
  {
    id: "6", name: "Puma Suede Classic XXI", brand: "Puma", price: 219900,
    originalPrice: 269900, discount: 19, rating: 4.6, reviews: 779,
    image: "https://images.unsplash.com/photo-1525966222134-fcfa99b8ae77?w=700&h=700&fit=crop&auto=format",
    category: "Zapatos", subcategory: "Casual", gender: "Unisex",
    stock: 22, sku: "PM-SUEDE21",
    description: "Un ícono desde 1968, el Puma Suede sigue siendo tan relevante como siempre. Upper de gamuza premium con amortiguación SoftFoam+ para máxima comodidad.",
    colors: [{ name: "Negro", hex: "#1a1a1a" }, { name: "Blanco", hex: "#f5f5f5" }, { name: "Rojo", hex: "#dc2626" }, { name: "Azul", hex: "#1d4ed8" }],
    sizes: ["38", "39", "40", "41", "42", "43", "44"],
    specs: ["Upper de gamuza premium", "Entresuela SoftFoam+", "Suela de goma vulcanizada", "Clásico logo PUMA lateral"],
    isFeatured: true,
  },
  {
    id: "7", name: "Sauvage Dior EDT 100 ml", brand: "Dior", price: 399900,
    rating: 4.9, reviews: 1234,
    image: "https://images.unsplash.com/photo-1541643600914-78b084683702?w=700&h=700&fit=crop&auto=format",
    category: "Perfumes", subcategory: "Hombre", gender: "Hombre",
    stock: 20, sku: "DR-SVG-100",
    description: "Sauvage es una fragancia de contraste. Fresca y magistralmente elaborada con bergamota de Calabria y ambroxan que crea un rastro persistente.",
    colors: [],
    sizes: ["30 ml", "60 ml", "100 ml", "200 ml"],
    specs: ["Familia: Aromática fresca", "Notas de salida: Bergamota calabresa", "Notas de corazón: Pimienta de Sichuan", "Notas de fondo: Ambroxan", "Concentración: EDT"],
    isFeatured: true,
  },
  {
    id: "8", name: "La Vie Est Belle Lancôme 75 ml", brand: "Lancôme", price: 319900,
    originalPrice: 379900, discount: 16, rating: 4.8, reviews: 892,
    image: "https://images.unsplash.com/photo-1568702846914-96b305d2aaeb?w=700&h=700&fit=crop&auto=format",
    category: "Perfumes", subcategory: "Mujer", gender: "Mujer",
    stock: 17, sku: "LC-LVEB-75",
    description: "La Vie Est Belle: la vida es bella. Una fragancia gourmand floral que celebra la felicidad femenina y la elección de vivir según los propios valores.",
    colors: [],
    sizes: ["30 ml", "50 ml", "75 ml", "100 ml"],
    specs: ["Familia: Floral gourmand", "Notas de salida: Iris, jazmin", "Notas de corazón: Pachulí, vetiver", "Notas de fondo: Praliné, vainilla", "Concentración: EDP"],
    isFeatured: true,
  },
  {
    id: "9", name: "Garmin Forerunner 265", brand: "Garmin", price: 899900,
    rating: 4.8, reviews: 517,
    image: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=700&h=700&fit=crop&auto=format",
    category: "Relojes", subcategory: "Smartwatch Running", gender: "Unisex",
    stock: 9, sku: "GRM-FR265",
    description: "El Garmin Forerunner 265 con pantalla AMOLED a color. Seguimiento avanzado de salud, métricas de running de nivel elite y hasta 13 días de batería.",
    colors: [{ name: "Negro", hex: "#1a1a1a" }, { name: "Blanco", hex: "#f5f5f5" }, { name: "Turquesa", hex: "#0d9488" }],
    sizes: ["Talla única"],
    specs: ["Pantalla AMOLED 1.3\"", "GPS multibanda", "Batería hasta 13 días", "Resistencia al agua 5 ATM", "Monitor cardíaco óptico", "Seguimiento de O₂ en sangre", "Peso: 47 g"],
    isFeatured: true, isNew: true,
  },
  {
    id: "10", name: "Oakley Sutro Lite", brand: "Oakley", price: 389900,
    originalPrice: 449900, discount: 13, rating: 4.7, reviews: 328,
    image: "https://images.unsplash.com/photo-1577803645773-f96470509666?w=700&h=700&fit=crop&auto=format",
    category: "Gafas", subcategory: "Running", gender: "Unisex",
    stock: 25, sku: "OK-SUTLITE",
    description: "Diseñadas para running y ciclismo de alto rendimiento. Las Oakley Sutro Lite ofrecen un campo visual amplísimo con el mínimo peso posible.",
    colors: [{ name: "Negro mate", hex: "#1a1a1a" }, { name: "Blanco", hex: "#f5f5f5" }, { name: "Rojo", hex: "#dc2626" }],
    sizes: ["Talla única"],
    specs: ["Lente Prizm Road", "Protección UV 100%", "Marco O-Matter ultraligero", "Peso: 29 g", "Lente polarizado: No", "Patillas ajustables"],
    isFeatured: true,
  },
  {
    id: "11", name: "Nike Metcon 9", brand: "Nike", price: 399900,
    rating: 4.7, reviews: 445,
    image: "https://images.unsplash.com/photo-1539185441755-769473a23570?w=700&h=700&fit=crop&auto=format",
    category: "Zapatos", subcategory: "Gym y training", gender: "Hombre",
    stock: 11, sku: "NK-MTC9-H",
    description: "Las Nike Metcon 9 son las zapatillas de entrenamiento más versátiles del mercado. Suela plana para levantamiento de pesas y amortiguación zonal para sprints.",
    colors: [{ name: "Negro", hex: "#1a1a1a" }, { name: "Gris", hex: "#6b7280" }, { name: "Naranja", hex: "#f97316" }],
    sizes: ["39", "40", "41", "42", "43", "44", "45"],
    specs: ["Suela React ampliada", "Zona de talón estable", "Lengüeta Flyknit", "Agarre multidireccional", "Compatible con peso libre"],
    isNew: true,
  },
  {
    id: "12", name: "Under Armour Charged Assert 10", brand: "Under Armour", price: 279900,
    originalPrice: 369900, discount: 24, rating: 4.5, reviews: 663,
    image: "https://images.unsplash.com/photo-1491553895911-0055eca6402d?w=700&h=700&fit=crop&auto=format",
    category: "Zapatos", subcategory: "Running", gender: "Mujer",
    stock: 33, sku: "UA-CA10-M",
    description: "Las Under Armour Charged Assert 10 ofrecen amortiguación Charged para mayor retorno de energía y una suela de goma solida de alta durabilidad.",
    colors: [{ name: "Blanco", hex: "#f5f5f5" }, { name: "Rosa", hex: "#f472b6" }, { name: "Negro", hex: "#1a1a1a" }],
    sizes: ["36", "37", "38", "39", "40", "41"],
    specs: ["Amortiguación Charged", "Upper mesh transpirable", "Suela goma duradera", "Peso: 221 g", "Drop: 10 mm"],
  },
];

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
      className="group relative bg-white rounded-[30px] overflow-hidden cursor-pointer border border-slate-200/80 shadow-[0_15px_40px_-28px_rgba(15,23,42,0.35)] hover:-translate-y-1 hover:shadow-[0_20px_60px_-30px_rgba(15,23,42,0.45)] transition-all duration-300 flex flex-col h-full"
    >
      {/* Image */}
      <div className="relative h-56 bg-slate-100 overflow-hidden">
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
      <div className="p-5 space-y-4 flex flex-col flex-1">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-[#1d4ed8] mb-2">{product.brand}</p>
          <h3 className="text-base font-extrabold text-slate-900 line-clamp-2 leading-snug">{product.name}</h3>
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
          className="mt-auto w-full py-3 rounded-full text-sm font-bold bg-black text-white hover:bg-slate-900 transition-all duration-200 flex items-center justify-center gap-2 shadow-sm shadow-slate-200"
        >
          <ShoppingCart size={14} /> Agregar al carrito
        </button>
      </div>
    </div>
  );
}

// ─── NAVBAR ──────────────────────────────────────────────────────────────────

function Navbar({ cart, onNavigate, onCartOpen, isLoggedIn, isAdmin, authUser, currentView, onLoginClick, onLogout, onCategorySelect }: {
  cart: CartItem[]; onNavigate: (v: View) => void;
  onCartOpen: () => void; isLoggedIn: boolean; isAdmin: boolean;
  authUser: User | null; currentView: View; onLoginClick: () => void; onLogout: () => void;
  onCategorySelect: (c: Category) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [searchVal, setSearchVal] = useState("");
  const cartCount = cart.reduce((s, i) => s + i.qty, 0);
  const showCustomerOrders = !isAdmin && !isAdminUser(authUser);

  return (
    <div className="fixed top-0 left-0 right-0 z-50">
      {/* Announce Bar (carousel) */}
      <PromoCarousel
        variant="marquee"
        intervalMs={7800}
        messages={[
          "Envíos gratis a toda Colombia por compras superiores a $250.000",
          "Aceptamos todos los medios de pago: Tarjeta de crédito, débito y PSE. ¡Compra 100% segura!",
          "Soporte y atención al cliente las 24 horas",
        ]}
      />

      {/* Main Navbar */}
      <nav className="bg-white border-b border-slate-100 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-4">
          {/* Logo */}
          <button onClick={() => onNavigate("home")} className="flex items-center gap-2 shrink-0">
            <span className="text-2xl sm:text-[2.1rem] font-extrabold text-slate-900 hidden sm:block tracking-tight leading-none">
              Urban<span className="text-[#1d4ed8]">Sport</span>
              <span className="block text-[12px] sm:text-[13px] font-semibold text-slate-400 tracking-widest uppercase">Store</span>
            </span>
          </button>

          {/* Search */}
          <div className="flex-1 max-w-xl hidden sm:flex relative">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={searchVal} onChange={(e) => setSearchVal(e.target.value)}
              placeholder="Buscar zapatillas, ropa, relojes…"
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:border-[#1d4ed8]/50 focus:bg-white transition-all"
            />
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
                        <button onClick={() => { onNavigate("account"); setUserOpen(false); }}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-50 transition-colors">
                          <Package size={14} /> Mis pedidos
                        </button>
                      )}
                      {isAdmin && (
                        <button onClick={() => { onNavigate("admin"); setUserOpen(false); }}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-50 transition-colors">
                          <BarChart2 size={14} /> Panel admin
                        </button>
                      )}
                      <div className="border-t border-slate-100 mt-1 pt-1">
                        <button onClick={() => { onLogout(); setUserOpen(false); }}
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

            <button onClick={() => setMenuOpen(!menuOpen)}
              className="md:hidden w-10 h-10 rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-100 transition-colors">
              {menuOpen ? <X size={19} /> : <Menu size={19} />}
            </button>
          </div>
        </div>

        {/* Categories Bar */}
        {(currentView === "home" || currentView === "catalog") && (
          <div className="hidden md:flex border-t border-slate-100 overflow-x-auto">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center gap-1 h-11">
              {NAV_CATEGORIES.map((cat) => (
                <button key={cat.name}
                  onClick={() => onCategorySelect(cat.name)}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-semibold text-slate-600 hover:text-[#1d4ed8] hover:bg-blue-50 transition-colors whitespace-nowrap">
                  {cat.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Mobile menu */}
        {(currentView === "home" || currentView === "catalog") && menuOpen && (
          <div className="md:hidden border-t border-slate-100 bg-white px-4 py-3 space-y-1">
            <div className="relative mb-3">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input placeholder="Buscar…" className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none" />
            </div>
            {NAV_CATEGORIES.map((cat) => (
              <button key={cat.name}
                onClick={() => { onCategorySelect(cat.name); setMenuOpen(false); }}
                className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm text-slate-600 hover:bg-slate-50 transition-colors">
                {cat.name}
              </button>
            ))}
          </div>
        )}
      </nav>
    </div>
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

function HomePage({ onNavigate, onSelectProduct, onAddToCart, onCategorySelect }: {
  onNavigate: (v: View) => void; onSelectProduct: (p: Product) => void;
  onAddToCart: (p: Product, size: string, color: string) => void;
  onCategorySelect: (c: Category) => void;
}) {
  const featured = PRODUCTS.filter((p) => p.isFeatured);
  const newArrivals = PRODUCTS.filter((p) => p.isNew);
  const onSale = PRODUCTS.filter((p) => p.discount);

  return (
    <main className="pt-[132px]">
      {/* Hero */}
      <section className="relative min-h-[88vh] flex items-center overflow-hidden bg-slate-900">
        <img
          src="https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?w=1600&h=900&fit=crop&auto=format"
          alt="Atleta en acción" className="absolute inset-0 w-full h-full object-cover object-top"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-slate-900/95 via-slate-900/60 to-slate-900/20" />

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 py-24 w-full">
          <div className="max-w-lg">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#f97316]/20 border border-[#f97316]/30 text-[#f97316] text-xs font-bold tracking-widest uppercase mb-6">
              <Award size={12} /> Colección 2026
            </div>
            <h1 className="text-5xl sm:text-6xl font-extrabold text-white leading-[1.05] tracking-tight mb-5">
              Tu ritmo.{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#f97316] to-[#fbbf24]">Tu estilo.</span>
              <br />Tu mejor versión.
            </h1>
            <p className="text-lg text-slate-300 leading-relaxed mb-8 max-w-md">
              Zapatillas, ropa deportiva, perfumes y accesorios premium. Todo lo que necesitas para rendir al máximo y lucir increíble.
            </p>
            <div className="flex flex-wrap gap-3">
              <Btn variant="primary" size="lg" onClick={() => onNavigate("catalog")}>
                Comprar ahora <ArrowRight size={16} />
              </Btn>
              <button onClick={() => onNavigate("catalog")}
                className="px-6 py-3.5 text-base font-bold text-white border-2 border-white/30 rounded-xl hover:bg-white/10 transition-all">
                Ver novedades
              </button>
            </div>
          </div>
        </div>

      </section>

      {/* Categories grid */}
      <section className="py-16 max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-end justify-between mb-8">
          <div>
            <p className="text-xs font-bold text-[#1d4ed8] tracking-widest uppercase mb-1.5">Explorar</p>
            <h2 className="text-2xl font-extrabold text-slate-900">Todas las categorías</h2>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {HOME_CATEGORIES.map((cat) => (
            <button key={cat.name}
              onClick={() => onCategorySelect(cat.name as Category)}
              className="group relative rounded-2xl overflow-hidden aspect-[3/2] bg-slate-200 hover:shadow-lg transition-all duration-300">
              <img src={cat.image} alt={cat.name} className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 via-slate-900/20 to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-3">
                <p className="text-xs font-extrabold text-white leading-tight">{cat.name}</p>
                <p className="text-[10px] text-slate-300">{cat.sub}</p>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Featured */}
      <section className="py-8 max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-end justify-between mb-8">
          <div>
            <p className="text-xs font-bold text-[#1d4ed8] tracking-widest uppercase mb-1.5">Lo más buscado</p>
            <h2 className="text-2xl font-extrabold text-slate-900">Productos destacados</h2>
          </div>
          <Btn variant="ghost" onClick={() => onNavigate("catalog")}>Ver todos <ChevronRight size={14} /></Btn>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {featured.slice(0, 4).map((p) => (
            <ProductCard key={p.id} product={p} onSelect={onSelectProduct} onAddToCart={onAddToCart} />
          ))}
        </div>
      </section>

      {/* Promo banners */}
      <section className="py-8 max-w-7xl mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {/* Hombre */}
          <div className="relative rounded-[32px] overflow-hidden h-56 bg-slate-900 shadow-[0_20px_60px_-35px_rgba(15,23,42,0.45)]">
            <img src="https://images.unsplash.com/photo-1556821840-3a63f15732ce?w=700&h=450&fit=crop&auto=format"
              alt="Ropa Hombre" className="absolute inset-0 w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-r from-slate-950/90 to-slate-900/15" />
            <div className="absolute inset-0 p-8 flex flex-col justify-end">
              <p className="text-xs font-semibold text-[#fbbf24] uppercase tracking-[0.3em] mb-1.5">Temporada 2026</p>
              <h3 className="text-3xl font-extrabold text-white mb-3">Ropa Hombre</h3>
              <button onClick={() => onCategorySelect("Ropa Hombre")}
                className="inline-flex items-center gap-2 text-sm font-bold text-slate-900 bg-white px-5 py-3 rounded-full hover:bg-slate-100 transition-all w-fit">
                Explorar <ArrowRight size={14} />
              </button>
            </div>
          </div>
          {/* Mujer */}
          <div className="relative rounded-[32px] overflow-hidden h-56 bg-slate-100 shadow-[0_20px_60px_-35px_rgba(15,23,42,0.12)]">
            <img src="https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=700&h=450&fit=crop&auto=format"
              alt="Ropa Mujer" className="absolute inset-0 w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-r from-white/80 to-transparent" />
            <div className="absolute inset-0 p-8 flex flex-col justify-end">
              <p className="text-xs font-semibold text-[#1d4ed8] uppercase tracking-[0.3em] mb-1.5">Colección nueva</p>
              <h3 className="text-3xl font-extrabold text-slate-900 mb-3">Ropa Mujer</h3>
              <button onClick={() => onCategorySelect("Ropa Mujer")}
                className="inline-flex items-center gap-2 text-sm font-bold text-white bg-black px-5 py-3 rounded-full hover:bg-slate-900 transition-all w-fit">
                Explorar <ArrowRight size={14} />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* New arrivals */}
      {newArrivals.length > 0 && (
        <section className="py-8 max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-end justify-between mb-8">
            <div>
              <p className="text-xs font-bold text-emerald-600 tracking-widest uppercase mb-1.5">Recién llegados</p>
              <h2 className="text-2xl font-extrabold text-slate-900">Novedades</h2>
            </div>
            <Btn variant="ghost" onClick={() => onNavigate("catalog")}>Ver todos <ChevronRight size={14} /></Btn>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {newArrivals.slice(0, 4).map((p) => (
              <ProductCard key={p.id} product={p} onSelect={onSelectProduct} onAddToCart={onAddToCart} />
            ))}
          </div>
        </section>
      )}

      {/* Sale */}
      <section className="py-8 bg-orange-50 border-y border-orange-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-end justify-between mb-8">
            <div>
              <p className="text-xs font-bold text-[#f97316] tracking-widest uppercase mb-1.5">Oferta especial</p>
              <h2 className="text-2xl font-extrabold text-slate-900">En descuento ahora</h2>
            </div>
            <Btn variant="ghost" onClick={() => onNavigate("catalog")}>Ver todos <ChevronRight size={14} /></Btn>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {onSale.slice(0, 4).map((p) => (
              <ProductCard key={p.id} product={p} onSelect={onSelectProduct} onAddToCart={onAddToCart} />
            ))}
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="py-14">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
            {[
              { icon: <Truck size={22} />, color: "bg-blue-100 text-[#1d4ed8]", title: "Envío gratis", desc: "En compras mayores a $250.000 COP" },
              { icon: <Shield size={22} />, color: "bg-green-100 text-green-700", title: "Pago seguro", desc: "Tus datos siempre protegidos" },
              { icon: <RefreshCw size={22} />, color: "bg-orange-100 text-orange-600", title: "30 días devolución", desc: "Sin preguntas, sin complicaciones" },
              { icon: <Bell size={22} />, color: "bg-purple-100 text-purple-600", title: "Soporte 24/7", desc: "Chat, email y teléfono" },
            ].map((b) => (
              <div key={b.title} className="flex flex-col items-center text-center p-5 rounded-[30px] bg-white/95 border border-slate-200/80 shadow-[0_20px_60px_-45px_rgba(15,23,42,0.18)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_24px_70px_-45px_rgba(15,23,42,0.22)]">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-3 ${b.color}`}>
                  {b.icon}
                </div>
                <p className="text-sm font-bold text-slate-800 mb-1">{b.title}</p>
                <p className="text-xs text-slate-500">{b.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Newsletter */}
      <section className="py-16 bg-[#1d4ed8]">
        <div className="max-w-xl mx-auto px-4 text-center">
          <p className="text-xs font-bold text-blue-200 uppercase tracking-widest mb-3">Mantente al día</p>
          <h2 className="text-2xl font-extrabold text-white mb-2">Recibe ofertas exclusivas</h2>
          <p className="text-blue-200 text-sm mb-6">Suscríbete y obtén 10% de descuento en tu primera compra.</p>
          <div className="flex gap-2 max-w-sm mx-auto">
            <input type="email" placeholder="tu@email.com"
              className="flex-1 px-4 py-3 rounded-xl text-sm text-slate-800 bg-white placeholder-slate-400 focus:outline-none" />
            <button onClick={() => toast.success('¡Gracias! Te notificaremos cuando haya ofertas disponibles.')}
              className="px-5 py-3 rounded-xl bg-[#f97316] text-white text-sm font-bold hover:bg-orange-600 transition-colors whitespace-nowrap">
              Suscribirme
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-900 text-slate-300 pt-14 pb-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 mb-10">
            <div className="col-span-2 sm:col-span-1">
              <div className="flex items-center gap-2 mb-4">
                <span className="font-extrabold text-white text-sm">Urban<span className="text-[#f97316]">Sport</span></span>
              </div>
              <p className="text-xs leading-relaxed text-slate-400">Moda deportiva y accesorios premium. Tu mejor versión empieza aquí.</p>
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

function CatalogPage({ filterCategory, onSelectProduct, onAddToCart, onNavigate }: {
  filterCategory: Category | null; onSelectProduct: (p: Product) => void;
  onAddToCart: (p: Product, size: string, color: string) => void;
  onNavigate: (v: View) => void;
}) {
  const [selectedCat, setSelectedCat] = useState<Category | null>(filterCategory);
  const [selectedBrand, setSelectedBrand] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState("relevancia");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  const allBrands = [...new Set(PRODUCTS.map((p) => p.brand))];
  const filtered = useMemo(() => {
    let list = PRODUCTS;
    if (selectedCat) list = list.filter((p) => p.category === selectedCat);
    if (selectedBrand) list = list.filter((p) => p.brand === selectedBrand);
    if (sortBy === "precio-asc") list = [...list].sort((a, b) => a.price - b.price);
    if (sortBy === "precio-desc") list = [...list].sort((a, b) => b.price - a.price);
    if (sortBy === "rating") list = [...list].sort((a, b) => b.rating - a.rating);
    if (sortBy === "novedades") list = [...list].sort((a) => a.isNew ? -1 : 1);
    return list;
  }, [selectedCat, selectedBrand, sortBy]);

  return (
    <main className="pt-[132px] min-h-screen max-w-7xl mx-auto px-4 sm:px-6 py-8">
      {/* Breadcrumbs */}
      <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-6">
          <button onClick={() => onNavigate("home")} className="hover:text-slate-600 cursor-pointer">Inicio</button>
        <span className="text-slate-700 font-semibold">{selectedCat ?? "Todos los productos"}</span>
      </div>

      <div className="flex gap-8">
        {/* Sidebar */}
        <aside className="hidden lg:block w-56 shrink-0 space-y-6">
          <div>
            <p className="text-xs font-bold text-slate-800 uppercase tracking-widest mb-3">Categoría</p>
            <div className="space-y-0.5">
              <button onClick={() => setSelectedCat(null)}
                className={`w-full text-left px-3 py-2 rounded-xl text-sm transition-colors ${!selectedCat ? "bg-[#1d4ed8] text-white font-bold" : "text-slate-600 hover:bg-slate-100"}`}>
                Todos ({PRODUCTS.length})
              </button>
              {NAV_CATEGORIES.map((cat) => {
                const count = PRODUCTS.filter((p) => p.category === cat.name).length;
                return (
                  <button key={cat.name}
                    onClick={() => setSelectedCat(cat.name as Category)}
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
            {["Hombre", "Mujer", "Unisex"].map((g) => (
              <label key={g} className="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-slate-100 cursor-pointer">
                <input type="checkbox" className="accent-[#1d4ed8]" />
                <span className="text-sm text-slate-600">{g}</span>
              </label>
            ))}
          </div>
        </aside>

        {/* Main */}
        <div className="flex-1 min-w-0">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-3 mb-5">
            <h1 className="text-lg font-extrabold text-slate-900 flex-1">
              {selectedCat ?? "Todos los productos"}
              <span className="text-sm font-normal text-slate-400 ml-2">({filtered.length} resultados)</span>
            </h1>
            <button className="lg:hidden flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-slate-200 text-sm text-slate-600 shadow-sm">
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
            <div className="flex border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
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

          {/* Active filters */}
          {(selectedCat || selectedBrand) && (
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <span className="text-xs text-slate-500">Filtros:</span>
              {selectedCat && (
                <button onClick={() => setSelectedCat(null)}
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
              <button onClick={() => { setSelectedCat(null); setSelectedBrand(null); }}
                className="text-xs text-slate-400 hover:text-slate-600 transition-colors underline">Limpiar todo</button>
            </div>
          )}

          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 gap-4">
              <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center">
                <Package size={28} className="text-slate-400" />
              </div>
              <p className="text-slate-500">Sin resultados para estos filtros.</p>
              <Btn variant="outline" onClick={() => { setSelectedCat(null); setSelectedBrand(null); }}>Limpiar filtros</Btn>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
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
    <main className="pt-[132px] min-h-screen max-w-7xl mx-auto px-4 sm:px-6 py-8">
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
          <div className="aspect-square bg-slate-50 rounded-2xl overflow-hidden border border-slate-100">
            <img src={product.image} alt={product.name} className="w-full h-full object-cover" />
          </div>
          <div className="grid grid-cols-4 gap-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className={`aspect-square rounded-xl overflow-hidden border-2 cursor-pointer transition-colors ${i === 0 ? "border-[#1d4ed8]" : "border-slate-200 hover:border-slate-300"}`}>
                <img src={product.image} alt="" className="w-full h-full object-cover" />
              </div>
            ))}
          </div>
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

          {/* Trust */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { icon: <Truck size={14} />, text: "Envío gratis\n+$250.000" },
              { icon: <Shield size={14} />, text: "Garantía\noficial" },
              { icon: <RefreshCw size={14} />, text: "30 días\ndevolución" },
            ].map((t) => (
              <div key={t.text} className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-slate-50 border border-slate-100">
                <span className="text-[#1d4ed8]">{t.icon}</span>
                <span className="text-[10px] text-slate-500 text-center whitespace-pre-line leading-tight">{t.text}</span>
              </div>
            ))}
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
          {PRODUCTS.filter((p) => p.id !== product.id && p.category === product.category).slice(0, 4).map((p) => (
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
    <main className="pt-[132px] min-h-screen flex items-center justify-center px-4">
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
    <main className="pt-[132px] min-h-screen max-w-5xl mx-auto px-4 sm:px-6 py-10">
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
            <div className="space-y-4">
              <h3 className="text-lg font-extrabold text-slate-900 mb-4">Dirección de entrega</h3>
              {addresses.map((a) => (
                <label key={a.id} className={`flex gap-3 p-4 rounded-2xl border-2 cursor-pointer transition-all ${selectedAddressId === a.id ? "border-[#1d4ed8] bg-blue-50/50" : "border-slate-200 hover:border-slate-300"}`}>
                  <input type="radio" name="addr" checked={selectedAddressId === a.id} onChange={() => onSelectAddress(a.id)} className="mt-0.5 accent-[#1d4ed8]" />
                  <div>
                    <p className="text-sm font-bold text-slate-800 flex items-center gap-2">
                      <MapPin size={13} className="text-[#1d4ed8]" /> {a.label}
                      {a.isDefault && <Badge variant="new">Predeterminada</Badge>}
                    </p>
                    <p className="text-sm text-slate-500 mt-0.5">{a.line1}{a.line2 ? `, ${a.line2}` : ""}</p>
                    <p className="text-sm text-slate-500">{a.city}, {a.state} · {a.postalCode}</p>
                    <p className="text-sm text-slate-500">{a.country} · {a.phone}</p>
                  </div>
                </label>
              ))}
              <button type="button" onClick={() => setShowNewAddress((prev) => !prev)}
                className="w-full p-4 rounded-2xl border-2 border-dashed border-slate-200 text-slate-500 hover:border-[#1d4ed8]/50 hover:text-[#1d4ed8] transition-all flex items-center justify-center gap-2 text-sm font-semibold">
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
            <div className="space-y-4">
              <h3 className="text-lg font-extrabold text-slate-900 mb-4">Método de envío</h3>
              {SHIP.map((opt, i) => (
                <label key={opt.name} className={`flex gap-3 p-4 rounded-2xl border-2 cursor-pointer transition-all ${selectedShip === i ? "border-[#1d4ed8] bg-blue-50/50" : "border-slate-200 hover:border-slate-300"}`}>
                  <input type="radio" name="ship" checked={selectedShip === i} onChange={() => setSelectedShip(i)} className="mt-0.5 accent-[#1d4ed8]" />
                  <Truck size={16} className={`mt-0.5 shrink-0 ${selectedShip === i ? "text-[#1d4ed8]" : "text-slate-400"}`} />
                  <div className="flex-1">
                    <p className="text-sm font-bold text-slate-800">{opt.name}</p>
                    <p className="text-xs text-slate-500">{opt.desc}</p>
                  </div>
                  <span className={`text-sm font-extrabold ${opt.price === 0 ? "text-emerald-600" : "text-slate-800"}`}>{opt.tag}</span>
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

          <div className="flex gap-3 mt-8">
            {step > 0 && <Btn variant="secondary" onClick={() => setStep(step - 1)}><ChevronLeft size={14} /> Atrás</Btn>}
            <Btn variant="primary" className="flex-1" size="lg" onClick={() => setStep(step + 1)}>
              {step === 2 ? <><Shield size={15} /> Pagar {fmt(total)} COP</> : <>Continuar <ChevronRight size={15} /></>}
            </Btn>
          </div>
        </div>

        {/* Summary */}
        <div className="lg:col-span-1">
          <div className="bg-white/95 rounded-[30px] border border-slate-200/80 shadow-[0_22px_60px_-42px_rgba(15,23,42,0.18)] p-5 sticky top-[152px] space-y-4">
            <h3 className="text-sm font-extrabold text-slate-800">Resumen del pedido</h3>
            <div className="space-y-3 max-h-52 overflow-y-auto">
              {cart.map((item) => (
                <div key={`${item.product.id}-${item.selectedSize}`} className="flex gap-3">
                  <div className="relative shrink-0">
                    <img src={item.product.image} alt="" className="w-12 h-12 rounded-lg object-cover bg-slate-100" />
                    <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-[#1d4ed8] text-white text-[9px] font-bold flex items-center justify-center">{item.qty}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-700 line-clamp-2 leading-tight">{item.product.name}</p>
                    {item.selectedSize !== "Talla única" && <p className="text-[10px] text-slate-400 mt-0.5">T: {item.selectedSize}</p>}
                    <p className="text-xs font-extrabold text-slate-900 mt-0.5">{fmt(item.product.price * item.qty)}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input placeholder="Código de cupón" className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-[#1d4ed8]/50" />
              <Btn variant="outline" size="sm">Aplicar</Btn>
            </div>
            <div className="space-y-1.5 text-sm border-t border-slate-100 pt-3">
              <div className="flex justify-between text-slate-500"><span>Subtotal</span><span className="font-semibold text-slate-800">{fmt(subtotal)}</span></div>
              <div className="flex justify-between text-slate-500">
                <span>Envío</span>
                <span className={SHIP[selectedShip].price === 0 ? "text-emerald-600 font-bold" : "font-semibold text-slate-800"}>
                  {SHIP[selectedShip].price === 0 ? "Gratis" : fmt(SHIP[selectedShip].price)}
                </span>
              </div>
              <div className="flex justify-between font-extrabold text-slate-900 text-base border-t border-slate-100 pt-1.5">
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
  const adminHintEmail = import.meta.env.VITE_ADMIN_EMAIL ?? 'admin@urbansportstore.dev';
  const adminHintPassword = import.meta.env.VITE_ADMIN_PASSWORD ?? 'Admin123!';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      let user = null;
      let adminStatus = false;
      if (isRegister) {
        const { data, error: signUpError } = await signUpWithEmail(email, password, { name });
        if (signUpError) throw signUpError;
        if (!data.user) throw new Error("No se pudo crear la cuenta.");
        user = data.user;
      } else {
        const { data, error: signInError } = await signInWithEmail(email, password);
        if (signInError) throw signInError;
        if (!data.user) throw new Error("No se pudo iniciar sesión.");
        user = data.user;
      }

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
    <main className="pt-[132px] min-h-screen flex">
      {/* Left panel */}
      <div className="hidden lg:flex flex-col justify-between w-1/2 relative overflow-hidden bg-slate-900">
        <img src="https://images.unsplash.com/photo-1517963628607-235ccdd5476c?w=900&h=1200&fit=crop&auto=format"
          alt="" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-b from-slate-900/70 via-slate-900/40 to-slate-900/80" />
        <div className="relative z-10 p-10">
          <div className="flex items-center gap-2">
            <span className="font-extrabold text-white text-sm">Urban<span className="text-[#f97316]">Sport</span><span className="block text-[10px] font-semibold text-slate-300 tracking-widest uppercase">Store</span></span>
          </div>
        </div>
        <div className="relative z-10 p-10">
          <h2 className="text-3xl font-extrabold text-white mb-4 leading-tight">
            Tu mejor versión<br />empieza aquí.
          </h2>
          <div className="space-y-3">
            {["Envío gratis en pedidos +$250.000 COP", "30 días de devolución garantizados", "Productos 100% originales", "Soporte 24/7 en español"].map((t) => (
              <div key={t} className="flex items-center gap-3 text-sm text-slate-200">
                <Check size={15} className="text-[#f97316] shrink-0" /> {t}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center px-4 py-16 bg-white">
        <div className="w-full max-w-md space-y-6">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900">{isRegister ? "Crear cuenta" : "Bienvenido de vuelta"}</h1>
            <p className="text-sm text-slate-500 mt-1">{isRegister ? "Únete a UrbanSport Store" : "Ingresa a tu cuenta para continuar"}</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {isRegister && (
              <div className="grid grid-cols-2 gap-4">
                {[["Nombre", "Diego"], ["Apellido", "Martínez"]].map(([lbl, ph]) => (
                  <div key={lbl}>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">{lbl}</label>
                    <input placeholder={ph} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#1d4ed8]/50 transition-colors" />
                  </div>
                ))}
              </div>
            )}
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Correo electrónico</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="diego@email.com" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#1d4ed8]/50 transition-colors" />
            </div>
            <div>
              <div className="flex justify-between mb-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Contraseña</label>
                {!isRegister && <button type="button" onClick={() => toast('Función de recuperación de contraseña próximamente disponible.')}
                className="text-xs text-[#1d4ed8] hover:underline">¿Olvidaste tu contraseña?</button>}
              </div>
              <div className="relative">
                <input type={showPass ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#1d4ed8]/50 transition-colors" />
                <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>
            {isLocalAuthFallback && !isRegister && (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                <p className="font-semibold text-slate-900 mb-2">Login admin local</p>
                <p className="text-slate-600">Usa estas credenciales para entrar al panel admin:</p>
                <p className="mt-2 text-xs text-slate-500">Correo: <span className="font-medium text-slate-800">{adminHintEmail}</span></p>
                <p className="text-xs text-slate-500">Contraseña: <span className="font-medium text-slate-800">{adminHintPassword}</span></p>
              </div>
            )}
            {isRegister && (
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input type="checkbox" className="mt-0.5 accent-[#1d4ed8]" />
                <span className="text-xs text-slate-500">Acepto los <button type="button" onClick={() => toast('Términos próximamente disponible.')} className="text-[#1d4ed8] hover:underline">Términos</button> y la <button type="button" onClick={() => toast('Política de privacidad próximamente disponible.')} className="text-[#1d4ed8] hover:underline">Política de privacidad</button>.</span>
              </label>
            )}
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button type="submit" disabled={loading}
              className="w-full py-3.5 rounded-xl bg-[#1d4ed8] text-white font-extrabold text-sm hover:bg-[#1e40af] disabled:opacity-60 shadow-lg shadow-blue-200 transition-all flex items-center justify-center gap-2">
              {loading ? <><RefreshCw size={15} className="animate-spin" /> Procesando…</> : isRegister ? "Crear cuenta" : "Iniciar sesión"}
            </button>
          </form>

          <div className="relative flex items-center gap-3">
            <div className="flex-1 h-px bg-slate-200" />
            <span className="text-xs text-slate-400">o continúa con</span>
            <div className="flex-1 h-px bg-slate-200" />
          </div>

          <button onClick={() => toast('Función de inicio con Google próximamente disponible.')}
            className="w-full py-3 rounded-xl border border-slate-200 bg-white text-sm text-slate-700 font-semibold hover:bg-slate-50 transition-colors flex items-center justify-center gap-2 shadow-sm">
            <svg width="16" height="16" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20H24v8h11.3C33.6 33.4 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.7 1.1 7.8 2.9l5.7-5.7C34 6.5 29.2 4 24 4 13 4 4 13 4 24s9 20 20 20c11 0 20-9 20-20 0-1.3-.1-2.7-.4-4z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.5 15.1 18.9 12 24 12c3 0 5.7 1.1 7.8 2.9l5.7-5.7C34 6.5 29.2 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.3 26.7 36 24 36c-5.2 0-9.6-3.4-11.2-8H6.5C9.9 37.7 16.5 44 24 44z"/><path fill="#1976D2" d="M43.6 20H24v8h11.3c-.8 2.2-2.2 4.1-4 5.5l6.2 5.2C40.6 35.4 44 30.1 44 24c0-1.3-.1-2.7-.4-4z"/></svg>
            Continuar con Google
          </button>

          <p className="text-center text-sm text-slate-500">
            {isRegister ? "¿Ya tienes cuenta? " : "¿No tienes cuenta? "}
            <button onClick={() => onNavigate(isRegister ? "login" : "register")} className="text-[#1d4ed8] font-bold hover:underline">
              {isRegister ? "Inicia sesión" : "Regístrate gratis"}
            </button>
          </p>
        </div>
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
    <main className="pt-[132px] min-h-screen max-w-5xl mx-auto px-4 sm:px-6 py-8">
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

function AdminDashboard({ onNavigate, products, createProduct, updateProduct, deleteProduct, adjustStock, productRefresh, initialSection }: {
  onNavigate: (v: View) => void;
  products: Product[];
  createProduct: (product: Omit<Product, "id">) => void;
  updateProduct: (productId: string, updates: Partial<Product>) => void;
  deleteProduct: (productId: string) => void;
  adjustStock: (productId: string, delta: number) => void;
  productRefresh: number;
  initialSection?: string;
}) {
  const [adminSection, setAdminSection] = useState(initialSection ?? "dashboard");
  const [searchTerm, setSearchTerm] = useState("");
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [activeProduct, setActiveProduct] = useState<Product | null>(null);
  const [productForm, setProductForm] = useState<Omit<Product, "id">>({
    name: "", brand: "", price: 0, originalPrice: undefined, discount: undefined,
    rating: 0, reviews: 0, image: "", category: "Zapatos", subcategory: "Running",
    stock: 0, sku: "", description: "", colors: [], sizes: [], gender: "Unisex",
    isNew: false, isFeatured: false, specs: [],
  });

  const METRICS = [
    { label: "Ventas totales", value: "$40.200.000", change: "+14.2%", up: true, icon: <TrendingUp size={18} /> },
    { label: "Pedidos", value: "366", change: "+9.8%", up: true, icon: <Package size={18} /> },
    { label: "Clientes", value: "3.241", change: "+6.1%", up: true, icon: <Users size={18} /> },
    { label: "Inventario bajo", value: "5 productos", change: "Revisar", up: false, icon: <AlertTriangle size={18} /> },
  ];

  const SIDEBAR_LINKS = [
    { id: "dashboard", icon: <Home size={16} />, label: "Inicio" },
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
    const url = new URL(window.location.href);
    url.searchParams.set("view", "admin");
    url.searchParams.set("adminSection", section);
    window.history.replaceState({}, "", url.pathname + url.search);
  };

  const handleSidebarClick = (section: string) => {
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
      rating: 0, reviews: 0, image: "", category: "Zapatos", subcategory: "Running",
      stock: 0, sku: "", description: "", colors: [], sizes: [], gender: "Unisex",
      isNew: false, isFeatured: false, specs: [],
    });
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

    // Zod validation
    try {
      productSchema.parse(payload as any);
    } catch (err: any) {
      const message = err?.errors?.[0]?.message ?? 'Datos de producto inválidos';
      toast.error(String(message));
      return;
    }
    if (!payload.sku) payload.sku = `SKU-${Date.now().toString().slice(-6)}`;

    if (formMode === "edit" && activeProduct) {
      void updateProduct(activeProduct.id, payload);
    } else {
      void createProduct(payload);
    }

    resetForm();
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
              {METRICS.map((m) => (
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
              <h3 className="text-lg font-extrabold text-slate-900 mb-3">{formMode === 'edit' ? 'Editar producto' : 'Crear producto'}</h3>
              <form onSubmit={handleFormSubmit} className="space-y-3">
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase">Nombre</label>
                  <input value={productForm.name} onChange={(e) => updateField('name', e.target.value)} className="w-full px-3 py-2 mt-1 rounded-lg border border-slate-200 bg-slate-50" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase">Marca</label>
                  <input value={productForm.brand} onChange={(e) => updateField('brand', e.target.value)} className="w-full px-3 py-2 mt-1 rounded-lg border border-slate-200 bg-slate-50" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase">Precio</label>
                    <input type="number" value={productForm.price as any} onChange={(e) => updateField('price', Number(e.target.value))} className="w-full px-3 py-2 mt-1 rounded-lg border border-slate-200 bg-slate-50" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase">Stock</label>
                    <input type="number" value={productForm.stock as any} onChange={(e) => updateField('stock', Number(e.target.value))} className="w-full px-3 py-2 mt-1 rounded-lg border border-slate-200 bg-slate-50" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase">Categoría</label>
                    <select value={productForm.category} onChange={(e) => {
                      const category = e.target.value as Category;
                      updateField('category', category);
                      const [defaultSubcategory] = CATEGORY_SUBCATEGORIES[category] || [''];
                      if (!CATEGORY_SUBCATEGORIES[category].includes(productForm.subcategory)) {
                        updateField('subcategory', defaultSubcategory);
                      }
                    }} className="w-full px-3 py-2 mt-1 rounded-lg border border-slate-200 bg-slate-50 text-slate-700">
                      {Object.keys(CATEGORY_SUBCATEGORIES).map((cat) => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase">Subcategoría</label>
                    <select value={productForm.subcategory} onChange={(e) => updateField('subcategory', e.target.value)} className="w-full px-3 py-2 mt-1 rounded-lg border border-slate-200 bg-slate-50 text-slate-700">
                      {(CATEGORY_SUBCATEGORIES[productForm.category] || []).map((subcat) => (
                        <option key={subcat} value={subcat}>{subcat}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase">SKU</label>
                  <input value={productForm.sku} onChange={(e) => updateField('sku', e.target.value)} className="w-full px-3 py-2 mt-1 rounded-lg border border-slate-200 bg-slate-50" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase">Imagen (archivo o URL)</label>
                  <input type="file" accept="image/*" onChange={handleImageFileChange} className="w-full px-3 py-2 mt-1 rounded-lg border border-slate-200 bg-slate-50" />
                  <input value={productForm.image} onChange={(e) => updateField('image', e.target.value)} placeholder="O pega una URL pública" className="w-full px-3 py-2 mt-2 rounded-lg border border-slate-200 bg-slate-50" />
                </div>
                <div className="flex items-center gap-2">
                  <button type="submit" className="px-4 py-2 rounded-xl bg-black text-white font-semibold">{formMode === 'edit' ? 'Guardar cambios' : 'Crear'}</button>
                  <button type="button" onClick={() => resetForm()} className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700">Cancelar</button>
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
              {METRICS.map((m) => (
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
                <button className="w-full py-3 rounded-xl bg-black text-white font-semibold hover:bg-slate-900">Descargar CSV</button>
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
    try {
      const data = await uploadProductImage(file);
      const path = (data as any)?.path ?? (data as any)?.Key ?? null;
      if (path) {
        const bucket = import.meta.env.VITE_SUPABASE_STORAGE_BUCKET ?? 'products';
        const publicUrl = getPublicUrl(bucket, path);
        updateField('image', publicUrl as any);
      }
    } catch (err) {
      console.warn('Image upload failed', err);
    }
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
            <button key={l.id} onClick={() => handleSidebarClick(l.id)}
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
              <button onClick={() => onNavigate("home")} className="whitespace-nowrap rounded-3xl bg-black px-4 py-3 text-sm font-semibold text-white hover:bg-slate-900">Tienda</button>
            </div>
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {SIDEBAR_LINKS.map((link) => (
                <button key={link.id} onClick={() => handleSidebarClick(link.id)} className={`rounded-full px-4 py-2 text-sm font-semibold ${adminSection === link.id ? 'bg-black text-white' : 'bg-slate-100 text-slate-700'}`}>
                  {link.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        {renderAdminSection()}
      </main>
    </div>
  );
}

// ─── APP ─────────────────────────────────────────────────────────────────────

export default function App() {
  const [view, setView] = useState<View>("home");
  const [initialAdminSection, setInitialAdminSection] = useState<string | undefined>(undefined);

  useEffect(() => {
    let isActive = true;

    const loadProducts = async () => {
      const url = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      if (!url || !anonKey) return;

      try {
        const data = await fetchProductsFromSupabase(12);
        if (!isActive) return;
        if (data.length > 0) {
          PRODUCTS = data.map(mapProductRecordToAppProduct);
        }
      } catch (error) {
        console.warn("No se pudo cargar productos desde Supabase; se mantendrán los datos locales.", error);
      }
    };

    void loadProducts();
    return () => {
      isActive = false;
    };
  }, []);
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
  const [productRefresh, setProductRefresh] = useState(0);

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
      const created = await adminApi.createProductApi(product as any);
      if (created?.id) {
        PRODUCTS = [created as Product, ...PRODUCTS];
        refreshProducts();
        try { recordAction('create_product', { id: created.id, name: created.name }); } catch (e) { }
        return;
      }
    } catch (err) {
      console.warn("Backend create product failed, falling back to local:", err);
    }

    const newProduct = { ...product, id: crypto.randomUUID() };
    PRODUCTS = [newProduct, ...PRODUCTS];
    refreshProducts();
    try { recordAction('create_product_local', { id: newProduct.id, name: newProduct.name }); } catch (e) { }
  };

  const updateProduct = async (productId: string, updates: Partial<Product>) => {
    try {
      const updated = await adminApi.updateProductApi(productId, updates as any);
      if (updated?.id) {
        PRODUCTS = PRODUCTS.map((p) => p.id === productId ? updated as Product : p);
        refreshProducts();
        try { recordAction('update_product', { id: updated.id, name: updated.name }); } catch (e) { }
        return;
      }
    } catch (err) {
      console.warn("Backend update failed, falling back to local:", err);
    }

    PRODUCTS = PRODUCTS.map((product) => product.id === productId ? { ...product, ...updates } : product);
    refreshProducts();
    try { recordAction('update_product_local', { id: productId, updates }); } catch (e) { }
  };

  const deleteProduct = async (productId: string) => {
    try {
      await adminApi.deleteProductApi(productId);
      PRODUCTS = PRODUCTS.filter((product) => product.id !== productId);
      refreshProducts();
      try { recordAction('delete_product', { id: productId }); } catch (e) { }
      return;
    } catch (err) {
      console.warn("Backend delete failed, falling back to local:", err);
    }

    PRODUCTS = PRODUCTS.filter((product) => product.id !== productId);
    refreshProducts();
    try { recordAction('delete_product_local', { id: productId }); } catch (e) { }
  };

  const adjustStock = async (productId: string, delta: number) => {
    try {
      await adminApi.createInventoryMovement(productId, delta, 'adjustment');
      PRODUCTS = PRODUCTS.map((product) => product.id === productId ? { ...product, stock: Math.max(0, product.stock + delta) } : product);
      const updated = PRODUCTS.find((p) => p.id === productId);
      refreshProducts();
      try { recordAction('inventory_movement', { id: productId, delta }); } catch (e) { }
      try {
        if (updated && updated.stock <= 5) {
          // simple notification for low stock
          // later replace with Toaster/sonner
          // eslint-disable-next-line no-alert
          alert(`Stock bajo: ${updated.name} tiene ${updated.stock} unidades`);
        }
      } catch (e) { /* ignore */ }
      return;
      return;
    } catch (err) {
      console.warn('Backend inventory movement failed, falling back to local adjust:', err);
    }

    PRODUCTS = PRODUCTS.map((product) => product.id === productId ? { ...product, stock: Math.max(0, product.stock + delta) } : product);
    const updated = PRODUCTS.find((p) => p.id === productId);
    refreshProducts();
    try {
      if (updated && updated.stock <= 5) {
        // notification for low stock
        toast(`Stock bajo: ${updated.name} tiene ${updated.stock} unidades`);
      }
    } catch (e) { /* ignore */ }
  };

  const navigate = (v: View) => {
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
  };

  const handleSelectProduct = (p: Product) => {
    setSelectedProduct(p);
    navigate("product");
  };

  const handleCategorySelect = (cat: Category) => {
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
            onLoginClick={() => navigate("login")}
            onLogout={handleLogout}
            onCategorySelect={handleCategorySelect}
          />
          <Toaster />
        </>
      )}
      {view === "home" && (
        <HomePage
          onNavigate={navigate} onSelectProduct={handleSelectProduct}
          onAddToCart={handleAddToCart} onCategorySelect={handleCategorySelect}
        />
      )}
      {view === "catalog" && (
        <CatalogPage
          filterCategory={filterCategory}
          onSelectProduct={handleSelectProduct}
          onAddToCart={handleAddToCart}
          onNavigate={navigate}
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
          products={PRODUCTS}
          createProduct={createProduct}
          updateProduct={updateProduct}
          deleteProduct={deleteProduct}
          adjustStock={adjustStock}
          productRefresh={productRefresh}
          initialSection={initialAdminSection}
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

      {/* Mobile bottom nav */}
      {view !== "admin" && (
        <div className="fixed bottom-0 left-0 right-0 md:hidden bg-white border-t border-slate-200 z-40 flex">
        {[
          { label: "Inicio", icon: <Home size={20} />, view: "home" as View },
          { label: "Buscar", icon: <Search size={20} />, view: "catalog" as View },
          { label: "Carrito", icon: <ShoppingCart size={20} />, action: () => setCartOpen(true) },
          { label: "Cuenta", icon: <Users size={20} />, view: isLoggedIn ? "account" as View : "login" as View },
        ].map((item) => (
          <button
            key={item.label}
            onClick={item.action ?? (() => navigate(item.view!))}
            className={`flex-1 flex flex-col items-center justify-center py-2.5 gap-1 text-[10px] font-bold transition-colors ${
              !item.action && view === item.view ? "text-[#1d4ed8]" : "text-slate-400"
            }`}
          >
            <div className="relative">
              {item.icon}
              {item.label === "Carrito" && cart.reduce((s, i) => s + i.qty, 0) > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-[#f97316] text-white text-[8px] font-bold flex items-center justify-center">
                  {cart.reduce((s, i) => s + i.qty, 0)}
                </span>
              )}
            </div>
            {item.label}
          </button>
        ))}
      </div>
      )}
    </div>
  );
}
