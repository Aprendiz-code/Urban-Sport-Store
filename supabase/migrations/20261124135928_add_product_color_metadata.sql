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

ALTER TABLE public.order_items
	ADD COLUMN size text,
	ADD COLUMN color_name text;

ALTER TABLE public.orders
	ADD COLUMN variant_snapshot_hash text;

COMMENT ON COLUMN public.order_items.size IS
	'Selected size snapshot for this order line; NULL for products without selectable sizes.';

COMMENT ON COLUMN public.order_items.color_name IS
	'Selected color name snapshot for this order line; NULL for legacy or uncolored products.';

CREATE FUNCTION public.create_pending_order_with_variant_snapshots(
	p_user_id uuid,
	p_idempotency_key uuid,
	p_request jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
	v_item jsonb;
	v_items jsonb;
	v_base_request jsonb;
	v_result jsonb;
	v_order_id uuid;
	v_existing_hash text;
	v_variant_hash text;
	v_product public.products%ROWTYPE;
	v_items_json jsonb;
BEGIN
	IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
		RAISE EXCEPTION 'Only the authorized backend may create pending orders'
			USING ERRCODE = '42501';
	END IF;

	IF p_request IS NULL
		OR pg_catalog.jsonb_typeof(p_request) IS DISTINCT FROM 'object'
		OR pg_catalog.jsonb_typeof(p_request -> 'items') IS DISTINCT FROM 'array' THEN
		RAISE EXCEPTION 'Invalid order request object' USING ERRCODE = '22023';
	END IF;

	v_items := p_request -> 'items';
	IF EXISTS (
		SELECT 1
		FROM pg_catalog.jsonb_array_elements(v_items) AS requested(value)
		WHERE pg_catalog.jsonb_typeof(requested.value) IS DISTINCT FROM 'object'
			OR NOT (requested.value ?& ARRAY['productId', 'quantity'])
			OR (requested.value - 'productId' - 'quantity' - 'size' - 'color') <> '{}'::jsonb
			OR (requested.value ? 'size' AND (
				pg_catalog.jsonb_typeof(requested.value -> 'size') IS DISTINCT FROM 'string'
				OR pg_catalog.length(requested.value ->> 'size') NOT BETWEEN 1 AND 40
			))
			OR (requested.value ? 'color' AND (
				pg_catalog.jsonb_typeof(requested.value -> 'color') IS DISTINCT FROM 'string'
				OR pg_catalog.length(requested.value ->> 'color') NOT BETWEEN 1 AND 60
			))
	) THEN
		RAISE EXCEPTION 'Invalid size or color snapshot' USING ERRCODE = '22023';
	END IF;

	v_variant_hash := pg_catalog.encode(
		extensions.digest(v_items::text, 'sha256'),
		'hex'
	);
	v_base_request := (p_request - 'items') || pg_catalog.jsonb_build_object(
		'items', COALESCE((
			SELECT pg_catalog.jsonb_agg(requested.value - 'size' - 'color')
			FROM pg_catalog.jsonb_array_elements(v_items) AS requested(value)
		), '[]'::jsonb)
	);

	v_result := public.create_pending_order(p_user_id, p_idempotency_key, v_base_request);
	v_order_id := (v_result #>> '{order,id}')::uuid;
	IF v_order_id IS NULL THEN
		RAISE EXCEPTION 'Pending order result is invalid' USING ERRCODE = '22023';
	END IF;

	SELECT order_row.variant_snapshot_hash
	INTO v_existing_hash
	FROM public.orders AS order_row
	WHERE order_row.id = v_order_id
	FOR UPDATE;

	IF v_existing_hash IS NOT NULL AND v_existing_hash IS DISTINCT FROM v_variant_hash THEN
		RAISE EXCEPTION 'Idempotency-Key was already used for a different variant selection'
			USING ERRCODE = '23505', CONSTRAINT = 'orders_idempotency_key_key';
	END IF;

	FOR v_item IN
		SELECT requested.value
		FROM pg_catalog.jsonb_array_elements(v_items) AS requested(value)
		ORDER BY requested.value ->> 'productId'
	LOOP
		SELECT product.*
		INTO v_product
		FROM public.products AS product
		WHERE product.id = (v_item ->> 'productId')::uuid
			AND product.is_active IS TRUE
		FOR SHARE;

		IF NOT FOUND THEN
			RAISE EXCEPTION 'A requested product is unavailable' USING ERRCODE = '22023';
		END IF;
		IF v_item ? 'size' AND NOT ((v_item ->> 'size') = ANY(v_product.sizes)) THEN
			RAISE EXCEPTION 'Selected size is not available for this product' USING ERRCODE = '22023';
		END IF;
		IF v_product.color_name IS NOT NULL
			AND (v_item ->> 'color') IS DISTINCT FROM v_product.color_name THEN
			RAISE EXCEPTION 'Selected color does not match this product' USING ERRCODE = '22023';
		END IF;
	END LOOP;

	UPDATE public.orders
	SET variant_snapshot_hash = v_variant_hash
	WHERE id = v_order_id AND variant_snapshot_hash IS NULL;

	UPDATE public.order_items AS order_item
	SET size = NULLIF(requested.value ->> 'size', ''),
			color_name = NULLIF(requested.value ->> 'color', '')
	FROM pg_catalog.jsonb_array_elements(v_items) AS requested(value)
	WHERE order_item.order_id = v_order_id
		AND order_item.product_id = (requested.value ->> 'productId')::uuid;

	SELECT COALESCE(pg_catalog.jsonb_agg(
		pg_catalog.jsonb_build_object(
			'id', order_item.id,
			'orderId', order_item.order_id,
			'productId', order_item.product_id,
			'productName', order_item.product_name,
			'sku', order_item.sku,
			'imagePath', order_item.image_path,
			'quantity', order_item.quantity,
			'unitPrice', order_item.unit_price,
			'totalPrice', order_item.total_price,
			'size', order_item.size,
			'color', order_item.color_name,
			'createdAt', order_item.created_at
		) ORDER BY order_item.created_at, order_item.id
	), '[]'::jsonb)
	INTO v_items_json
	FROM public.order_items AS order_item
	WHERE order_item.order_id = v_order_id;

	RETURN pg_catalog.jsonb_set(v_result, '{order,items}', v_items_json, true);
END;
$function$;

REVOKE ALL ON FUNCTION public.create_pending_order_with_variant_snapshots(uuid, uuid, jsonb)
	FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_pending_order_with_variant_snapshots(uuid, uuid, jsonb)
	TO service_role;

COMMIT;
