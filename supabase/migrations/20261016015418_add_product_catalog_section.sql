alter table public.products
  add column if not exists catalog_section text;

alter table public.products
  add constraint products_catalog_section_allowed
  check (
    catalog_section is null
    or catalog_section in (
      'Tenis Hombre',
      'Tenis Mujer',
      'Ropa Hombre',
      'Ropa Mujer',
      'Perfumes',
      'Relojes',
      'Gafas'
    )
  ) not valid;

alter table public.products
  validate constraint products_catalog_section_allowed;