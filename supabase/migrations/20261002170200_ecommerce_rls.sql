BEGIN;

ALTER TABLE public.addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupon_redemptions ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE
  public.addresses,
  public.product_variants,
  public.carts,
  public.cart_items,
  public.orders,
  public.order_items,
  public.payments,
  public.inventory_movements,
  public.coupons,
  public.coupon_redemptions
FROM anon, authenticated;

GRANT SELECT ON TABLE public.addresses, public.carts, public.cart_items,
  public.orders, public.order_items, public.payments, public.inventory_movements
TO authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.addresses TO authenticated;
GRANT SELECT ON TABLE public.product_variants TO anon, authenticated;
GRANT SELECT ON TABLE public.coupons, public.coupon_redemptions TO authenticated;
GRANT SELECT ON TABLE public.categories, public.products TO anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE
  public.addresses,
  public.product_variants,
  public.carts,
  public.cart_items,
  public.orders,
  public.order_items,
  public.payments,
  public.inventory_movements,
  public.coupons,
  public.coupon_redemptions
TO service_role;

REVOKE ALL PRIVILEGES ON TABLE public.newsletter_subscribers FROM anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE public.newsletter_subscribers TO service_role;

DROP POLICY IF EXISTS "public_active_catalog_read" ON public.categories;
CREATE POLICY "public_active_catalog_read"
ON public.categories FOR SELECT TO anon, authenticated
USING (is_active = true);

DROP POLICY IF EXISTS "public_active_products_read" ON public.products;
CREATE POLICY "public_active_products_read"
ON public.products FOR SELECT TO anon, authenticated
USING (is_active = true);

DROP POLICY IF EXISTS "active_variants_public_read" ON public.product_variants;
CREATE POLICY "active_variants_public_read"
ON public.product_variants FOR SELECT TO anon, authenticated
USING (
  is_active = true
  AND EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = product_variants.product_id
      AND p.is_active = true
  )
);

DROP POLICY IF EXISTS "addresses_owner_select" ON public.addresses;
CREATE POLICY "addresses_owner_select"
ON public.addresses FOR SELECT TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "addresses_owner_insert" ON public.addresses;
CREATE POLICY "addresses_owner_insert"
ON public.addresses FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "addresses_owner_update" ON public.addresses;
CREATE POLICY "addresses_owner_update"
ON public.addresses FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "addresses_owner_delete" ON public.addresses;
CREATE POLICY "addresses_owner_delete"
ON public.addresses FOR DELETE TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "carts_owner_select" ON public.carts;
CREATE POLICY "carts_owner_select"
ON public.carts FOR SELECT TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "cart_items_owner_select" ON public.cart_items;
CREATE POLICY "cart_items_owner_select"
ON public.cart_items FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.carts c
    WHERE c.id = cart_items.cart_id
      AND c.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "orders_self_select" ON public.orders;
CREATE POLICY "orders_self_select"
ON public.orders FOR SELECT TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "orders_admin_readwrite" ON public.orders;
DROP POLICY IF EXISTS "orders_admin_select" ON public.orders;
CREATE POLICY "orders_admin_select"
ON public.orders FOR SELECT TO authenticated
USING ((SELECT private.is_admin()));

DROP POLICY IF EXISTS "order_items_self_select" ON public.order_items;
CREATE POLICY "order_items_self_select"
ON public.order_items FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id
      AND o.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "order_items_admin_read" ON public.order_items;
CREATE POLICY "order_items_admin_read"
ON public.order_items FOR SELECT TO authenticated
  USING ((SELECT private.is_admin()));

DROP POLICY IF EXISTS "payments_self_select" ON public.payments;
CREATE POLICY "payments_self_select"
ON public.payments FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = payments.order_id
      AND o.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "payments_admin_readwrite" ON public.payments;
DROP POLICY IF EXISTS "payments_admin_select" ON public.payments;
CREATE POLICY "payments_admin_select"
ON public.payments FOR SELECT TO authenticated
USING ((SELECT private.is_admin()));

DROP POLICY IF EXISTS "inventory_admin_select" ON public.inventory_movements;
CREATE POLICY "inventory_admin_select"
ON public.inventory_movements FOR SELECT TO authenticated
USING ((SELECT private.is_admin()));

DROP POLICY IF EXISTS "coupons_admin_select" ON public.coupons;
CREATE POLICY "coupons_admin_select"
ON public.coupons FOR SELECT TO authenticated
USING ((SELECT private.is_admin()));

DROP POLICY IF EXISTS "coupon_redemptions_admin_read" ON public.coupon_redemptions;
CREATE POLICY "coupon_redemptions_admin_read"
ON public.coupon_redemptions FOR SELECT TO authenticated
USING ((SELECT private.is_admin()));

DO $$
DECLARE
  v_policyname text;
BEGIN
  FOR v_policyname IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'newsletter_subscribers'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.newsletter_subscribers', v_policyname);
  END LOOP;
END;
$$;

COMMIT;
