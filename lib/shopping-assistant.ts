export type AssistantSource = 'groq' | 'catalog' | 'policy' | 'fallback';

export type AssistantProduct = {
  id: string;
  name: string;
  brand: string;
  price: number;
  image: string | null;
  slug: string | null;
  category: string | null;
  description: string;
  sizes: string[];
  colors: string[];
  specifications: Array<{ name: string; value: string }>;
  stock: number | null;
  url: string;
};

const STORE_VOICE = 'Soy del equipo comercial de Urban Sport Store';

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
  const brands = [...normalized.matchAll(/\b(nike|puma|reebok|new balance|saucony|jordan|asics)\b/g)].map((match) => match[1]);
  const colorMatch = normalized.match(/\b(negro|negra|blanco|blanca|azul|rojo|roja|verde|gris|beige|marron|rosado|rosa|amarillo|amarilla|naranja|violeta|morado|morada|purpura)\b/);
  const colorNames: Record<string, string> = { negra: 'negro', blanca: 'blanco', roja: 'rojo', amarilla: 'amarillo', morada: 'morado', rosado: 'rosado' };
  const detectedColor = colorMatch?.[1] ? (colorNames[colorMatch[1]] ?? colorMatch[1]) : null;
  return {
    size,
    budget,
    brand: brands[0] ?? null,
    color: detectedColor,
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
    .select('id,slug,name,brand,short_description,description,price,main_image,images,stock,sizes,specifications,catalog_section,is_active,product_variants(size,color,color_hex,stock,price,is_active)')
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
    const variants = Array.isArray(record.product_variants) ? record.product_variants.filter((variant: any) => variant.is_active !== false) : [];
    const sizeList = Array.isArray(record.sizes) ? record.sizes.map(String) : [];
    const variantSizes = variants.map((variant: any) => typeof variant.size === 'string' ? variant.size : '').filter(Boolean);
    const variantColors = variants.map((variant: any) => typeof variant.color === 'string' ? variant.color : '').filter(Boolean);
    const specifications = Array.isArray(record.specifications)
      ? record.specifications.flatMap((item: any) => item && typeof item.name === 'string' && typeof item.value === 'string'
        ? [{ name: item.name, value: item.value }]
        : [])
      : [];
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
      description: typeof record.description === 'string'
        ? record.description
        : typeof record.short_description === 'string'
          ? record.short_description
          : '',
      sizes: [...new Set([...sizeList, ...variantSizes])],
      colors: [...new Set(variantColors)],
      specifications,
      stock: variants.length > 0
        ? variants.reduce((sum: number, variant: any) => sum + (typeof variant.stock === 'number' ? variant.stock : 0), 0)
        : typeof record.stock === 'number' ? record.stock : null,
      url: slug ? `/catalog?product=${encodeURIComponent(slug)}` : `/catalog?product=${encodeURIComponent(String(record.id))}`,
    };
  });
}

