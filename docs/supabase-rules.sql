-- Enable RLS for products
alter table public.products enable row level security;

-- Public storefront read access
create policy if not exists "Allow public read access"
on public.products
for select
using (true);

-- Authenticated admins can insert products
create policy if not exists "Allow authenticated admin insert"
on public.products
for insert
to authenticated
with check (
  coalesce((auth.jwt() -> 'user_metadata' ->> 'isAdmin'), '') = 'true'
  or coalesce((auth.jwt() -> 'user_metadata' ->> 'role'), '') = 'ADMIN'
);

-- Authenticated admins can update products
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

-- Authenticated admins can delete products
create policy if not exists "Allow authenticated admin delete"
on public.products
for delete
to authenticated
using (
  coalesce((auth.jwt() -> 'user_metadata' ->> 'isAdmin'), '') = 'true'
  or coalesce((auth.jwt() -> 'user_metadata' ->> 'role'), '') = 'ADMIN'
);

-- Optional: allow service role full access (useful for backend/admin operations)
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'products'
      and policyname = 'Allow service role full access'
  ) then
    create policy "Allow service role full access"
    on public.products
    for all
    to service_role
    using (true)
    with check (true);
  end if;
end
$$;

-- Storage bucket and object policies for product images
-- The bucket `product-images` has been created in the Supabase project.
-- Apply these policies with a Supabase owner account or from the Studio if the current CLI login role is not the table owner.

alter table storage.objects enable row level security;

create policy if not exists "Public read access to product-images"
  on storage.objects
  for select
  using (
    bucket_id = 'product-images'
  );

create policy if not exists "Admin write access to product-images"
  on storage.objects
  for insert, update, delete
  to authenticated
  using (
    bucket_id = 'product-images'
    and (
      coalesce((auth.jwt() -> 'user_metadata' ->> 'isAdmin'), '') = 'true'
      or coalesce((auth.jwt() -> 'user_metadata' ->> 'role'), '') = 'ADMIN'
    )
  )
  with check (
    bucket_id = 'product-images'
    and (
      coalesce((auth.jwt() -> 'user_metadata' ->> 'isAdmin'), '') = 'true'
      or coalesce((auth.jwt() -> 'user_metadata' ->> 'role'), '') = 'ADMIN'
    )
  );

create policy if not exists "Allow service role full access to storage objects"
  on storage.objects
  for all
  to service_role
  using (true)
  with check (true);
