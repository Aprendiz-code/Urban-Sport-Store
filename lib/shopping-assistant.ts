export type AssistantSource = 'groq' | 'catalog' | 'policy' | 'fallback';

export type AssistantProduct = {
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

export type AssistantResponse = {
  ok: true;
  message: string;
  source: AssistantSource;
  products: AssistantProduct[];
  needsWhatsApp: boolean;
};

export type AssistantRequest = {
  message: string;
  context?: Array<{ role: 'user' | 'assistant'; text: string }>;
};

const COP_FORMATTER = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

export function formatCop(value: number) {
  return COP_FORMATTER.format(value);
}

export function sanitizeText(value: unknown, maxLength = 800) {
  if (typeof value !== 'string') return '';
  return value.replace(/\u0000/g, '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

export function sanitizeContext(value: unknown): Array<{ role: 'user' | 'assistant'; text: string }> {
  if (!Array.isArray(value)) return [];
  return value.slice(-4).flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const role = entry.role === 'assistant' ? 'assistant' : entry.role === 'user' ? 'user' : null;
    const text = sanitizeText(entry.text, 240);
    return role && text ? [{ role, text }] : [];
  });
}

function normalize(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function extractSize(message: string) {
  const match = normalize(message).match(/(?:talla|tallas|numero|número|size)\s*(?:es|=|:)?\s*([0-9]{1,2}(?:[.,][0-9])?)/);
  return match?.[1]?.replace(',', '.') ?? null;
}

function extractBudget(message: string) {
  const normalized = normalize(message).replace(/\./g, '').replace(/\s/g, '');
  const match = normalized.match(/(?:menosde|hasta|maximo|máximo|presupuesto(?:de)?)[^0-9]*([0-9]+)/);
  if (match) {
    const raw = Number(match[1]);
    return raw >= 1000 ? raw : raw * 1000;
  }
  const range = normalized.match(/(?:200|300|400|500)(?:mil|000)/);
  if (range) return Number(normalized.match(/[0-9]+/)?.[0] ?? 0) * 1000;
  return null;
}

export function detectStructuredIntent(message: string) {
  const normalized = normalize(message);
  const size = extractSize(normalized);
  const budget = extractBudget(normalized);
  const asksTennis = /tenis|zapatilla|zapato|calzado/.test(normalized);
  const asksCategory = /(ropa|camiseta|pantalon|buzo|perfume|reloj|gafa|accesorio)/.test(normalized);
  const brands = [...normalized.matchAll(/\b(nike|adidas|puma|reebok|new balance|saucony|jordan|asics)\b/g)].map((match) => match[1]);
  return {
    size,
    budget,
    brand: brands[0] ?? null,
    category: asksTennis ? 'Tenis' : asksCategory ? 'Ropa' : null,
  };
}

export async function fetchAssistantProducts() {
  let supabasePublic: any;
  try {
    const module = await import('./api-helpers/supabase.ts');
    supabasePublic = module.supabasePublic;
  } catch {
    throw new Error('catalog_unavailable');
  }

  const { data, error } = await supabasePublic
    .from('products')
    .select('id,slug,name,brand,description,price,main_image,images,stock,sizes,category,catalog_section,is_active')
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (error) throw new Error('catalog_unavailable');

  return (Array.isArray(data) ? data : []).map((record: any): AssistantProduct => {
    const slug = typeof record.slug === 'string' && record.slug ? record.slug : null;
    const rawImage = typeof record.main_image === 'string' && record.main_image
      ? record.main_image
      : Array.isArray(record.images) && typeof record.images[0] === 'string'
        ? record.images[0]
        : null;
    const image = rawImage
      ? /^https?:\/\//i.test(rawImage)
        ? rawImage
        : supabasePublic.storage.from('products').getPublicUrl(rawImage).data.publicUrl
      : null;
    return {
      id: String(record.id),
      name: typeof record.name === 'string' ? record.name : 'Producto',
      brand: typeof record.brand === 'string' ? record.brand : '',
      price: Number(record.price ?? 0),
      image,
      slug,
      category: typeof record.catalog_section === 'string'
        ? record.catalog_section
        : typeof record.category === 'string'
          ? record.category
          : null,
      sizes: Array.isArray(record.sizes) ? record.sizes.map(String) : [],
      stock: typeof record.stock === 'number' ? record.stock : null,
      url: slug ? `/catalog?product=${encodeURIComponent(slug)}` : `/catalog?product=${encodeURIComponent(String(record.id))}`,
    };
  });
}

export function filterProducts(products: AssistantProduct[], message: string) {
  const intent = detectStructuredIntent(message);
  const normalized = normalize(message);

  return products.filter((product) => {
    const searchable = normalize(`${product.name} ${product.brand} ${product.category ?? ''}`);
    if (intent.brand && !normalize(product.brand).includes(intent.brand)) return false;
    if (intent.category === 'Tenis' && !/(tenis|zapatilla|zapato|calzado)/.test(searchable)) return false;
    if (intent.category === 'Ropa' && !/(ropa|camiseta|pantalon|buzo|short|chaqueta)/.test(searchable)) return false;
    if (intent.budget !== null && product.price > intent.budget) return false;
    if (intent.size && !product.sizes.some((size) => normalize(size) === normalize(intent.size ?? ''))) return false;
    if (!intent.brand && !intent.size && !intent.budget && !intent.category) {
      return /(tenis|ropa|perfume|reloj|gafa|producto)/.test(normalized);
    }
    return true;
  }).sort((left, right) => left.price - right.price).slice(0, 3);
}

export function getGeneralAnswer(message: string): { message: string; needsWhatsApp: boolean } | null {
  const normalized = normalize(message);

  if (/^(hola|buenos dias|buenas tardes|buenas noches|hey|que tal|qué tal)[!?. ]*$/.test(normalized)) {
    return {
      message: 'Hola. Puedo ayudarte a buscar tenis, ropa, perfumes, relojes y gafas, comparar opciones o explicar envíos y cambios. ¿Qué estás buscando?',
      needsWhatsApp: false,
    };
  }

  if (/que puedes hacer|qué puedes hacer|como ayudas|cómo ayudas|para que sirves|para qué sirves|ayuda en linea|ayuda en línea/.test(normalized)) {
    return {
      message: 'Puedo buscar productos del catálogo, filtrar por talla, presupuesto, marca y categoría, explicar envíos y pagos conocidos, y orientar cambios o devoluciones. También puedo derivar casos de pedidos, reclamos o garantías a WhatsApp.',
      needsWhatsApp: false,
    };
  }

  if (/como comprar|cómo comprar|hacer pedido|carrito|agregar al carrito|añadir al carrito/.test(normalized)) {
    return {
      message: 'Busca un producto, abre su ficha y usa las opciones de talla o cantidad antes de agregarlo al carrito. En este momento el checkout puede estar bloqueado para completar un pago; no puedo confirmar ni procesar compras desde el chat.',
      needsWhatsApp: true,
    };
  }

  if (/cuenta|perfil|iniciar sesion|iniciar sesión|registrarme|crear cuenta|contraseña|password/.test(normalized)) {
    return {
      message: 'La tienda permite iniciar sesión y crear una cuenta desde su menú de usuario. Para recuperar o cambiar información privada, usa las opciones de perfil de la tienda y no envíes contraseñas al chat.',
      needsWhatsApp: false,
    };
  }

  if (/categoria|categoría|tenis hombre|tenis mujer|ropa hombre|ropa mujer|perfumes|relojes|gafas|catalogo|catálogo/.test(normalized)) {
    return {
      message: 'Puedes explorar las categorías de Tenis Hombre, Tenis Mujer, Ropa Hombre, Ropa Mujer, Perfumes, Relojes y Gafas. También puedes decirme presupuesto, talla, marca o uso para filtrar opciones.',
      needsWhatsApp: false,
    };
  }

  if (/descuento|promocion|promoción|oferta|precio/.test(normalized)) {
    return {
      message: 'Los precios y descuentos visibles deben tomarse directamente del catálogo o de la promoción activa publicada en la tienda. No puedo inventar cupones ni confirmar rebajas desde el chat.',
      needsWhatsApp: false,
    };
  }

  return null;
}

export function getPolicyAnswer(message: string): { message: string; needsWhatsApp: boolean } | null {
  const normalized = normalize(message);

  if (/^consultar tallas$|\btallas?\b/.test(normalized) && !/\b[0-9]{1,2}(?:[.,][0-9])?\b/.test(normalized)) {
    return {
      message: 'Dime la talla que buscas y el tipo de producto. Las tallas listadas no confirman inventario por variante.',
      needsWhatsApp: false,
    };
  }

  if (/seguimiento|pedido|rastreo|garantia|garantía|reclamo|dañado|dañado/.test(normalized)) {
    return {
      message: 'El estado de pedidos, reclamos y garantías necesita un asesor. Escríbenos por WhatsApp para revisarlo con los datos de tu compra.',
      needsWhatsApp: true,
    };
  }

  if (/envio|envío|entrega|coordinadora|cobertura|domicilio|gratis/.test(normalized)) {
    return {
      message: 'Realizamos envíos a Colombia. La cobertura, tarifa y plazo se confirman según el destino y el contenido del pedido en la cotización de envío vigente. No puedo confirmar una condición de envío gratis sin la política vigente de la tienda.',
      needsWhatsApp: false,
    };
  }

  if (/pago|pagar|pse|nequi|daviplata|tarjeta|efectivo|bancolombia|wompi/.test(normalized)) {
    return {
      message: 'Los medios disponibles pueden incluir tarjetas, PSE y opciones locales que se muestran en el sitio, según la integración vigente. Antes de pagar, el sistema debe mostrar el medio y el valor confirmados. No solicites ni compartas datos de tarjeta en este chat.',
      needsWhatsApp: true,
    };
  }

  if (/cambio|devolucion|devolución|devolver|reembolso/.test(normalized)) {
    return {
      message: 'Puedes solicitar cambios o devoluciones dentro de los primeros 30 días calendario desde la entrega, con el producto en las condiciones acordadas y el empaque original. Si el motivo es preferencia o talla, el envío de regreso puede quedar a cargo del cliente. Para validar tu caso, escríbenos por WhatsApp.',
      needsWhatsApp: true,
    };
  }

  return null;
}

export function buildCatalogMessage(products: AssistantProduct[], message: string) {
  if (products.length === 0) {
    return 'No encontré una coincidencia exacta con esos datos en el catálogo activo. Puedes ampliar el presupuesto o probar otra talla, o un asesor puede ayudarte por WhatsApp.';
  }

  const intent = detectStructuredIntent(message);
  const prefix = intent.size
    ? `Encontré estas opciones que incluyen talla ${intent.size} en su lista de tallas:`
    : intent.budget
      ? `Estas opciones están dentro de ${formatCop(intent.budget)}:`
      : 'Estas son las opciones más relevantes del catálogo:';
  return `${prefix}\n${products.map((product) => `• ${product.name} — ${formatCop(product.price)}`).join('\n')}\nLas tallas mostradas son tallas listadas; el sitio no confirma inventario por variante.`;
}

export async function resolveGroqModel(apiKey: string, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch('https://api.groq.com/openai/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    });
    if (!response.ok) return null;

    const payload = await response.json() as { data?: Array<{ id?: string; active?: boolean }> };
    const ids = (payload.data ?? [])
      .filter((model) => model.active !== false && typeof model.id === 'string')
      .map((model) => model.id as string);

    const preferences = [
      'llama-3.3-70b-versatile',
      'llama-3.1-8b-instant',
      'llama3-8b-8192',
      'llama3-70b-8192',
    ];

    for (const preferred of preferences) {
      if (ids.includes(preferred)) return preferred;
    }

    const chatModel = ids.find((id) => /^(llama|qwen|gemma|mistral|mixtral)/i.test(id));
    return chatModel ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function callGroq(params: {
  apiKey: string;
  model: string;
  question: string;
  context: Array<{ role: 'user' | 'assistant'; text: string }>;
  products: AssistantProduct[];
  timeoutMs: number;
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), params.timeoutMs);

  const productData = params.products.slice(0, 3).map((product) => ({
    id: product.id,
    name: product.name,
    brand: product.brand,
    price_cop: product.price,
    sizes_listed: product.sizes,
    stock_confirmed_by_variant: false,
    url: product.url,
  }));
  const recentContext = params.context.slice(-4).map((item) => ({ role: item.role, content: sanitizeText(item.text, 240) }));

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${params.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: params.model,
        temperature: 0.2,
        max_tokens: 280,
        messages: [
          {
            role: 'system',
            content: 'Eres el asistente de Urban Sport Store. Responde en español colombiano, claro y breve. Usa únicamente el catálogo JSON adjunto. No inventes marca, precio, talla disponible, inventario, envíos, plazos, pagos ni promociones. Las tallas son solo listadas: no digas disponible. Si no puedes confirmar un dato, derivar a WhatsApp. Nunca solicites datos personales ni números de tarjeta. No modifiques carrito ni checkout.',
          },
          ...recentContext,
          {
            role: 'user',
            content: `Pregunta del cliente: ${sanitizeText(params.question, 800)}\nCatálogo real (máximo 3): ${JSON.stringify(productData)}`,
          },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      if (response.status === 429) return { kind: 'rate_limit' as const };
      return { kind: 'provider_error' as const };
    }

    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = sanitizeText(payload.choices?.[0]?.message?.content, 1800);
    if (!content) return { kind: 'provider_error' as const };
    return { kind: 'success' as const, content };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') return { kind: 'timeout' as const };
    return { kind: 'provider_error' as const };
  } finally {
    clearTimeout(timeout);
  }
}

export function getFallbackMessage(reason: 'missing_config' | 'rate_limit' | 'timeout' | 'provider_error') {
  const messages = {
    missing_config: 'El asistente con IA no está configurado en este momento, pero puedo ayudarte con el catálogo y las políticas disponibles.',
    rate_limit: 'La asistencia por IA alcanzó su límite temporal. Puedes seguir buscando en el catálogo o hablar con un asesor por WhatsApp.',
    timeout: 'La asistencia por IA tardó demasiado. Puedes seguir buscando en el catálogo o hablar con un asesor por WhatsApp.',
    provider_error: 'La asistencia por IA no está disponible temporalmente. Puedes seguir buscando en el catálogo o hablar con un asesor por WhatsApp.',
  };
  return messages[reason];
}
