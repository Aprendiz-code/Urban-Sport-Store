-- Enable row level security for products
alter table public.products enable row level security;

-- Allow public read access for the storefront
create policy if not exists "Allow public read access"
on public.products
for select
using (true);

-- Allow authenticated admin users to insert products.
-- In production, prefer a backend service role for writes and keep this policy restrictive.
create policy if not exists "Allow authenticated admins to insert products"
on public.products
for insert
to authenticated
with check (
  coalesce((auth.jwt() -> 'user_metadata' ->> 'isAdmin'), '') = 'true'
  or coalesce((auth.jwt() -> 'user_metadata' ->> 'role'), '') = 'ADMIN'
);

-- Allow authenticated admin users to update products
create policy if not exists "Allow authenticated admins to update products"
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

-- Allow authenticated admin users to delete products
create policy if not exists "Allow authenticated admins to delete products"
on public.products
for delete
to authenticated
using (
  coalesce((auth.jwt() -> 'user_metadata' ->> 'isAdmin'), '') = 'true'
  or coalesce((auth.jwt() -> 'user_metadata' ->> 'role'), '') = 'ADMIN'
);
