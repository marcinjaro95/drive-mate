-- ============================================================
-- DriveMate initial schema
-- Creates: vehicles, service_records
-- Enables RLS with 4 policies per table
-- Adds updated_at trigger and performance indexes
-- ============================================================

-- ------------------------------------------------------------
-- updated_at trigger function (shared by both tables)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ------------------------------------------------------------
-- vehicles
-- ------------------------------------------------------------
CREATE TABLE vehicles (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  make            text        NOT NULL,
  model           text        NOT NULL,
  year            integer     NOT NULL,
  engine_capacity numeric     NOT NULL,
  fuel_type       text        NOT NULL,
  vin             text,
  current_mileage integer,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vehicles_select" ON vehicles
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "vehicles_insert" ON vehicles
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "vehicles_update" ON vehicles
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "vehicles_delete" ON vehicles
  FOR DELETE USING (user_id = auth.uid());

CREATE INDEX ON vehicles(user_id);

CREATE TRIGGER vehicles_updated_at
  BEFORE UPDATE ON vehicles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ------------------------------------------------------------
-- service_records
-- ------------------------------------------------------------
CREATE TABLE service_records (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id   uuid        NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  service_date date        NOT NULL,
  mileage      integer     NOT NULL CHECK (mileage >= 0),
  label        text        NOT NULL,
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE service_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_records_select" ON service_records
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "service_records_insert" ON service_records
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "service_records_update" ON service_records
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "service_records_delete" ON service_records
  FOR DELETE USING (user_id = auth.uid());

CREATE INDEX ON service_records(vehicle_id);
CREATE INDEX ON service_records(user_id);

CREATE TRIGGER service_records_updated_at
  BEFORE UPDATE ON service_records
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
