ALTER TABLE public.products
	ADD COLUMN IF NOT EXISTS brand text NOT NULL DEFAULT '',
	ADD COLUMN IF NOT EXISTS main_image text,
	ADD COLUMN IF NOT EXISTS images jsonb NOT NULL DEFAULT '[]'::jsonb;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
	'product-images',
	'product-images',
	true,
	5242880,
	ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
	public = EXCLUDED.public,
	file_size_limit = EXCLUDED.file_size_limit,
	allowed_mime_types = EXCLUDED.allowed_mime_types;
