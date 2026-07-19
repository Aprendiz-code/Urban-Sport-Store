import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, '../../data/products.json');

export interface ProductData {
  id: string;
  name: string;
  slug?: string;
  sku?: string;
  description?: string;
  price: number;
  compareAtPrice?: number | null;
  stock: number;
  status?: string;
  category?: string | null;
  categoryId?: string;
  brand?: string | null;
  brandId?: string;
  images?: Array<{ url: string }>;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ProductsStore {
  products: ProductData[];
}

export class ProductMemoryService {
  private static ensureDataDir() {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  private static loadData(): ProductsStore {
    this.ensureDataDir();
    try {
      if (fs.existsSync(DATA_FILE)) {
        const data = fs.readFileSync(DATA_FILE, 'utf-8');
        return JSON.parse(data);
      }
    } catch (err) {
      console.warn('Error loading products from file:', err);
    }
    return { products: [] };
  }

  private static saveData(store: ProductsStore) {
    try {
      this.ensureDataDir();
      fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2), 'utf-8');
    } catch (err) {
      console.error('Error saving products to file:', err);
    }
  }

  static create(product: Omit<ProductData, 'id' | 'createdAt' | 'updatedAt'>): ProductData {
    const store = this.loadData();
    const newProduct: ProductData = {
      ...product,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    store.products.push(newProduct);
    this.saveData(store);
    return newProduct;
  }

  static update(id: string, data: Partial<ProductData>): ProductData | null {
    const store = this.loadData();
    const index = store.products.findIndex((p) => p.id === id);
    if (index === -1) return null;

    const updated = {
      ...store.products[index],
      ...data,
      id: store.products[index].id,
      createdAt: store.products[index].createdAt,
      updatedAt: new Date().toISOString(),
    };
    store.products[index] = updated;
    this.saveData(store);
    return updated;
  }

  static findById(id: string): ProductData | null {
    const store = this.loadData();
    return store.products.find((p) => p.id === id) || null;
  }

  static findBySlug(slug: string): ProductData | null {
    const store = this.loadData();
    return store.products.find((p) => p.slug === slug) || null;
  }

  static findAll(limit = 50, offset = 0): { data: ProductData[]; total: number } {
    const store = this.loadData();
    const total = store.products.length;
    const data = store.products.slice(offset, offset + limit);
    return { data, total };
  }

  static delete(id: string): boolean {
    const store = this.loadData();
    const index = store.products.findIndex((p) => p.id === id);
    if (index === -1) return false;

    store.products.splice(index, 1);
    this.saveData(store);
    return true;
  }

  static deleteAll() {
    this.saveData({ products: [] });
  }
}
