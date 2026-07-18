import React, { Suspense } from 'react';

const Lazy = (factory: () => Promise<any>, name: string) => {
  const Comp = React.lazy(() => factory().then((m) => ({ default: m[name] })));
  return (props: any) => (
    <Suspense fallback={null}>
      <Comp {...props} />
    </Suspense>
  );
};

export const ResponsiveContainer = Lazy(() => import('recharts'), 'ResponsiveContainer');
export const AreaChart = Lazy(() => import('recharts'), 'AreaChart');
export const Area = Lazy(() => import('recharts'), 'Area');
export const BarChart = Lazy(() => import('recharts'), 'BarChart');
export const Bar = Lazy(() => import('recharts'), 'Bar');
export const XAxis = Lazy(() => import('recharts'), 'XAxis');
export const YAxis = Lazy(() => import('recharts'), 'YAxis');
export const CartesianGrid = Lazy(() => import('recharts'), 'CartesianGrid');
export const Tooltip = Lazy(() => import('recharts'), 'Tooltip');

export default {};