export function filterProducts(products: AssistantProduct[], message: string) {
  const intent = detectStructuredIntent(message);
  const normalized = normalize(message);

  return products.filter((product) => {
    const searchable = normalize(`${product.name} ${product.brand} ${product.category ?? ''} ${product.description} ${product.specifications.map((spec) => `${spec.name} ${spec.value}`).join(' ')}`);
    if (intent.brand && !normalize(product.brand).includes(intent.brand)) return false;
    if (intent.color && !normalize(product.colors.join(' ')).includes(intent.color)) return false;
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

export function getSiteKnowledgeAnswer(message: string): { message: string; needsWhatsApp: boolean } | null {
  const normalized = normalize(message);

  if (/que tiene la pagina|qué tiene la página|que contiene|secciones|navegacion|navegación|menu|menú/.test(normalized)) {
    return {
      message: `${STORE_VOICE}. Te puedo recorrer la tienda: tenemos inicio, búsqueda, categorías de Tenis Hombre y Mujer, Ropa Hombre y Mujer, Perfumes, Relojes y Gafas, fichas de producto, carrito, cuenta y opciones de envíos y cambios. También puedes guardar tu selección en el carrito de invitado de este dispositivo. ¿Qué quieres conocer?`,
      needsWhatsApp: false,
    };
  }

  if (/carrito|lista de compras|guardar.*carrito|cantidad/.test(normalized)) {
    return {
      message: `${STORE_VOICE} y te explico tu carrito: puedes sumar o quitar cantidades y revisarlo cuando vuelvas desde este dispositivo. Desde aquí no puedo procesar pagos ni cerrar una compra; el pago lo terminas de forma segura en la tienda.`,
      needsWhatsApp: false,
    };
  }

  if (/checkout|pasarela|pago seguro|wompi|contra entrega|medios? de pago|metodos? de pago|colegio|tarjeta|pse|nequi|daviplata|bancolombia/.test(normalized)) {
    return {
      message: 'La página muestra métodos como tarjetas Visa, Mastercard y American Express, PSE, Nequi, Daviplata, transferencia Bancolombia y pago contra entrega. El sitio puede mostrar opciones oficiales antes de pagar, pero no puedo solicitar datos de tarjeta ni confirmar una compra desde el chat.',
      needsWhatsApp: true,
    };
  }

  if (/horario|atencion|atención|contacto|correo|redes sociales|donde escribo|dónde escribo/.test(normalized)) {
    return {
      message: 'Puedes escribir por el canal oficial de WhatsApp o consultar el correo Urbansportstore@outlook.com. Para pedidos, reclamos, garantías o seguimiento, conviene usar WhatsApp porque el chat no tiene acceso autorizado al estado de pedidos.',
      needsWhatsApp: true,
    };
  }

  if (/politica|política|terminos|términos|privacidad|datos personales/.test(normalized)) {
    return {
      message: 'La tienda ofrece páginas de Política de privacidad, Términos y condiciones, Envíos y Cambios y devoluciones. Puedes consultarlas desde el pie de página. No puedo inventar excepciones ni confirmar datos privados desde el chat.',
      needsWhatsApp: false,
    };
  }

  if (/inicio|home|ofertas|productos destacados|novedades|destacados|promocion|promoción/.test(normalized)) {
    return {
      message: 'El inicio presenta promociones, categorías, productos destacados, nuevas llegadas, ofertas y descuentos visibles desde la tienda. Las promociones válidas son las que aparecen activas en el sitio; no puedo inventar porcentajes o cupones.',
      needsWhatsApp: false,
    };
  }

  return null;
}

export function getGeneralAnswer(message: string): { message: string; needsWhatsApp: boolean } | null {
  const normalized = normalize(message);

  if (/^(hola|buenos dias|buenas tardes|buenas noches|hey|que tal|qué tal)[!?. ]*$/.test(normalized)) {
    return {
      message: `¡Hola! ${STORE_VOICE} y qué gusto acompañarte. Busquemos juntos tenis, ropa, perfumes, relojes o gafas. También puedo comparar opciones, revisar tallas, colores y presupuesto. ¿Qué estás buscando hoy?`,
      needsWhatsApp: false,
    };
  }

  if (/que puedes hacer|qué puedes hacer|como ayudas|cómo ayudas|para que sirves|para qué sirves|ayuda en linea|ayuda en línea/.test(normalized)) {
    return {
      message: `${STORE_VOICE}. Con gusto te ayudo a buscar por presupuesto, talla, marca, color o categoría y a comparar opciones reales del catálogo. Para seguimiento de pedido, reclamo o garantía te acompañaré por WhatsApp. ¿Qué necesitas resolver?`,
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

  if (/categoria|categoría|tenis hombre|tenis mujer|ropa hombre|ropa mujer|perfumes|relojes|gafas/.test(normalized)) {
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
      message: 'Claro, con gusto te apoyo. Dime la talla que buscas y qué tipo de producto necesitas. Las tallas listadas no confirman inventario por variante.',
      needsWhatsApp: false,
    };
  }

  if (/seguimiento|pedido|rastreo|garantia|garantía|reclamo|dañado|dañado/.test(normalized)) {
    return {
      message: `Entiendo tu caso. ${STORE_VOICE} y puedo ayudarte con lo siguiente, pero el seguimiento de pedidos y garantías debe revisarlo el equipo con los datos de tu compra. Escríbenos por WhatsApp y continuaremos contigo paso a paso.`,
      needsWhatsApp: true,
    };
  }

  if (/envio|envío|entrega|coordinadora|cobertura|domicilio|gratis/.test(normalized)) {
    return {
      message: `Con gusto te oriento. ${STORE_VOICE} y realizamos envíos a Colombia. El destino y el contenido del pedido permiten confirmar cobertura, tarifa y plazo en la cotización vigente. Si tienes dudas sobre el envío de tu compra, te ayudamos a revisarlo antes de pagar.`,
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
      message: `Claro, te puedo orientar. ${STORE_VOICE} y los cambios o devoluciones pueden solicitarse dentro de los primeros 30 días desde la entrega, con el producto y el empaque en buenas condiciones acordadas. Si el cambio es por preferencia o talla, el envío de regreso puede corresponderte. Escríbenos por WhatsApp para revisar tu caso.`,
      needsWhatsApp: true,
    };
  }

  return null;
}

export function buildCatalogMessage(products: AssistantProduct[], message: string) {
  if (products.length === 0) {
    return `${STORE_VOICE} y ahora mismo no encontré una coincidencia exacta en el catálogo activo. Ajustemos el presupuesto, la talla, el color o la categoría; así podremos encontrar una opción que te quede mejor. Si prefieres, te conecto con un asesor por WhatsApp.`;
  }

  const intent = detectStructuredIntent(message);
  const prefix = intent.size
    ? `Con gusto te muestro estas opciones que incluyen talla ${intent.size}:`
    : intent.color
      ? `Estas opciones incluyen el color solicitado:`
      : intent.budget
        ? `Estas opciones están dentro de ${formatCop(intent.budget)}:`
        : 'Estas son las opciones más relevantes del catálogo:';
  const details = products.map((product) => {
    const colors = product.colors.length ? `; colores: ${product.colors.join(', ')}` : '';
    const sizes = product.sizes.length ? `; tallas: ${product.sizes.join(', ')}` : '';
    const specs = product.specifications.length ? `; ${product.specifications.map((spec) => `${spec.name}: ${spec.value}`).join('; ')}` : '';
    const description = product.description ? ` — ${product.description}` : '';
    return `• ${product.name} — ${formatCop(product.price)}${description}${colors}${sizes}${specs}`;
  });
  return `${prefix}\n${details.join('\n')}\nLa disponibilidad exacta por talla y color se confirma con el inventario activo del catálogo.`;
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

  const productData = params.products.slice(0, 10).map((product) => ({
    id: product.id,
    name: product.name,
    brand: product.brand,
    price_cop: product.price,
    description: product.description,
    sizes_listed: product.sizes,
    colors_listed: product.colors,
    specifications: product.specifications,
    stock_confirmed: product.stock,
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
            content: 'Representas a Urban Sport Store como vendedor experto y amable de la tienda. Habla siempre en primera persona del equipo comercial: “te ayudo”, “te recomiendo”, “podemos revisar”. Usa español colombiano, cercanía y lenguaje claro. No suenes como sistema, proveedor o asistente técnico. Usa solo el inventario JSON adjunto y los datos públicos verificables. Responde consultas sobre nombre, marca, precio, descripción, categoría, talla, color, especificaciones, stock y enlace de cada producto. Puedes comparar productos y recomendar opciones según presupuesto, talla, color o uso. Usa tallas y colores solo si aparecen en el catálogo; no afirmes disponibilidad por variante si no existe un stock confirmado. Para compras, envíos a Colombia, pagos y devoluciones usa solo las políticas visibles: cambios dentro de 30 días con producto y empaque acordados, y medios tarjetas, PSE, Nequi, Daviplata, Bancolombia y contra entrega. No inventes datos, plazos, descuentos ni inventario. Si falta una variante exacta, indícalo y ofrece un siguiente paso o WhatsApp. Nunca solicites datos personales ni números de tarjeta. No modifiques carrito, checkout ni confirmes compras.',
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
    missing_config: `Soy del equipo comercial de Urban Sport Store. En este momento el buscador inteligente está fuera de servicio, pero puedo orientarte con el catálogo y las políticas disponibles.`,
    rate_limit: `Soy del equipo comercial de Urban Sport Store. Estamos atendiendo muchas consultas ahora mismo; espera un momento y seguimos buscando juntos, o te conectamos por WhatsApp.`,
    timeout: `Soy del equipo comercial de Urban Sport Store. La búsqueda tardó más de lo esperado; probemos otra consulta o revisemos las opciones del catálogo contigo.`,
    provider_error: `Soy del equipo comercial de Urban Sport Store. El buscador inteligente no está disponible ahora, pero podemos continuar con el catálogo y resolver tus dudas por WhatsApp.`,
  };
  return messages[reason];
}
