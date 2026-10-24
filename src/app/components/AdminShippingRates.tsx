import { useEffect, useState, type FormEvent } from 'react';
import { Pencil, Plus, RefreshCw, Save, X } from 'lucide-react';
import adminApi from '../../lib/admin-api';
import { formatAdminApiError } from '../../lib/admin-api';
import { shippingRateSchema, type ShippingRateInput } from '../../lib/shipping-validation';

type RateRow = ShippingRateInput & { id: string; updated_at?: string };
type RateForm = Record<keyof ShippingRateInput, string | boolean>;

const blankForm: RateForm = {
  carrier: 'coordinadora',
  origin_code: '', origin_city: '', origin_department: '',
  destination_code: '', destination_city: '', destination_department: '',
  route_category: 'Local', min_billable_weight_grams: '', max_billable_weight_grams: '',
  base_rate_cop: '', handling_type: 'percentage', handling_value: '',
  tax_status: 'unspecified',
  handling_basis: 'declared_value', handling_rounding: 'exact',
  estimated_delivery_business_days: '', valid_from: '', valid_until: '', is_active: true,
};

function toForm(rate: RateRow): RateForm {
  return Object.fromEntries(Object.entries(rate).filter(([key]) => key in blankForm)
    .map(([key, value]) => [key, String(value)])) as RateForm;
}

function toInput(form: RateForm): ShippingRateInput {
  return {
    carrier: 'coordinadora',
    origin_code: String(form.origin_code), origin_city: String(form.origin_city), origin_department: String(form.origin_department),
    destination_code: String(form.destination_code), destination_city: String(form.destination_city), destination_department: String(form.destination_department),
    route_category: String(form.route_category) as ShippingRateInput['route_category'],
    min_billable_weight_grams: Number(form.min_billable_weight_grams),
    max_billable_weight_grams: Number(form.max_billable_weight_grams),
    base_rate_cop: Number(form.base_rate_cop),
    tax_status: String(form.tax_status) as ShippingRateInput['tax_status'],
    handling_type: String(form.handling_type) as ShippingRateInput['handling_type'],
    handling_value: Number(form.handling_value),
    handling_basis: String(form.handling_basis) as ShippingRateInput['handling_basis'],
    handling_rounding: String(form.handling_rounding) as ShippingRateInput['handling_rounding'],
    estimated_delivery_business_days: Number(form.estimated_delivery_business_days),
    valid_from: String(form.valid_from), valid_until: String(form.valid_until),
    is_active: form.is_active === true || form.is_active === 'true',
  };
}

const textFields: Array<[keyof RateForm, string, string]> = [
  ['origin_city', 'Ciudad de origen', 'Bogotá'],
  ['origin_department', 'Departamento de origen', 'Cundinamarca'],
  ['origin_code', 'Código oficial de origen', '11001000'],
  ['destination_city', 'Ciudad de destino', 'Bogotá'],
  ['destination_department', 'Departamento de destino', 'Cundinamarca'],
  ['destination_code', 'Código oficial de destino', '11001000'],
  ['min_billable_weight_grams', 'Peso mínimo facturable (g)', '1000'],
  ['max_billable_weight_grams', 'Peso máximo facturable (g)', '2000'],
  ['base_rate_cop', 'Tarifa base (COP)', '9000'],
  ['handling_value', 'Valor de manejo', '1'],
  ['estimated_delivery_business_days', 'Plazo (días hábiles)', '1'],
  ['valid_from', 'Vigente desde', ''],
  ['valid_until', 'Vigente hasta', ''],
];

