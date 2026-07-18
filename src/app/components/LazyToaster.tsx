import React, { Suspense } from 'react';

const ToasterLazy = React.lazy(() => import('sonner').then((m) => ({ default: m.Toaster })));

export default function LazyToaster(props: any) {
  return (
    <Suspense fallback={null}>
      <ToasterLazy {...props} />
    </Suspense>
  );
}
