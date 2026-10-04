-- Migration: add minimal storage policies for products bucket

create policy "products upload authenticated"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'products'
  );

create policy "products select authenticated"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'products'
  );
