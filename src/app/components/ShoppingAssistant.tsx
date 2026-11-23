import { useEffect, useRef, useState, type FormEvent } from 'react';
import { MessageCircle, Send, X, ExternalLink, Headset, PackageSearch } from 'lucide-react';
import { resolveApiBaseUrl } from '../../lib/api-config';

const WHATSAPP_URL = 'https://wa.me/573157760273?text=Hola%2C%20vengo%20de%20Urban%20Sport%20Store%20y%20necesito%20ayuda%20con%20una%20compra.';
const INACTIVITY_LIMIT_MS = 7 * 60 * 1000;
const INITIAL_ASSISTANT_MESSAGE = 'Hola, soy el asistente de Urban Sport. ¿Qué producto estás buscando?';

type AssistantSource = 'groq' | 'catalog' | 'policy' | 'fallback';
type ChatProduct = {
  id: string;
  name: string;
  brand: string;
  price: number;
  image: string | null;
  slug: string | null;
  category: string | null;
  sizes: string[];
  stock: number | null;
  url: string;
};
type ChatMessage = {
  role: 'user' | 'assistant';
  text: string;
  source?: AssistantSource;
  products?: ChatProduct[];
};

const QUICK_ACTIONS = [
  'Buscar tenis',
  'Consultar tallas',
  'Envíos y pagos',
  'Cambios y devoluciones',
];

function formatCop(value: number) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(value);
}

