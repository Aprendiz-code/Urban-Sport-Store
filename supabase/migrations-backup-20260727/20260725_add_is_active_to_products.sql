-- Agregar columna is_active a products con default true
-- Esto permite filtrar productos inactivos sin romper el schema existente

ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
-- Backfill: Marcar todos los productos existentes como activos
-- Justificación: Todos los productos que existen actualmente en la BD
-- fueron ingresados sin este campo, así que se asume que eran visibles/activos
UPDATE public.products
SET is_active = true
WHERE is_active IS NULL;
-- Crear índice para búsquedas eficientes
CREATE INDEX IF NOT EXISTS idx_products_is_active ON public.products(is_active);
