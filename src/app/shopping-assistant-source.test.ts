import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const appSource = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8');
const assistantSource = readFileSync(new URL('./components/ShoppingAssistant.tsx', import.meta.url), 'utf8');

describe('shopping assistant UI contract', () => {
  it('mounts the assistant once in App', () => {
    expect(appSource.match(/<ShoppingAssistant \/>/g)).toHaveLength(1);
  });

  it('shows the required labels and quick actions', () => {
    expect(assistantSource).toContain('¿Te ayudamos?');
    expect(assistantSource).toContain('Asistente Urban Sport');
    expect(assistantSource).toContain('Buscar tenis');
    expect(assistantSource).toContain('Consultar tallas');
    expect(assistantSource).toContain('Envíos y pagos');
    expect(assistantSource).toContain('Cambios y devoluciones');
  });

  it('uses the exact WhatsApp number and prepared encoded message', () => {
    expect(assistantSource).toContain('https://wa.me/573157760273?text=');
    expect(assistantSource).toContain('Hola%2C%20vengo%20de%20Urban%20Sport%20Store%20y%20necesito%20ayuda%20con%20una%20compra.');
  });

  it('implements Escape and focus handling', () => {
    expect(assistantSource).toContain("event.key === 'Escape'");
    expect(assistantSource).toContain('triggerRef.current?.focus()');
  });

  it('uses a warm Urban Sport Store greeting', () => {
    expect(assistantSource).toContain('Soy del equipo comercial de Urban Sport Store');
    expect(assistantSource).toContain('opción ideal');
  });

  it('expires conversation history after seven minutes of inactivity', () => {
    expect(assistantSource).toContain('const INACTIVITY_LIMIT_MS = 7 * 60 * 1000');
    expect(assistantSource).toContain('resetInactivityTimer');
    expect(assistantSource).toContain('setMessages([{ role: \'assistant\', text: INITIAL_ASSISTANT_MESSAGE }])');
  });

  it('does not use robotic provider identity in the chat UI', () => {
    expect(assistantSource).not.toContain('Powered by');
    expect(assistantSource).not.toContain('El asistente con IA');
  });

  it('does not expose provider or source labels in conversations', () => {
    expect(assistantSource).not.toContain("groq: 'Groq'");
    expect(assistantSource).not.toContain('Groq",');
    expect(assistantSource).not.toContain('Política verificable');
    expect(assistantSource).not.toContain('Respuesta de respaldo');
  });

  it('moves the conversation viewport only when a new message is added', () => {
    expect(assistantSource).toContain('messagesRef.current');
    expect(assistantSource).toContain('container.scrollTo({ top: container.scrollHeight, behavior: \'smooth\' })');
    expect(assistantSource).toMatch(/\}, \[messages\]\);/);
  });

  it('does not expose Groq secrets in frontend code', () => {
    expect(assistantSource).not.toContain('GROQ_API_KEY');
    expect(assistantSource).not.toContain('gsk_');
  });
});
