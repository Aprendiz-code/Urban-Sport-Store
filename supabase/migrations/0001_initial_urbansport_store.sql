-- UrbanSport Store initial database schema
-- This file is intended for Supabase SQL editor execution.
-- It creates the initial secure schema for catalog, auth profile, carts, orders, and newsletter.

create extension if not exists pgcrypto;

create type public.user_role as enum ('customer', 'admin');
create type public.order_status as enum ('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded');
create type public.payment_status as enum ('pending', 'paid', 'failed', 'refunded', 'cancelled');
create type public.shipment_status as enum ('pending', 'preparing', 'shipped', 'delivered', 'returned', 'cancelled');

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  first_name text,
  last_name text,
  phone text,
  role public.user_role not null default 'customer',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  image_path text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.categories(id) on delete set null,
  name text not null,
  slug text not null unique,
  short_description text,
  description text,
  brand text,
  sku text unique,
  price numeric(12,2) not null check (price >= 0),
  compare_at_price numeric(12,2),
  currency char(3) not null default 'COP',
  is_active boolean not null default true,
  is_featured boolean not null default false,
  seo_title text,
  seo_description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (compare_at_price is null or compare_at_price >= price)
);

create table if not exists public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  path text not null,
  alt_text text,
  sort_order integer not null default 0,
  is_primary boolean not null default false,
  width integer,
  height integer,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz not null default now(),
  unique (product_id, path)
);

create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  sku text unique,
  size text,
  color text,
  color_hex text,
  price numeric(12,2),
  stock integer not null default 0 check (stock >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (price is null or price >= 0)
);

create table if not exists public.addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  label text,
  recipient_name text not null,
  phone text,
  country text not null default 'CO',
  department text,
  city text not null,
  address_line1 text not null,
  address_line2 text,
  postal_code text,
  reference text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.carts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  guest_token text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (user_id is not null or guest_token is not null)
);

