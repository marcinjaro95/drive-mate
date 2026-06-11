-- Stable UUID column for tracing a service record back to the schedule item that prompted it.
-- Nullable: records predating this migration and manually created records have no linked item.
ALTER TABLE service_records ADD COLUMN schedule_item_id uuid DEFAULT NULL;

-- Backfill: assign gen_random_uuid() to each existing ai_schedule item missing an 'id' key.
-- Items already carrying an 'id' are left untouched (idempotent if run more than once).
UPDATE vehicles
SET ai_schedule = (
  SELECT jsonb_agg(
    CASE
      WHEN item ? 'id' THEN item
      ELSE item || jsonb_build_object('id', gen_random_uuid()::text)
    END
  )
  FROM jsonb_array_elements(ai_schedule) AS item
)
WHERE ai_schedule IS NOT NULL AND jsonb_typeof(ai_schedule) = 'array';
