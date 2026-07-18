import React from 'react';

export const ResponsiveContainer: React.FC<any> = ({ children, width, height }) => (
  <div style={{ width: width === '100%' ? '100%' : width, height: height === '100%' ? '100%' : height }}>{children}</div>
);
export const AreaChart: React.FC<any> = ({ children }) => <div>{children}</div>;
export const Area: React.FC<any> = () => null;
export const BarChart: React.FC<any> = ({ children }) => <div>{children}</div>;
export const Bar: React.FC<any> = () => null;
export const XAxis: React.FC<any> = () => null;
export const YAxis: React.FC<any> = () => null;
export const CartesianGrid: React.FC<any> = () => null;
export const Tooltip: React.FC<any> = () => null;

export default {};
