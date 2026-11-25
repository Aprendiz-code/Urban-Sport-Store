BEGIN;

ALTER TABLE public.products
	ADD COLUMN model_id uuid,
	ADD COLUMN color_name text,
	ADD COLUMN color_hex text,
	ADD COLUMN color_hex2 text,
	ADD COLUMN model_sort_order integer NOT NULL DEFAULT 0,
	ADD COLUMN is_default_color boolean NOT NULL DEFAULT false,
	ADD CONSTRAINT products_color_hex_format
		CHECK (color_hex IS NULL OR color_hex ~ '^#[0-9A-Fa-f]{6}$'),
	ADD CONSTRAINT products_color_hex2_format
		CHECK (color_hex2 IS NULL OR color_hex2 ~ '^#[0-9A-Fa-f]{6}$');

ALTER TABLE public.products
	ADD CONSTRAINT products_model_id_fkey
		FOREIGN KEY (model_id) REFERENCES public.products(id) ON DELETE RESTRICT,
	ADD CONSTRAINT products_model_id_not_self
		CHECK (model_id IS NULL OR model_id <> id);

CREATE INDEX idx_products_model_sort_active
	ON public.products (model_id, model_sort_order, id)
	WHERE is_active IS TRUE;

COMMENT ON COLUMN public.products.model_id IS
	'Explicit stable model grouping ID; NULL legacy rows are standalone models with effective ID equal to products.id.';

COMMENT ON COLUMN public.products.color_name IS
	'Commercial color name for this product record; its main_image and images are the photos for this single color.';

COMMENT ON COLUMN public.products.is_default_color IS
	'Marks the default color record within its explicit model group.';

COMMIT;