export default function AdminShippingRates() {
  const [rates, setRates] = useState<RateRow[]>([]);
  const [form, setForm] = useState<RateForm>(blankForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refresh = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await adminApi.fetchShippingRates() as { rates?: RateRow[] };
      setRates(Array.isArray(result.rates) ? result.rates : []);
    } catch (cause) {
      setError(formatAdminApiError(cause, 'No se pudieron cargar las tarifas.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, []);

  const reset = () => {
    setEditingId(null);
    setForm({ ...blankForm });
    setError('');
    setNotice('');
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    const validated = shippingRateSchema.safeParse(toInput(form));
    if (!validated.success) {
      setError(validated.error.issues[0]?.message ?? 'Revisa los datos de la tarifa.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (editingId) await adminApi.updateShippingRate(editingId, validated.data);
      else await adminApi.createShippingRate(validated.data);
      reset();
      setNotice('Tarifa guardada y cambio auditado.');
      await refresh();
    } catch (cause) {
      setError(formatAdminApiError(cause, 'No se pudo guardar la tarifa.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold text-slate-900">Tarifas Coordinadora</h2>
          <p className="mt-1 text-sm text-slate-600">Solo se cotizan rutas con una tarifa activa, vigente y única.</p>
        </div>
        <button type="button" onClick={() => void refresh()} disabled={loading} aria-label="Actualizar tarifas" title="Actualizar tarifas" className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-700 disabled:opacity-50">
          <RefreshCw size={16} />
        </button>
      </div>

      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {notice && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}

      <form onSubmit={(event) => void submit(event)} className="space-y-4 border-y border-slate-200 py-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {textFields.map(([field, label, placeholder]) => (
            <label key={field} className="space-y-1.5 text-xs font-semibold text-slate-600">
              <span>{label}</span>
              <input
                required
                type={field === 'valid_from' || field === 'valid_until' ? 'date' : 'text'}
                inputMode={field === 'origin_city' || field === 'origin_department' || field === 'destination_city' || field === 'destination_department' ? 'text' : 'numeric'}
                value={String(form[field] ?? '')}
                placeholder={placeholder}
                onChange={(event) => setForm((previous) => ({ ...previous, [field]: event.target.value }))}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal text-slate-900"
              />
            </label>
          ))}
          <label className="space-y-1.5 text-xs font-semibold text-slate-600">
            <span>Categoría de ruta</span>
            <select value={String(form.route_category)} onChange={(event) => setForm((previous) => ({ ...previous, route_category: event.target.value }))} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal text-slate-900">
              {['Local', 'Regional', 'Nacional', 'Zonal', 'Otros', 'Destinos especiales'].map((category) => <option key={category}>{category}</option>)}
            </select>
          </label>
          <label className="space-y-1.5 text-xs font-semibold text-slate-600">
            <span>Tipo de manejo</span>
            <select value={String(form.handling_type)} onChange={(event) => setForm((previous) => ({ ...previous, handling_type: event.target.value }))} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal text-slate-900">
              <option value="percentage">Porcentaje</option><option value="fixed">Valor fijo</option>
            </select>
          </label>
          <label className="space-y-1.5 text-xs font-semibold text-slate-600">
            <span>Estado de impuestos</span>
            <select value={String(form.tax_status)} onChange={(event) => setForm((previous) => ({ ...previous, tax_status: event.target.value }))} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal text-slate-900">
              <option value="unspecified">No especificado</option><option value="included">Incluidos</option><option value="excluded">Excluidos</option>
            </select>
          </label>
          <label className="space-y-1.5 text-xs font-semibold text-slate-600">
            <span>Base del manejo</span>
            <select value={String(form.handling_basis)} onChange={(event) => setForm((previous) => ({ ...previous, handling_basis: event.target.value }))} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal text-slate-900">
              <option value="declared_value">Valor declarado</option><option value="per_guide">Por guía</option>
            </select>
          </label>
          <label className="space-y-1.5 text-xs font-semibold text-slate-600">
            <span>Redondeo de manejo</span>
            <select value={String(form.handling_rounding)} onChange={(event) => setForm((previous) => ({ ...previous, handling_rounding: event.target.value }))} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal text-slate-900">
              <option value="exact">Exacto</option><option value="nearest_peso">Peso más cercano</option><option value="up_peso">Hacia arriba</option><option value="down_peso">Hacia abajo</option>
            </select>
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={form.is_active === true || form.is_active === 'true'} onChange={(event) => setForm((previous) => ({ ...previous, is_active: event.target.checked }))} />
          Tarifa activa
        </label>
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={saving} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white disabled:opacity-50">
            <Save size={15} /> {saving ? 'Guardando…' : editingId ? 'Guardar tarifa' : 'Crear tarifa'}
          </button>
          {editingId && <button type="button" onClick={reset} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700"><X size={15} /> Cancelar edición</button>}
          {!editingId && <button type="button" onClick={() => setForm({ ...blankForm })} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700"><Plus size={15} /> Limpiar</button>}
        </div>
      </form>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead><tr className="border-b border-slate-200 text-xs uppercase text-slate-500"><th className="py-3 pr-3">Ruta</th><th className="py-3 pr-3">Peso</th><th className="py-3 pr-3">Tarifa</th><th className="py-3 pr-3">Plazo</th><th className="py-3 pr-3">Vigencia</th><th className="py-3 pr-3">Estado</th><th className="py-3">Acción</th></tr></thead>
          <tbody>
            {rates.map((rate) => (
              <tr key={rate.id} className="border-b border-slate-100 text-slate-700">
                <td className="py-3 pr-3">{rate.origin_city} → {rate.destination_city}<span className="block text-xs text-slate-500">{rate.route_category} · {rate.origin_code} → {rate.destination_code}</span></td>
                <td className="py-3 pr-3">{rate.min_billable_weight_grams}–{rate.max_billable_weight_grams} g</td>
                <td className="py-3 pr-3">${rate.base_rate_cop.toLocaleString('es-CO')} + manejo<span className="block text-xs text-slate-500">Impuestos {rate.tax_status === 'unspecified' ? 'no especificados' : rate.tax_status === 'included' ? 'incluidos' : 'excluidos'}</span></td>
                <td className="py-3 pr-3">{rate.estimated_delivery_business_days} día(s)</td>
                <td className="py-3 pr-3">{rate.valid_from} – {rate.valid_until}</td>
                <td className="py-3 pr-3">{rate.is_active ? 'Activa' : 'Inactiva'}</td>
                <td className="py-3"><button type="button" aria-label={`Editar tarifa ${rate.id}`} title="Editar tarifa" onClick={() => { setEditingId(rate.id); setForm(toForm(rate)); setError(''); setNotice(''); }} className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-200"><Pencil size={14} /></button></td>
              </tr>
            ))}
            {!loading && rates.length === 0 && <tr><td colSpan={7} className="py-6 text-center text-slate-500">No hay tarifas configuradas.</td></tr>}
            {loading && <tr><td colSpan={7} className="py-6 text-center text-slate-500">Cargando tarifas…</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}