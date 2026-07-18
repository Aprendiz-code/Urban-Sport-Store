import React from 'react';

const make = (name: string) => {
  const C: React.FC<any> = (props) => <svg {...props} width={props.size ?? 16} height={props.size ?? 16} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="none"/><title>{name}</title></svg>;
  return C;
};

export const ShoppingCart = make('ShoppingCart');
export const Search = make('Search');
export const Menu = make('Menu');
export const X = make('X');
export const Star = make('Star');
export const ChevronRight = make('ChevronRight');
export const Package = make('Package');
export const Users = make('Users');
export const TrendingUp = make('TrendingUp');
export const AlertTriangle = make('AlertTriangle');
export const Check = make('Check');
export const Eye = make('Eye');
export const EyeOff = make('EyeOff');
export const Bell = make('Bell');
export const LogOut = make('LogOut');
export const Plus = make('Plus');
export const Minus = make('Minus');
export const Trash2 = make('Trash2');
export const MapPin = make('MapPin');
export const CreditCard = make('CreditCard');
export const Shield = make('Shield');
export const Truck = make('Truck');
export const ChevronLeft = make('ChevronLeft');
export const Heart = make('Heart');
export const ArrowRight = make('ArrowRight');
export const Filter = make('Filter');
export const BarChart2 = make('BarChart2');
export const Home = make('Home');
export const Settings = make('Settings');
export const Tag = make('Tag');
export const Layers = make('Layers');
export const Edit = make('Edit');
export const RefreshCw = make('RefreshCw');
export const Award = make('Award');
export const Grid3X3 = make('Grid3X3');
export const ThumbsUp = make('ThumbsUp');
export const DollarSign = make('DollarSign');

export default {};
