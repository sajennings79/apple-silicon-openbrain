-- Harden chk_memories_instruction_grade against a NULL bypass.
--
-- The original predicate `provenance_status IN ('user_confirmed','imported')`
-- evaluates to NULL when provenance_status IS NULL, and PostgreSQL treats a CHECK
-- that evaluates to NULL as satisfied. That let can_use_as_instruction=true slip
-- through with a NULL provenance_status. COALESCE(..., false) closes the gap.

ALTER TABLE memories DROP CONSTRAINT IF EXISTS chk_memories_instruction_grade;

ALTER TABLE memories
  ADD CONSTRAINT chk_memories_instruction_grade
  CHECK (can_use_as_instruction IS NOT TRUE
         OR COALESCE(provenance_status IN ('user_confirmed', 'imported'), false));
