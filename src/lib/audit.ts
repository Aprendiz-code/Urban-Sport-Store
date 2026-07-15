export interface AuditEntry { id: string; ts: number; action: string; meta?: Record<string, any> }

const KEY = 'urbansport_audit_log_v1';

export const recordAction = (action: string, meta: Record<string, any> = {}) => {
  try {
    const raw = localStorage.getItem(KEY) ?? '[]';
    const arr: AuditEntry[] = JSON.parse(raw);
    const entry: AuditEntry = { id: `${Date.now()}-${Math.random().toString(36).slice(2,8)}`, ts: Date.now(), action, meta };
    arr.unshift(entry);
    localStorage.setItem(KEY, JSON.stringify(arr.slice(0, 200)));
    return entry;
  } catch (e) {
    console.warn('Could not record audit', e);
    return null;
  }
};

export const getAudit = (limit = 50): AuditEntry[] => {
  try {
    const raw = localStorage.getItem(KEY) ?? '[]';
    const arr: AuditEntry[] = JSON.parse(raw);
    return arr.slice(0, limit);
  } catch (e) {
    return [];
  }
};
