alter table public.products
	alter column shipping_weight_grams drop not null,
	alter column shipping_length_cm drop not null,
	alter column shipping_width_cm drop not null,
	alter column shipping_height_cm drop not null,
	alter column shipping_declared_value_cop drop not null,
	alter column shipping_units_per_guide drop not null;
