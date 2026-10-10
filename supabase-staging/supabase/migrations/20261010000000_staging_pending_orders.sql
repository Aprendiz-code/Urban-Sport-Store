BEGIN;

CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  email text NOT NULL,
  customer_name text NOT NULL,
  phone text NOT NULL,
  status text NOT NULL DEFAULT 'pending_payment'
    CHECK (status IN ('pending_payment', 'cancelled')),
  expires_at timestamptz NOT NULL,
  currency text NOT NULL DEFAULT 'COP' CHECK (currency = 'COP'),
  subtotal numeric(12, 2) NOT NULL CHECK (subtotal >= 0),
  discount_amount numeric(12, 2) NOT NULL DEFAULT 0 CHECK (discount_amount = 0),
  shipping_amount numeric(12, 2) NOT NULL DEFAULT 0 CHECK (shipping_amount = 0),
  total numeric(12, 2) NOT NULL CHECK (total = subtotal),
  payment_provider text NOT NULL DEFAULT 'local' CHECK (payment_provider = 'local'),
  shipping_address jsonb NOT NULL
    CHECK (jsonb_typeof(shipping_address) = 'object' AND octet_length(shipping_address::text) <= 4096),
  notes text CHECK (notes IS NULL OR length(notes) <= 500),
  idempotency_key uuid NOT NULL UNIQUE,
  request_hash text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  product_name text NOT NULL,
  sku text NOT NULL,
  image_path text,
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 20),
  unit_price numeric(12, 2) NOT NULL CHECK (unit_price >= 0),
  total_price numeric(12, 2) NOT NULL CHECK (total_price = unit_price * quantity),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, product_id)
);

CREATE TABLE public.inventory_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 20),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'released')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, product_id)
);

CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE RESTRICT,
  payment_provider text NOT NULL DEFAULT 'local' CHECK (payment_provider = 'local'),
  status text NOT NULL DEFAULT 'pending' CHECK (status = 'pending'),
  amount numeric(12, 2) NOT NULL CHECK (amount >= 0),
  currency text NOT NULL DEFAULT 'COP' CHECK (currency = 'COP'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX orders_user_created_at_idx ON public.orders (user_id, created_at DESC);
CREATE INDEX order_items_order_id_idx ON public.order_items (order_id);
CREATE INDEX inventory_reservations_product_expiry_idx
  ON public.inventory_reservations (product_id, expires_at)
  WHERE status = 'active';

CREATE TRIGGER orders_set_updated_at
BEFORE UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.prevent_order_idempotency_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Order idempotency history is immutable'
      USING ERRCODE = '55000';
  END IF;

  IF NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
    OR NEW.request_hash IS DISTINCT FROM OLD.request_hash THEN
    RAISE EXCEPTION 'Order idempotency history is immutable'
      USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.prevent_order_idempotency_mutation() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER orders_idempotency_immutable
BEFORE UPDATE OR DELETE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.prevent_order_idempotency_mutation();

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY orders_select_own
ON public.orders FOR SELECT TO authenticated
USING ((SELECT auth.uid()) = user_id);

CREATE POLICY order_items_select_own
ON public.order_items FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.orders AS order_row
    WHERE order_row.id = order_items.order_id
      AND order_row.user_id = (SELECT auth.uid())
  )
);

REVOKE ALL PRIVILEGES ON TABLE
  public.orders,
  public.order_items,
  public.inventory_reservations,
  public.payments
FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT (
  id, order_number, user_id, email, customer_name, phone, status, expires_at, currency,
  subtotal, discount_amount, shipping_amount, total, payment_provider,
  shipping_address, notes, created_at, updated_at
) ON public.orders TO authenticated;
GRANT SELECT ON public.order_items TO authenticated;

GRANT SELECT ON TABLE
  public.orders,
  public.order_items,
  public.inventory_reservations,
  public.payments
TO service_role;

