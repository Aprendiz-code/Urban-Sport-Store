import React from 'react';

export const Toaster: React.FC<any> = ({ children, ...props }) => (
  <div data-sonner-toaster {...props}>{children}</div>
);

export const toast = {
  success: (msg: string) => console.log('[toast success]', msg),
  error: (msg: string) => console.error('[toast error]', msg),
  warn: (msg: string) => console.warn('[toast warn]', msg),
};

export default { Toaster, toast };
