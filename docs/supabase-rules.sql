-- Enable row level security for products
alter table public.products enable row level security;

-- Public storefront read access only
create policy if not exists "Allow public read access"
on public.products
for select
using (true);

-- Authenticated admins can insert products.
create policy if not exists "Allow authenticated admin insert"
on public.products
for insert
to authenticated
with check (
  coalesce((auth.jwt() -> 'user_metadata' ->> 'isAdmin'), '') = 'true'
  or coalesce((auth.jwt() -> 'user_metadata' ->> 'role'), '') = 'ADMIN'
);

-- Authenticated admins can update products.
create policy if not exists "Allow authenticated admin update"
on public.products
for update
to authenticated
using (
  coalesce((auth.jwt() -> 'user_metadata' ->> 'isAdmin'), '') = 'true'
  or coalesce((auth.jwt() -> 'user_metadata' ->> 'role'), '') = 'ADMIN'
)
with check (
  coalesce((auth.jwt() -> 'user_metadata' ->> 'isAdmin'), '') = 'true'
  or coalesce((auth.jwt() -> 'user_metadata' ->> 'role'), '') = 'ADMIN'
);

-- Authenticated admins can delete products.
create policy if not exists "Allow authenticated admin delete"
on public.products
for delete
to authenticated
using (
  coalesce((auth.jwt() -> 'user_metadata' ->> 'isAdmin'), '') = 'true'
  or coalesce((auth.jwt() -> 'user_metadata' ->> 'role'), '') = 'ADMIN'
);