CREATE OR REPLACE FUNCTION public.create_pending_order(
  p_user_id uuid,
  p_idempotency_key uuid,
  p_request jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_address jsonb;
  v_item jsonb;
  v_product_id uuid;
  v_quantity integer;
  v_product_stock integer;
  v_reserved_quantity integer;
  v_product_price numeric(12, 2);
  v_product_name text;
  v_product_sku text;
  v_product_image text;
  v_email text;
  v_total numeric(12, 2) := 0;
  v_now timestamptz;
  v_order_expires_at timestamptz;
  v_reservation_expires_at timestamptz;
  v_order_id uuid := gen_random_uuid();
  v_order_number text;
  v_order public.orders%ROWTYPE;
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Only the authorized backend may create pending orders'
      USING ERRCODE = '42501';
  END IF;

  IF p_user_id IS NULL
    OR p_idempotency_key IS NULL
    OR substring(p_idempotency_key::text, 15, 1) <> '4'
    OR substring(p_idempotency_key::text, 20, 1) NOT IN ('8', '9', 'a', 'b') THEN
    RAISE EXCEPTION 'A UUID v4 Idempotency-Key is required'
      USING ERRCODE = '22023';
  END IF;

  IF p_request IS NULL
    OR jsonb_typeof(p_request) IS DISTINCT FROM 'object'
    OR octet_length(p_request::text) > 16384
    OR NOT (p_request ?& ARRAY['address', 'items'])
    OR (p_request - 'address' - 'items' - 'note') <> '{}'::jsonb THEN
    RAISE EXCEPTION 'Invalid order request object'
      USING ERRCODE = '22023';
  END IF;

  v_address := p_request -> 'address';
  IF jsonb_typeof(v_address) IS DISTINCT FROM 'object'
    OR NOT (v_address ?& ARRAY[
      'recipientName', 'addressLine1', 'city', 'state', 'postalCode', 'country', 'phone'
    ])
    OR (v_address - 'recipientName' - 'addressLine1' - 'addressLine2' - 'city'
      - 'state' - 'postalCode' - 'country' - 'phone') <> '{}'::jsonb THEN
    RAISE EXCEPTION 'Invalid inline shipping address'
      USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(v_address -> 'recipientName') IS DISTINCT FROM 'string'
    OR length(btrim(v_address ->> 'recipientName')) NOT BETWEEN 2 AND 120
    OR jsonb_typeof(v_address -> 'addressLine1') IS DISTINCT FROM 'string'
    OR length(btrim(v_address ->> 'addressLine1')) NOT BETWEEN 5 AND 180
    OR (v_address ? 'addressLine2' AND (
      jsonb_typeof(v_address -> 'addressLine2') IS DISTINCT FROM 'string'
      OR length(btrim(v_address ->> 'addressLine2')) > 120
    ))
    OR jsonb_typeof(v_address -> 'city') IS DISTINCT FROM 'string'
    OR length(btrim(v_address ->> 'city')) NOT BETWEEN 2 AND 100
    OR jsonb_typeof(v_address -> 'state') IS DISTINCT FROM 'string'
    OR length(btrim(v_address ->> 'state')) NOT BETWEEN 2 AND 100
    OR jsonb_typeof(v_address -> 'postalCode') IS DISTINCT FROM 'string'
    OR length(btrim(v_address ->> 'postalCode')) NOT BETWEEN 3 AND 20
    OR jsonb_typeof(v_address -> 'country') IS DISTINCT FROM 'string'
    OR (v_address ->> 'country') !~ '^[A-Z]{2}$'
    OR jsonb_typeof(v_address -> 'phone') IS DISTINCT FROM 'string'
    OR length(btrim(v_address ->> 'phone')) NOT BETWEEN 7 AND 20
    OR (v_address ->> 'phone') !~ '^\+?[0-9 ()-]{7,20}$' THEN
    RAISE EXCEPTION 'Invalid inline shipping address fields'
      USING ERRCODE = '22023';
  END IF;

  IF p_request ? 'note' AND (
    jsonb_typeof(p_request -> 'note') IS DISTINCT FROM 'string'
    OR length(p_request ->> 'note') > 500
  ) THEN
    RAISE EXCEPTION 'Invalid order note'
      USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(p_request -> 'items') IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_request -> 'items') NOT BETWEEN 1 AND 20 THEN
    RAISE EXCEPTION 'Order must contain between 1 and 20 products'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_request -> 'items') AS item(value)
    WHERE jsonb_typeof(item.value) IS DISTINCT FROM 'object'
      OR NOT (item.value ?& ARRAY['productId', 'quantity'])
      OR (item.value - 'productId' - 'quantity') <> '{}'::jsonb
      OR jsonb_typeof(item.value -> 'productId') IS DISTINCT FROM 'string'
      OR (item.value ->> 'productId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      OR jsonb_typeof(item.value -> 'quantity') IS DISTINCT FROM 'number'
      OR (item.value ->> 'quantity') !~ '^[1-9][0-9]*$'
      OR (item.value ->> 'quantity')::integer NOT BETWEEN 1 AND 20
  ) THEN
    RAISE EXCEPTION 'Invalid order product or quantity'
      USING ERRCODE = '22023';
  END IF;

  IF (
    SELECT count(DISTINCT item.value ->> 'productId')
    FROM jsonb_array_elements(p_request -> 'items') AS item(value)
  ) <> jsonb_array_length(p_request -> 'items') THEN
    RAISE EXCEPTION 'Order products must be unique'
      USING ERRCODE = '22023';
  END IF;

  SELECT profile.email
  INTO v_email
  FROM public.profiles AS profile
  WHERE profile.id = p_user_id
    AND profile.is_active IS TRUE;

  IF NOT FOUND OR v_email IS NULL OR length(btrim(v_email)) = 0 THEN
    RAISE EXCEPTION 'An active profile with an email is required'
      USING ERRCODE = '42501';
  END IF;

  FOR v_item IN
    SELECT item.value
    FROM jsonb_array_elements(p_request -> 'items') AS item(value)
    ORDER BY item.value ->> 'productId'
  LOOP
    v_product_id := (v_item ->> 'productId')::uuid;
    v_quantity := (v_item ->> 'quantity')::integer;

    SELECT product.stock, product.price
    INTO v_product_stock, v_product_price
    FROM public.products AS product
    WHERE product.id = v_product_id
      AND product.is_active IS TRUE
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'A requested product is unavailable'
        USING ERRCODE = '22023';
    END IF;

    SELECT COALESCE(sum(reservation.quantity), 0)::integer
    INTO v_reserved_quantity
    FROM public.inventory_reservations AS reservation
    WHERE reservation.product_id = v_product_id
      AND reservation.status = 'active'
      AND reservation.expires_at > pg_catalog.clock_timestamp();

    IF v_product_stock - v_reserved_quantity < v_quantity THEN
      RAISE EXCEPTION 'Insufficient available inventory for a requested product'
        USING ERRCODE = '23514';
    END IF;

    v_total := v_total + (v_product_price * v_quantity);
  END LOOP;

  v_now := pg_catalog.clock_timestamp();
  v_order_expires_at := v_now + interval '24 hours';
  v_reservation_expires_at := v_now + interval '20 minutes';
  v_order_number := 'ORD-' || pg_catalog.to_char(v_now AT TIME ZONE 'UTC', 'YYYYMMDD')
    || '-' || pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(v_order_id::text, '-', ''), 1, 8));

  INSERT INTO public.orders (
    id, order_number, user_id, email, customer_name, phone, status, expires_at, currency,
    subtotal, discount_amount, shipping_amount, total, payment_provider,
    shipping_address, notes, idempotency_key, request_hash, created_at, updated_at
  )
  VALUES (
    v_order_id, v_order_number, p_user_id, v_email,
    v_address ->> 'recipientName', v_address ->> 'phone', 'pending_payment', v_order_expires_at, 'COP',
    v_total, 0, 0, v_total, 'local', v_address,
    NULLIF(p_request ->> 'note', ''), p_idempotency_key,
    pg_catalog.encode(extensions.digest(p_request::text, 'sha256'), 'hex'), v_now, v_now
  )
  RETURNING * INTO v_order;

  FOR v_item IN
    SELECT item.value
    FROM jsonb_array_elements(p_request -> 'items') AS item(value)
    ORDER BY item.value ->> 'productId'
  LOOP
    v_product_id := (v_item ->> 'productId')::uuid;
    v_quantity := (v_item ->> 'quantity')::integer;

    SELECT product.name, product.sku, product.main_image, product.price
    INTO v_product_name, v_product_sku, v_product_image, v_product_price
    FROM public.products AS product
    WHERE product.id = v_product_id;

    INSERT INTO public.order_items (
      order_id, product_id, product_name, sku, image_path,
      quantity, unit_price, total_price, created_at
    )
    VALUES (
      v_order_id, v_product_id, v_product_name, v_product_sku, v_product_image,
      v_quantity, v_product_price, v_product_price * v_quantity, v_now
    );

    INSERT INTO public.inventory_reservations (
      order_id, product_id, quantity, status, expires_at, created_at
    )
    VALUES (
      v_order_id, v_product_id, v_quantity, 'active', v_reservation_expires_at, v_now
    );
  END LOOP;

  INSERT INTO public.payments (order_id, payment_provider, status, amount, currency, created_at)
  VALUES (v_order_id, 'local', 'pending', v_total, 'COP', v_now);

  RETURN jsonb_build_object(
    'order', jsonb_build_object(
      'id', v_order.id,
      'orderNumber', v_order.order_number,
      'userId', v_order.user_id,
      'email', v_order.email,
      'customerName', v_order.customer_name,
      'phone', v_order.phone,
      'status', v_order.status,
      'paymentStatus', 'pending',
      'shipmentStatus', 'pending',
      'currency', v_order.currency,
      'subtotal', v_order.subtotal,
      'discountAmount', v_order.discount_amount,
      'shippingAmount', v_order.shipping_amount,
      'total', v_order.total,
      'paymentProvider', 'local',
      'shippingAddress', v_order.shipping_address,
      'notes', v_order.notes,
      'reservationExpiresAt', v_reservation_expires_at,
      'items', COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', order_item.id,
            'orderId', order_item.order_id,
            'productId', order_item.product_id,
            'productName', order_item.product_name,
            'sku', order_item.sku,
            'imagePath', order_item.image_path,
            'quantity', order_item.quantity,
            'unitPrice', order_item.unit_price,
            'totalPrice', order_item.total_price,
            'createdAt', order_item.created_at
          )
          ORDER BY order_item.created_at, order_item.id
        )
        FROM public.order_items AS order_item
        WHERE order_item.order_id = v_order_id
      ), '[]'::jsonb),
      'createdAt', v_order.created_at,
      'updatedAt', v_order.updated_at
    )
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.cancel_pending_order(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_status text;
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Only the authorized backend may cancel pending orders'
      USING ERRCODE = '42501';
  END IF;

  SELECT order_row.status
  INTO v_status
  FROM public.orders AS order_row
  WHERE order_row.id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_status <> 'pending_payment' THEN
    RAISE EXCEPTION 'Only pending_payment orders can be cancelled'
      USING ERRCODE = '55000';
  END IF;

  UPDATE public.orders
  SET status = 'cancelled'
  WHERE id = p_order_id;

  UPDATE public.inventory_reservations
  SET status = 'released'
  WHERE order_id = p_order_id
    AND status = 'active';

  RETURN jsonb_build_object('id', p_order_id, 'status', 'cancelled');
END;
$function$;

REVOKE ALL ON FUNCTION public.create_pending_order(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_pending_order(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_pending_order(uuid, uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_pending_order(uuid) TO service_role;

COMMIT;
