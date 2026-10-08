import "./category-bar.css";

const categoryLinks = [
  { id: "zapatos", label: "Tenis", href: "/?view=catalog", aliases: ["zapatos", "tenis", "running", "calzado"], fallbackCategory: "Running" },
  { id: "ropa-hombre", label: "Ropa hombre", href: "/?view=catalog", aliases: ["ropa hombre", "ropa de hombre", "ropa masculina"], fallbackCategory: "Ropa Hombre" },
  { id: "ropa-mujer", label: "Ropa mujer", href: "/?view=catalog", aliases: ["ropa mujer", "ropa de mujer", "ropa femenina"], fallbackCategory: "Ropa Mujer" },
  { id: "perfumes", label: "Perfumes", href: "/?view=catalog", aliases: ["perfumes", "fragancias"], fallbackCategory: "Perfumes" },
  { id: "relojes", label: "Relojes", href: "/?view=catalog", aliases: ["relojes", "reloj"], fallbackCategory: "Relojes" },
  { id: "gafas", label: "Gafas", href: "/?view=catalog", aliases: ["gafas", "lentes", "anteojos"], fallbackCategory: "Gafas" },
] as const;

type CategoryBarProps = {
  categories: string[];
  activeCategory: string | null;
  onSelect: (category: string | null) => void;
};

function normalizeCategory(value: string) {
  return value.trim().toLocaleLowerCase("es-CO");
}

export default function CategoryBar({ categories, activeCategory, onSelect }: CategoryBarProps) {
  return (
    <section className="category-bar" aria-labelledby="category-bar-heading">
      <h2 className="category-bar__heading" id="category-bar-heading">Compra por categoría</h2>
      <nav className="category-bar__scroller" aria-label="Colecciones">
        {categoryLinks.map((category) => {
          const selectedCategory = category.aliases
            .map((alias) => categories.find((name) => normalizeCategory(name) === alias))
            .find((name): name is string => Boolean(name)) ?? category.fallbackCategory;
          const isActive = selectedCategory !== null && selectedCategory === activeCategory;
          const href = selectedCategory
            ? `${category.href}&category=${encodeURIComponent(selectedCategory)}`
            : category.href;

          return (
            <a
              key={category.id}
              href={href}
              aria-label={`Ver colección ${category.label}`}
              aria-current={isActive ? "page" : undefined}
              className={`category-bar__item${isActive ? " is-active" : ""}`}
              onClick={(event) => {
                event.preventDefault();
                onSelect(selectedCategory);
              }}
            >
              <span>{category.label}</span>
            </a>
          );
        })}
      </nav>
    </section>
  );
}