export default function ShoppingAssistant() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([{ role: 'assistant', text: INITIAL_ASSISTANT_MESSAGE }]);
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const resetInactivityTimer = () => {
    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    inactivityTimerRef.current = setTimeout(() => {
      setMessages([{ role: 'assistant', text: INITIAL_ASSISTANT_MESSAGE }]);
      setMessage('');
      setLoading(false);
      setOpen(false);
      inactivityTimerRef.current = null;
      requestAnimationFrame(() => triggerRef.current?.focus());
    }, INACTIVITY_LIMIT_MS);
  };

  useEffect(() => {
    if (!open) return;
    resetInactivityTimer();
    inputRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  useEffect(() => () => {
    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
  }, []);

  const close = () => {
    setOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const send = async (text: string) => {
    resetInactivityTimer();
    const clean = text.replace(/\u0000/g, '').replace(/\s+/g, ' ').trim().slice(0, 800);
    if (!clean || loading) return;

    setMessages((current) => [...current, { role: 'user', text: clean }]);
    setMessage('');
    setLoading(true);

    const context = messages.slice(-4).map((item) => ({ role: item.role, text: item.text.slice(0, 240) }));

    try {
      const base = resolveApiBaseUrl();
      const response = await fetch(`${base}/assistant/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: clean, context }),
      });
      const payload = await response.json() as {
        ok?: boolean;
        message?: string;
        source?: AssistantSource;
        products?: ChatProduct[];
      };

      setMessages((current) => [...current, {
        role: 'assistant',
        text: typeof payload.message === 'string'
          ? payload.message.slice(0, 1800)
          : 'No pude procesar la consulta. Puedes buscar en el catálogo o hablar con un asesor por WhatsApp.',
        source: payload.source,
        products: Array.isArray(payload.products) ? payload.products.slice(0, 3) : [],
      }]);
    } catch {
      setMessages((current) => [...current, {
        role: 'assistant',
        text: 'El asistente no está disponible temporalmente. Puedes seguir buscando en el catálogo o hablar con un asesor por WhatsApp.',
        source: 'fallback',
        products: [],
      }]);
    } finally {
      setLoading(false);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void send(message);
  };

  const sourceLabel: Record<AssistantSource, string> = {
    groq: 'Groq',
    catalog: 'Catálogo',
    policy: 'Política verificable',
    fallback: 'Respuesta de respaldo',
  };

  return (
    <>
      {!open && (
        <button
          ref={triggerRef}
          type="button"
          onClick={() => {
            setOpen(true);
            resetInactivityTimer();
          }}
          aria-label="¿Te ayudamos? Abrir asistente"
          aria-expanded="false"
          aria-controls="urban-sport-assistant"
          title="¿Te ayudamos?"
          style={{ right: '12px', bottom: 'max(16px, env(safe-area-inset-bottom))' }}
          className="fixed z-[70] flex h-12 w-12 items-center justify-center rounded-full border border-white/70 bg-[#bfdbfe] text-[#0b1220] shadow-[0_8px_24px_rgba(30,58,138,.28)] ring-offset-2 transition-transform duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1e3a8a] sm:bottom-5 sm:right-5"
        >
          <Headset size={22} strokeWidth={2} aria-hidden="true" />
        </button>
      )}

      {open && (
        <div
          id="urban-sport-assistant"
          ref={panelRef}
          role="dialog"
          aria-modal="false"
          aria-labelledby="assistant-title"
          className="fixed bottom-[84px] right-3 z-[70] flex h-[min(620px,calc(100dvh-104px))] w-[calc(100%-24px)] max-w-[384px] flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_18px_55px_rgba(15,23,42,.24)] sm:bottom-[92px] sm:right-5"
        >
          <header className="flex min-h-16 items-center justify-between border-b border-slate-200 bg-[#0b1220] px-4 text-white">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-blue-200">Urban Sport</p>
              <h2 id="assistant-title" className="font-display text-lg leading-tight">Asistente Urban Sport</h2>
            </div>
            <button
              type="button"
              onClick={close}
              aria-label="Cerrar asistente"
              className="flex h-10 w-10 items-center justify-center rounded-md text-white hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <X size={20} aria-hidden="true" />
            </button>
          </header>

          <div className="flex-1 overflow-y-auto px-3 py-3" aria-live="polite">
            {messages.length === 1 && (
              <div className="mb-3 grid grid-cols-2 gap-2">
                {QUICK_ACTIONS.map((action) => (
                  <button
                    key={action}
                    type="button"
                    onClick={() => void send(action)}
                    className="min-h-11 rounded-md border border-blue-200 bg-blue-50 px-2 text-left text-xs font-bold text-[#1e3a8a] hover:border-[#1e3a8a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1e3a8a]"
                  >
                    {action}
                  </button>
                ))}
              </div>
            )}

            <div className="space-y-3">
              {messages.map((item, index) => (
                <div key={`${item.role}-${index}`}>
                  <div className={`max-w-[88%] rounded-lg px-3 py-2 text-sm leading-relaxed ${item.role === 'user' ? 'ml-auto bg-[#1e3a8a] text-white' : 'bg-slate-100 text-slate-800'}`}>
                    {item.text}
                  </div>
                  {item.role === 'assistant' && item.source && (
                    <p className="mt-1 text-[11px] font-semibold text-slate-500">{sourceLabel[item.source]}</p>
                  )}
                  {item.products && item.products.length > 0 && (
                    <div className="mt-2 space-y-2">
                      {item.products.map((product) => (
                        <a
                          key={product.id}
                          href={product.url}
                          className="flex min-h-[72px] gap-3 rounded-md border border-slate-200 bg-white p-2 text-slate-900 hover:border-blue-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1e3a8a]"
                        >
                          {product.image ? (
                            <img src={product.image} alt="" className="h-14 w-14 shrink-0 rounded-md object-cover" />
                          ) : (
                            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-400"><PackageSearch size={20} aria-hidden="true" /></span>
                          )}
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-bold">{product.name}</span>
                            <span className="block text-sm font-semibold text-[#1e3a8a]">{formatCop(product.price)}</span>
                            {product.sizes.length > 0 && <span className="block text-xs text-slate-500">Tallas listadas: {product.sizes.slice(0, 6).join(', ')}</span>}
                          </span>
                          <ExternalLink size={16} className="mt-1 shrink-0 text-slate-400" aria-hidden="true" />
                        </a>
                      ))}
                    </div>
                  )}
                  {item.role === 'assistant' && (
                    <a
                      href={WHATSAPP_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-flex min-h-10 items-center gap-2 rounded-md border border-[#16a34a] px-3 text-sm font-bold text-[#166534] hover:bg-green-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16a34a]"
                    >
                      <MessageCircle size={17} aria-hidden="true" />
                      Hablar por WhatsApp
                    </a>
                  )}
                </div>
              ))}
              {loading && <p className="text-xs font-semibold text-slate-500">Revisando tu consulta…</p>}
            </div>
          </div>

          <form onSubmit={submit} className="border-t border-slate-200 bg-white p-3">
            <div className="flex gap-2">
              <label htmlFor="assistant-message" className="sr-only">Mensaje para el asistente</label>
              <input
                ref={inputRef}
                id="assistant-message"
                value={message}
                onChange={(event) => {
                  setMessage(event.target.value);
                  resetInactivityTimer();
                }}
                maxLength={800}
                placeholder="Ej. Tenis talla 40 por menos de $300.000"
                className="min-h-11 min-w-0 flex-1 rounded-md border border-slate-300 px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#1e3a8a] focus:outline-none focus:ring-2 focus:ring-[#bfdbfe]"
              />
              <button
                type="submit"
                disabled={loading || !message.trim()}
                aria-label="Enviar mensaje"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-[#1e3a8a] text-white hover:bg-[#0b1220] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1e3a8a] focus-visible:ring-offset-2"
              >
                <Send size={18} aria-hidden="true" />
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
