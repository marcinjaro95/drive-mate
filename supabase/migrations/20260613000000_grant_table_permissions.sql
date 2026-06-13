-- Grant table-level DML permissions to the authenticated role.
-- The anon role is included for the SELECT grant so the public API can read
-- rows that RLS policies explicitly open (none exist today, but the pattern
-- is standard and prevents surprise permission errors on future public tables).
-- RLS policies are the enforcement layer; these grants are the prerequisite
-- that allows PostgREST to even evaluate the policies.

GRANT SELECT, INSERT, UPDATE, DELETE ON vehicles TO authenticated;
GRANT SELECT ON vehicles TO anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON service_records TO authenticated;
GRANT SELECT ON service_records TO anon;
