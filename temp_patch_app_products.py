from pathlib import Path

path = Path(r"c:\Users\crist\OneDrive\Escritorio\Urban Sport Store\src\app\App.tsx")
text = path.read_text(encoding='utf-8')

old_decl = 'let PRODUCTS: Product[] = []; // Use Supabase/backend as the primary ecommerce data source.\n'
text = text.replace(old_decl, '')

insertion = '  const [view, setView] = useState<View>("home");\n  const [initialAdminSection, setInitialAdminSection] = useState<string | undefined>(undefined);\n'
replacement = insertion + '  const [products, setProducts] = useState<Product[]>([]);\n'
if insertion not in text:
    raise SystemExit('Could not find insertion point for products state')
text = text.replace(insertion, replacement, 1)

old_home_init = '  const [homePreviewProducts, setHomePreviewProducts] = useState<Product[]>(PRODUCTS.slice(0, 9));\n  const [homeSaleProducts, setHomeSaleProducts] = useState<Product[]>(PRODUCTS.filter((p) => p.discount).slice(0, 9));\n  const [homeNewArrivals, setHomeNewArrivals] = useState<Product[]>(PRODUCTS.filter((p) => p.isNew).slice(0, 9));\n'
text = text.replace(old_home_init, '  const [homePreviewProducts, setHomePreviewProducts] = useState<Product[]>([]);\n  const [homeSaleProducts, setHomeSaleProducts] = useState<Product[]>([]);\n  const [homeNewArrivals, setHomeNewArrivals] = useState<Product[]>([]);\n', 1)

old_effect = '  const [productRefresh, setProductRefresh] = useState(0);\n\n  useEffect(() => {\n    if (typeof window === "undefined") return;\n'
text = text.replace(old_effect, '  const [productRefresh, setProductRefresh] = useState(0);\n\n  useEffect(() => {\n    setHomePreviewProducts(products.slice(0, 9));\n    setHomeSaleProducts(products.filter((p) => p.discount).slice(0, 9));\n    setHomeNewArrivals(products.filter((p) => p.isNew).slice(0, 9));\n  }, [products]);\n\n  useEffect(() => {\n    if (typeof window === "undefined") return;\n', 1)

text = text.replace('            if (Array.isArray(response) && response.length > 0) {\n            PRODUCTS = response.map(mapProductRecordToAppProduct);\n            return true;\n          }', '            if (Array.isArray(response) && response.length > 0) {\n            const mapped = response.map(mapProductRecordToAppProduct);\n            setProducts(mapped);\n            return true;\n          }', 1)
text = text.replace('            if (data.length > 0) {\n            PRODUCTS = data.map(mapProductRecordToAppProduct);\n            return true;\n          }', '            if (data.length > 0) {\n            const mapped = data.map(mapProductRecordToAppProduct);\n            setProducts(mapped);\n            return true;\n          }', 1)

load_dep = '    void loadProducts();\n    return () => {\n      isActive = false;\n    };\n  }, []);\n'
text = text.replace(load_dep, '    void loadProducts();\n    return () => {\n      isActive = false;\n    };\n  }, [productRefresh]);\n', 1)

text = text.replace('PRODUCTS', 'products')

path.write_text(text, encoding='utf-8')
print('patched')