create table if not exists public.cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references public.carts(id) on delete cascade,
  product_id uuid not null references public.products(id),
  variant_id uuid references public.product_variants(id) on delete set null,
  quantity integer not null check (quantity > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cart_id, product_id, variant_id)
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  user_id uuid references public.profiles(id) on delete set null,
  email text not null,
  customer_name text not null,
  phone text,
  status public.order_status not null default 'pending',
  payment_status public.payment_status not null default 'pending',
  shipment_status public.shipment_status not null default 'pending',
  currency char(3) not null default 'COP',
  subtotal numeric(12,2) not null check (subtotal >= 0),
  discount_amount numeric(12,2) not null default 0 check (discount_amount >= 0),
  shipping_amount numeric(12,2) not null default 0 check (shipping_amount >= 0),
  total numeric(12,2) not null check (total >= 0),
  payment_provider text,
  payment_reference text,
  shipping_method text,
  tracking_number text,
  shipping_address jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  variant_id uuid references public.product_variants(id) on delete set null,
  product_name text not null,
  sku text,
  image_path text,
  quantity integer not null check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  total_price numeric(12,2) not null check (total_price >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  is_subscribed boolean not null default true,
  consent_at timestamptz,
  unsubscribed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.store_settings (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  value jsonb,
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, first_name, last_name, role)
  values (
    new.id,
    new.email,
    nullif(split_part(new.raw_user_meta_data->>'full_name', ' ', 1), ''),
    nullif(split_part(new.raw_user_meta_data->>'full_name', ' ', 2), ''),
    'customer'
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists trg_categories_updated_at on public.categories;
create trigger trg_categories_updated_at
before update on public.categories
for each row execute function public.set_updated_at();

drop trigger if exists trg_products_updated_at on public.products;
create trigger trg_products_updated_at
before update on public.products
for each row execute function public.set_updated_at();

drop trigger if exists trg_product_variants_updated_at on public.product_variants;
create trigger trg_product_variants_updated_at
before update on public.product_variants
for each row execute function public.set_updated_at();

drop trigger if exists trg_addresses_updated_at on public.addresses;
create trigger trg_addresses_updated_at
before update on public.addresses
for each row execute function public.set_updated_at();

drop trigger if exists trg_carts_updated_at on public.carts;
create trigger trg_carts_updated_at
before update on public.carts
for each row execute function public.set_updated_at();

drop trigger if exists trg_cart_items_updated_at on public.cart_items;
create trigger trg_cart_items_updated_at
before update on public.cart_items
for each row execute function public.set_updated_at();

drop trigger if exists trg_orders_updated_at on public.orders;
create trigger trg_orders_updated_at
before update on public.orders
for each row execute function public.set_updated_at();

drop trigger if exists trg_newsletter_updated_at on public.newsletter_subscribers;
create trigger trg_newsletter_updated_at
before update on public.newsletter_subscribers
for each row execute function public.set_updated_at();

drop trigger if exists trg_store_settings_updated_at on public.store_settings;
create trigger trg_store_settings_updated_at
before update on public.store_settings
for each row execute function public.set_updated_at();

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create index if not exists idx_categories_active_order on public.categories (is_active, sort_order);
create index if not exists idx_products_active_featured on public.products (is_active, is_featured);
create index if not exists idx_products_slug on public.products (slug);
create index if not exists idx_products_category on public.products (category_id, is_active);
create index if not exists idx_product_images_product_order on public.product_images (product_id, sort_order);
create index if not exists idx_product_variants_product_active on public.product_variants (product_id, is_active);
create index if not exists idx_orders_status_created on public.orders (status, created_at desc);
create index if not exists idx_newsletter_email on public.newsletter_subscribers (email);
create index if not exists idx_store_settings_key on public.store_settings (key);

-- Important: RLS is enabled below. secure policies should be expanded in production.
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.product_images enable row level security;
alter table public.product_variants enable row level security;
alter table public.addresses enable row level security;
alter table public.carts enable row level security;
alter table public.cart_items enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.newsletter_subscribers enable row level security;
alter table public.store_settings enable row level security;

create policy "Public categories are readable" on public.categories
for select using (is_active = true);

create policy "Public products are readable" on public.products
for select using (is_active = true);

create policy "Public product images are readable" on public.product_images
for select using (
  product_id in (select id from public.products where is_active = true)
);

create policy "Public active variants are readable" on public.product_variants
for select using (is_active = true);

create policy "User can read own profile" on public.profiles
for select using (auth.uid() = id);

create policy "User can update own profile" on public.profiles
for update using (auth.uid() = id)
with check (auth.uid() = id and role = 'customer');

create policy "User can manage their addresses" on public.addresses
for all using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "User can manage their cart" on public.carts
for all using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "User can manage cart items in own cart" on public.cart_items
for all using (
  cart_id in (select id from public.carts where user_id = auth.uid())
)
with check (
  cart_id in (select id from public.carts where user_id = auth.uid())
);

create policy "User can read own orders" on public.orders
for select using (auth.uid() = user_id or auth.uid() is null and email = current_user::text);

create policy "Users can insert own newsletter" on public.newsletter_subscribers
for insert with check (true);

create policy "Users can update own newsletter consent" on public.newsletter_subscribers
for update using (true)
with check (true);

create policy "Public store settings are readable when explicitly allowed" on public.store_settings
for select using (true);

-- Admin policies are intentionally minimal and should be expanded in the final server-side admin setup.
create policy "Admins can manage all catalog records" on public.categories
for all using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
)
with check (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);

create policy "Admins can manage all product records" on public.products
for all using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
)
with check (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);

create policy "Admins can manage product images" on public.product_images
for all using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
)
with check (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);

create policy "Admins can manage product variants" on public.product_variants
for all using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
)
with check (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);

create policy "Admins can manage profiles" on public.profiles
for all using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
)
with check (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);

create policy "Admins can manage orders" on public.orders
for all using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
)
with check (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);

create policy "Admins can manage newsletter" on public.newsletter_subscribers
for all using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
)
with check (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);

create policy "Admins can manage settings" on public.store_settings
for all using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
)
with check (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);
