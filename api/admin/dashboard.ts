import { jsonError, jsonResponse, ApiError } from '../../lib/api-helpers/response.ts';
import { supabaseAdmin } from '../../lib/api-helpers/supabase.ts';
import { requirePermission } from '../../lib/api-helpers/admin.ts';
import { requireAuthenticatedUser } from '../../lib/api-helpers/auth.ts';

const RECENT_ORDERS_LIMIT = 10;
const SALES_PAGE_SIZE = 500;
const SALES_MAX_ROWS = 5_000;

async function canRead(user: { id: string }, permission: 'orders.read' | 'customers.read' | 'reports.read') {
  try {
    await requirePermission(user, permission);
    return true;
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) return false;
    throw error;
  }
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return jsonError(res, 405, 'Método no permitido.');
  }

  try {
    const user = await requireAuthenticatedUser(req);
    const [canReadOrders, canReadCustomers, canReadReports] = await Promise.all([
      canRead(user, 'orders.read'),
      canRead(user, 'customers.read'),
      canRead(user, 'reports.read'),
    ]);

    const result: {
      orders: { status: 'forbidden' | 'error' | 'empty' | 'ready'; total: number | null; recent: Array<Record<string, unknown>> };
      customers: { status: 'forbidden' | 'error' | 'empty' | 'ready'; total: number | null };
      sales: { status: 'forbidden' | 'error' | 'empty' | 'ready'; paid_orders: number | null; total_7d: number | null; period_start: string | null; period_end: string | null };
      category_sales_status: 'forbidden' | 'error' | 'empty' | 'pending';
    } = {
      orders: { status: canReadOrders ? 'error' : 'forbidden', total: null, recent: [] },
      customers: { status: canReadCustomers ? 'error' : 'forbidden', total: null },
      sales: { status: canReadReports ? 'error' : 'forbidden', paid_orders: null, total_7d: null, period_start: null, period_end: null },
      category_sales_status: canReadReports ? 'error' : 'forbidden',
    };

    if (canReadOrders) {
      const orderColumns = [
        'id', 'order_number', 'status', 'payment_status', 'total', 'created_at',
        'order_items(count)',
        ...(canReadCustomers ? ['customer_name'] : []),
      ].join(', ');
      const { data, count, error } = await supabaseAdmin
        .from('orders')
        .select(orderColumns, { count: 'exact' })
        .order('created_at', { ascending: false })
        .limit(RECENT_ORDERS_LIMIT);

      if (error) {
        console.error('[Admin Dashboard] Orders query failed', { code: error.code });
      } else {
        const rows = (data ?? []).map((order: any) => ({
          id: order.id,
          order_number: order.order_number,
          status: order.status,
          payment_status: order.payment_status,
          total: order.total,
          created_at: order.created_at,
          item_count: Array.isArray(order.order_items)
            ? order.order_items.reduce((sum: number, item: { count?: number }) => sum + Number(item.count ?? 0), 0)
            : 0,
          ...(canReadCustomers ? { customer_name: order.customer_name } : {}),
        }));
        result.orders = {
          status: (count ?? 0) === 0 ? 'empty' : 'ready',
          total: count ?? 0,
          recent: rows,
        };
      }
    }

    if (canReadCustomers) {
      const { count, error } = await supabaseAdmin
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'CUSTOMER');

      if (error) {
        console.error('[Admin Dashboard] Customer count query failed', { code: error.code });
      } else {
        result.customers = {
          status: (count ?? 0) === 0 ? 'empty' : 'ready',
          total: count ?? 0,
        };
      }
    }

    if (canReadReports) {
      const periodEnd = new Date();
      const periodStart = new Date(periodEnd.getTime() - 7 * 24 * 60 * 60 * 1000);
      const paidOrders: Array<{ total: number | string; created_at: string }> = [];
      let salesFailed = false;

      for (let offset = 0; ; offset += SALES_PAGE_SIZE) {
        const { data, error } = await supabaseAdmin
          .from('orders')
          .select('total, created_at')
          .eq('payment_status', 'paid')
          .not('status', 'in', '(cancelled,refunded)')
          .gte('created_at', periodStart.toISOString())
          .lte('created_at', periodEnd.toISOString())
          .order('created_at', { ascending: true })
          .order('id', { ascending: true })
          .range(offset, offset + SALES_PAGE_SIZE - 1);

        if (error) {
          console.error('[Admin Dashboard] Paid orders query failed', { code: error.code });
          salesFailed = true;
          break;
        }

        const page = data ?? [];
        if (offset >= SALES_MAX_ROWS && page.length > 0) {
          console.error('[Admin Dashboard] Paid sales row limit exceeded', { limit: SALES_MAX_ROWS });
          salesFailed = true;
          break;
        }

        paidOrders.push(...page);
        if (page.length < SALES_PAGE_SIZE) break;
      }

      if (salesFailed) {
        result.sales = { status: 'error', paid_orders: null, total_7d: null, period_start: null, period_end: null };
        result.category_sales_status = 'error';
      } else {
        const total = paidOrders.reduce((sum, order) => sum + Number(order.total), 0);
        result.sales = {
          status: paidOrders.length === 0 ? 'empty' : 'ready',
          paid_orders: paidOrders.length,
          total_7d: total,
          period_start: periodStart.toISOString(),
          period_end: periodEnd.toISOString(),
        };
        result.category_sales_status = paidOrders.length === 0 ? 'empty' : 'pending';
      }
    }

    return jsonResponse(res, { data: result });
  } catch (error) {
    if (error instanceof ApiError) return jsonError(res, error.status, error.message);
    console.error('[Admin Dashboard] Request failed');
    return jsonError(res, 500, 'No fue posible cargar el resumen administrativo.');
  }
}