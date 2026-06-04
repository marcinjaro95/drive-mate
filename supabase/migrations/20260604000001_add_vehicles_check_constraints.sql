ALTER TABLE vehicles ADD CONSTRAINT year_range
  CHECK (year BETWEEN 1886 AND 2100);

ALTER TABLE vehicles ADD CONSTRAINT engine_capacity_positive
  CHECK (engine_capacity > 0);

ALTER TABLE vehicles ADD CONSTRAINT fuel_type_values
  CHECK (fuel_type IN ('gasoline', 'diesel', 'electric', 'hybrid', 'lpg'));
