ALTER TABLE public.products
  ADD COLUMN sizes text[] NOT NULL DEFAULT ARRAY[]::text[],
  ADD COLUMN specifications jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.products
  ADD CONSTRAINT products_specifications_is_array
  CHECK (jsonb_typeof(specifications) = 'array') NOT VALID;

ALTER TABLE public.products
  VALIDATE CONSTRAINT products_specifications_is_array;