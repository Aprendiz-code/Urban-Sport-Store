BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  label text,
  recipient_name text NOT NULL,
  phone text,
  country text NOT NULL DEFAULT 'CO',
  department text,
  city text NOT NULL,
  address_line1 text NOT NULL,
  address_line2 text,
  postal_code text,
  reference text,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (char_length(trim(recipient_name)) > 1),
  CHECK (char_length(trim(address_line1)) > 1),
  CHECK (char_length(trim(city)) > 1)
);

CREATE TABLE IF NOT EXISTS public.product_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  sku text UNIQUE,
  size text,
  color text,
  color_hex text,
  price numeric(12,2),
  stock integer NOT NULL DEFAULT 0 CHECK (stock >= 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (price IS NULL OR price >= 0),
  UNIQUE (id, product_id)
);

CREATE TABLE IF NOT EXISTS public.carts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  guest_token text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (user_id IS NOT NULL OR guest_token IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS public.cart_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id uuid NOT NULL REFERENCES public.carts(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  variant_id uuid,
  quantity integer NOT NULL CHECK (quantity > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (variant_id, product_id)
    REFERENCES public.product_variants(id, product_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text NOT NULL UNIQUE,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  email text NOT NULL,
  customer_name text NOT NULL,
  phone text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','processing','shipped','delivered','cancelled','refunded')),
  payment_status text NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending','paid','failed','refunded','cancelled')),
  shipment_status text NOT NULL DEFAULT 'pending' CHECK (shipment_status IN ('pending','preparing','shipped','delivered','returned','cancelled')),
  currency text NOT NULL DEFAULT 'COP' CHECK (currency = 'COP'),
  subtotal numeric(12,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  discount_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  shipping_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (shipping_amount >= 0),
  total numeric(12,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  payment_provider text,
  payment_reference text,
  shipping_method text,
  tracking_number text,
  shipping_address jsonb NOT NULL CHECK (
    jsonb_typeof(shipping_address) = 'object'
    AND shipping_address <> '{}'::jsonb
  ),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (discount_amount <= subtotal),
  CHECK (total = subtotal - discount_amount + shipping_amount)
);

CREATE TABLE IF NOT EXISTS public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  variant_id uuid REFERENCES public.product_variants(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  sku text,
  image_path text,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price numeric(12,2) NOT NULL CHECK (unit_price >= 0),
  total_price numeric(12,2) NOT NULL CHECK (total_price >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (total_price = quantity * unit_price)
);

CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  provider text,
  provider_reference text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','declined','cancelled','refunded','error')),
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  currency text NOT NULL DEFAULT 'COP' CHECK (currency = 'COP'),
  provider_payload jsonb,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id uuid NOT NULL REFERENCES public.product_variants(id) ON DELETE RESTRICT,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  type text NOT NULL CHECK (type IN ('initial','adjustment','reservation','release','sale','return')),
  quantity integer NOT NULL CHECK (quantity <> 0),
  previous_stock integer NOT NULL,
  resulting_stock integer NOT NULL,
  reason text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (resulting_stock >= 0),
  CHECK (resulting_stock = previous_stock + quantity)
);

CREATE TABLE IF NOT EXISTS public.coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  type text NOT NULL CHECK (type IN ('percentage','fixed')),
  value numeric(12,2) NOT NULL CHECK (value >= 0),
  minimum_order_amount numeric(12,2),
  max_discount_amount numeric(12,2),
  starts_at timestamptz,
  ends_at timestamptz,
  usage_limit integer,
  usage_count integer NOT NULL DEFAULT 0 CHECK (usage_count >= 0),
  per_user_limit integer,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (usage_limit IS NULL OR usage_limit >= 0),
  CHECK (per_user_limit IS NULL OR per_user_limit >= 0),
  CHECK (minimum_order_amount IS NULL OR minimum_order_amount >= 0),
  CHECK (max_discount_amount IS NULL OR max_discount_amount >= 0),
  CHECK (code = upper(trim(code))),
  CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at),
  CHECK (type <> 'percentage' OR value <= 100)
);

CREATE TABLE IF NOT EXISTS public.coupon_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id uuid NOT NULL REFERENCES public.coupons(id) ON DELETE RESTRICT,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  email text,
  discount_amount numeric(12,2) NOT NULL CHECK (discount_amount >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_variants_product_id ON public.product_variants (product_id);
CREATE INDEX IF NOT EXISTS idx_product_variants_stock ON public.product_variants (stock);
CREATE INDEX IF NOT EXISTS idx_product_variants_active ON public.product_variants (is_active);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON public.orders (user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders (status);
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON public.orders (payment_status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items (order_id);
CREATE INDEX IF NOT EXISTS idx_addresses_user_id ON public.addresses (user_id);
CREATE INDEX IF NOT EXISTS idx_cart_items_cart_id ON public.cart_items (cart_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cart_items_no_variant_unique
  ON public.cart_items (cart_id, product_id) WHERE variant_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_cart_items_variant_unique
  ON public.cart_items (cart_id, product_id, variant_id) WHERE variant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inventory_movements_variant_id ON public.inventory_movements (variant_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_order_id ON public.inventory_movements (order_id);

DROP TRIGGER IF EXISTS set_updated_at ON public.addresses;
CREATE TRIGGER set_updated_at
BEFORE UPDATE ON public.addresses
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON public.product_variants;
CREATE TRIGGER set_updated_at
BEFORE UPDATE ON public.product_variants
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON public.carts;
CREATE TRIGGER set_updated_at
BEFORE UPDATE ON public.carts
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON public.cart_items;
CREATE TRIGGER set_updated_at
BEFORE UPDATE ON public.cart_items
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON public.orders;
CREATE TRIGGER set_updated_at
BEFORE UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON public.payments;
CREATE TRIGGER set_updated_at
BEFORE UPDATE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON public.coupons;
CREATE TRIGGER set_updated_at
BEFORE UPDATE ON public.coupons
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.orders IS
  'Order snapshots. Pending orders are not paid; this schema does not reserve or decrement stock.';
COMMENT ON TABLE public.inventory_movements IS
  'Append-only stock history. Stock changes must be performed by a trusted server transaction.';
COMMENT ON TABLE public.carts IS
  'Authenticated cart storage. Client writes remain disabled until a server validates product availability and stock.';

COMMIT;
