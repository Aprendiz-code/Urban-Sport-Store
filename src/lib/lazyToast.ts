export const toast = {
  success: (msg: string) => import('sonner').then((m) => {
    const toastApi = (m as { toast?: { success?: (msg: string) => unknown } }).toast;
    return (toastApi?.success ?? ((s: string) => console.log(s)))(msg);
  }).catch(() => console.log('[toast]', msg)),
  error: (msg: string) => import('sonner').then((m) => {
    const toastApi = (m as { toast?: { error?: (msg: string) => unknown } }).toast;
    return (toastApi?.error ?? ((s: string) => console.error(s)))(msg);
  }).catch(() => console.error('[toast]', msg)),
  warn: (msg: string) => import('sonner').then((m) => {
    const toastApi = (m as { toast?: { warn?: (msg: string) => unknown } }).toast;
    return (toastApi?.warn ?? ((s: string) => console.warn(s)))(msg);
  }).catch(() => console.warn('[toast]', msg)),
  info: (msg: string) => import('sonner').then((m) => {
    const toastApi = (m as { toast?: { info?: (msg: string) => unknown } }).toast;
    return (toastApi?.info ?? ((s: string) => console.log(s)))(msg);
  }).catch(() => console.log('[toast]', msg)),
};

export default toast;
