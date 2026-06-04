CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = ''
AS $$ BEGIN NEW.updated_at = pg_catalog.now(); RETURN NEW; END; $$;
