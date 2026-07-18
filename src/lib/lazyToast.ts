export const toast = {
  success: (msg: string) => import('sonner').then((m) => (m.toast?.success ?? ((s: string) => console.log(s)))(msg)).catch(() => console.log('[toast]', msg)),
  error: (msg: string) => import('sonner').then((m) => (m.toast?.error ?? ((s: string) => console.error(s)))(msg)).catch(() => console.error('[toast]', msg)),
  warn: (msg: string) => import('sonner').then((m) => (m.toast?.warn ?? ((s: string) => console.warn(s)))(msg)).catch(() => console.warn('[toast]', msg)),
  info: (msg: string) => import('sonner').then((m) => (m.toast?.info ?? ((s: string) => console.log(s)))(msg)).catch(() => console.log('[toast]', msg)),
};

export default toast;
