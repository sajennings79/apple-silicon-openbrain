CREATE INDEX IF NOT EXISTS "idx_memories_source_sourceid" ON "memories" USING btree ("source", "source_id");
